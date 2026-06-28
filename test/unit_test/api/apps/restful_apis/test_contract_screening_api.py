#
#  Copyright 2026 The InfiniFlow Authors. All Rights Reserved.
#
#  Licensed under the Apache License, Version 2.0 (the "License");
#  you may not use this file except in compliance with the License.
#  You may obtain a copy of the License at
#
#      http://www.apache.org/licenses/LICENSE-2.0
#
#  Unless required by applicable law or agreed to in writing, software
#  distributed under the License is distributed on an "AS IS" BASIS,
#  WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
#  See the License for the specific language governing permissions and
#  limitations under the License.
#

import asyncio
import importlib.util
import sys
from pathlib import Path
from types import ModuleType, SimpleNamespace


class _PassthroughManager:
    def route(self, *_args, **_kwargs):
        return lambda func: func


class FakeStore:
    def __init__(self, tasks=None):
        self.tasks = dict(tasks or {})
        self.saved = []

    def save(self, task):
        self.saved.append(task)
        self.tasks[(task["tenant_id"], task["task_id"])] = task
        return True

    def get(self, tenant_id, task_id):
        return self.tasks.get((tenant_id, task_id))


def _stub(monkeypatch, name, **attrs):
    mod = ModuleType(name)
    for key, value in attrs.items():
        setattr(mod, key, value)
    monkeypatch.setitem(sys.modules, name, mod)
    return mod


def _load_api(monkeypatch):
    repo_root = Path(__file__).resolve().parents[5]

    class ContractScreeningError(Exception):
        def __init__(self, message):
            super().__init__(message)
            self.message = message

    def validate_create_task_request(req):
        kb_id = str(req.get("kb_id") or "").strip()
        if not kb_id:
            raise ContractScreeningError("`kb_id` is required")
        prompt = str(req.get("prompt") or "").strip()
        if not prompt:
            raise ContractScreeningError("`prompt` is required")
        filters = {"risk": "全部", "status": "全部", "source": "全部"}
        filters.update(req.get("filters") or {})
        return {"kb_id": kb_id, "prompt": prompt, "filters": filters}

    def create_initial_task(**kwargs):
        return {
            **kwargs,
            "status": "pending",
            "phase": "parse_prompt",
            "progress": 0.0,
            "message": "等待开始筛选",
            "strategy": {},
            "items": [],
            "skipped": {},
            "error": "",
        }

    apps = _stub(
        monkeypatch,
        "api.apps",
        current_user=SimpleNamespace(id="user-1"),
        login_required=lambda func: func,
    )
    apps.__path__ = [str(repo_root / "api" / "apps")]

    _stub(
        monkeypatch,
        "api.db.services.knowledgebase_service",
        KnowledgebaseService=SimpleNamespace(accessible=lambda **_kwargs: True),
    )
    _stub(
        monkeypatch,
        "api.apps.services.contract_screening_service",
        ContractScreeningError=ContractScreeningError,
        ContractScreeningStore=FakeStore,
        create_initial_task=create_initial_task,
        new_task_id=lambda: "generated-task-id",
        run_screening_task=lambda *_args, **_kwargs: None,
        validate_create_task_request=validate_create_task_request,
    )
    _stub(
        monkeypatch,
        "api.utils.api_utils",
        add_tenant_id_to_kwargs=lambda func: func,
        get_error_argument_result=lambda message="Invalid arguments": {
            "code": 101,
            "message": message,
        },
        get_error_data_result=lambda message="Sorry! Data missing!", code=102: {
            "code": code,
            "message": message,
        },
        get_request_json=lambda: {},
        get_result=lambda code=0, message="", data=None, total=None: {
            key: value
            for key, value in {
                "code": code,
                "message": message,
                "data": data,
                "total_datasets": total,
            }.items()
            if value is not None and (key != "message" or message)
        },
    )

    module_path = repo_root / "api" / "apps" / "restful_apis" / "contract_screening_api.py"
    spec = importlib.util.spec_from_file_location("test_contract_screening_api_module", module_path)
    module = importlib.util.module_from_spec(spec)
    module.manager = _PassthroughManager()
    monkeypatch.setitem(sys.modules, "test_contract_screening_api_module", module)
    spec.loader.exec_module(module)
    return module


def _run(coro):
    return asyncio.run(coro)


def test_create_task_saves_initial_task_and_starts_background(monkeypatch):
    module = _load_api(monkeypatch)
    payload = {
        "kb_id": "kb-1",
        "prompt": "筛选付款周期超过60天的合同",
        "filters": {"risk": "高"},
    }
    store = FakeStore()
    started = []

    async def fake_request_json():
        return payload

    monkeypatch.setattr(module, "current_user", SimpleNamespace(id="user-1"))
    monkeypatch.setattr(module, "get_request_json", fake_request_json)
    monkeypatch.setattr(module.KnowledgebaseService, "accessible", lambda kb_id, user_id: True)
    monkeypatch.setattr(module, "new_task_id", lambda: "task-1")
    monkeypatch.setattr(module, "ContractScreeningStore", lambda: store)
    monkeypatch.setattr(
        module,
        "_start_background_task",
        lambda tenant_id, task_id: started.append((tenant_id, task_id)),
    )

    result = _run(module.create_task(tenant_id="tenant-1"))

    assert result == {"code": 0, "data": {"task_id": "task-1"}}
    assert started == [("tenant-1", "task-1")]
    assert len(store.saved) == 1
    saved = store.saved[0]
    assert saved["task_id"] == "task-1"
    assert saved["tenant_id"] == "tenant-1"
    assert saved["user_id"] == "user-1"
    assert saved["kb_id"] == "kb-1"
    assert saved["prompt"] == "筛选付款周期超过60天的合同"


def test_create_task_returns_argument_error_when_prompt_missing(monkeypatch):
    module = _load_api(monkeypatch)

    async def fake_request_json():
        return {"kb_id": "kb-1"}

    monkeypatch.setattr(module, "get_request_json", fake_request_json)

    result = _run(module.create_task(tenant_id="tenant-1"))

    assert result == {"code": 101, "message": "`prompt` is required"}


def test_create_task_returns_data_error_when_dataset_inaccessible(monkeypatch):
    module = _load_api(monkeypatch)

    async def fake_request_json():
        return {"kb_id": "kb-1", "prompt": "筛选合同"}

    monkeypatch.setattr(module, "get_request_json", fake_request_json)
    monkeypatch.setattr(module.KnowledgebaseService, "accessible", lambda kb_id, user_id: False)

    result = _run(module.create_task(tenant_id="tenant-1"))

    assert result["code"] == 102
    assert "You don't own the dataset" in result["message"]


def test_get_task_returns_progress_fields(monkeypatch):
    module = _load_api(monkeypatch)
    store = FakeStore({
        ("tenant-1", "task-1"): {
            "task_id": "task-1",
            "status": "running",
            "phase": "review_evidence",
            "progress": 0.68,
            "message": "正在复核合同证据",
            "error": "",
        }
    })
    monkeypatch.setattr(module, "ContractScreeningStore", lambda: store)

    result = _run(module.get_task("task-1", tenant_id="tenant-1"))

    assert result == {
        "code": 0,
        "data": {
            "task_id": "task-1",
            "status": "running",
            "phase": "review_evidence",
            "progress": 0.68,
            "message": "正在复核合同证据",
            "error": "",
        },
    }


def test_get_results_returns_screening_payload(monkeypatch):
    module = _load_api(monkeypatch)
    task = {
        "task_id": "task-1",
        "prompt": "筛选合同",
        "strategy": {"query": "筛选合同", "conditions": []},
        "items": [{"contract_id": "doc-1"}],
        "skipped": {"unparsed": 1},
        "status": "done",
    }
    store = FakeStore({("tenant-1", "task-1"): task})
    monkeypatch.setattr(module, "ContractScreeningStore", lambda: store)

    result = _run(module.get_results("task-1", tenant_id="tenant-1"))

    assert result == {
        "code": 0,
        "data": {
            "task_id": "task-1",
            "prompt": "筛选合同",
            "strategy": {"query": "筛选合同", "conditions": []},
            "items": [{"contract_id": "doc-1"}],
            "skipped": {"unparsed": 1},
            "status": "done",
        },
    }


def test_get_results_defaults_strategy_to_dict(monkeypatch):
    module = _load_api(monkeypatch)
    task = {"task_id": "task-1", "prompt": "筛选合同", "status": "pending"}
    store = FakeStore({("tenant-1", "task-1"): task})
    monkeypatch.setattr(module, "ContractScreeningStore", lambda: store)

    result = _run(module.get_results("task-1", tenant_id="tenant-1"))

    assert result["data"]["strategy"] == {}
    assert result["data"]["items"] == []
    assert result["data"]["skipped"] == {}


def test_get_task_returns_data_error_when_task_missing(monkeypatch):
    module = _load_api(monkeypatch)
    monkeypatch.setattr(module, "ContractScreeningStore", lambda: FakeStore())

    result = _run(module.get_task("missing", tenant_id="tenant-1"))

    assert result == {"code": 102, "message": "Task not found"}


def test_get_results_returns_data_error_when_task_missing(monkeypatch):
    module = _load_api(monkeypatch)
    monkeypatch.setattr(module, "ContractScreeningStore", lambda: FakeStore())

    result = _run(module.get_results("missing", tenant_id="tenant-1"))

    assert result == {"code": 102, "message": "Task not found"}
