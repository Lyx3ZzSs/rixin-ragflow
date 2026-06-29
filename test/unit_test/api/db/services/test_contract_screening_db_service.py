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
from types import SimpleNamespace

from api.db.services import contract_screening_service


class _FakeCondition:
    def __and__(self, other):
        return other


class _FakeField:
    def __init__(self, name):
        self.name = name

    def __eq__(self, _other):
        return _FakeCondition()

    def desc(self):
        return (self.name, "desc")


class _FakeTaskQuery:
    def __init__(self, rows):
        self.rows = list(rows)
        self.conditions = []
        self.ordering = []
        self.page = None

    def where(self, *conditions):
        self.conditions.extend(conditions)
        return self

    def order_by(self, *ordering):
        self.ordering.extend(ordering)
        return self

    def count(self):
        return len(self.rows)

    def paginate(self, page, page_size):
        self.page = (page, page_size)
        start = (page - 1) * page_size
        self.rows = self.rows[start:start + page_size]
        return self

    def dicts(self):
        return self.rows


class _FakeContext:
    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return False


class _FakeDeleteQuery:
    def __init__(self, model):
        self.model = model

    def where(self, *_conditions):
        return self

    def execute(self):
        self.model.deleted += 1
        return 1


class _FakeInsertQuery:
    def __init__(self, model, rows):
        self.model = model
        self.rows = rows

    def execute(self):
        self.model.inserted.extend(self.rows)
        return len(self.rows)


class _FakeScreeningModel:
    tenant_id = _FakeField("tenant_id")
    task_id = _FakeField("task_id")

    def __init__(self):
        self.deleted = 0
        self.inserted = []

    def delete(self):
        return _FakeDeleteQuery(self)

    def insert_many(self, rows):
        return _FakeInsertQuery(self, rows)


def test_list_tasks_filters_by_tenant_and_user(monkeypatch):
    rows = [
        {
            "id": "task-1",
            "tenant_id": "tenant-1",
            "user_id": "user-1",
            "kb_id": "kb-1",
            "prompt": "筛选合同",
            "status": "done",
            "phase": "generate_summary",
            "progress": 1.0,
            "message": "筛选完成",
            "item_count": 2,
            "create_time": 10,
            "update_time": 11,
            "finished_at": 12,
        }
    ]
    query = _FakeTaskQuery(rows)
    model = SimpleNamespace(
        select=lambda: query,
        tenant_id=_FakeField("tenant_id"),
        user_id=_FakeField("user_id"),
        create_time=_FakeField("create_time"),
    )
    monkeypatch.setattr(contract_screening_service.DB, "connect", lambda *args, **kwargs: None)
    monkeypatch.setattr(contract_screening_service.DB, "close", lambda *args, **kwargs: None)
    monkeypatch.setattr(contract_screening_service.ContractScreeningTaskService, "model", model)

    result = contract_screening_service.ContractScreeningTaskService.list_tasks(
        tenant_id="tenant-1",
        user_id="user-1",
        page=1,
        page_size=20,
    )

    assert result["total"] == 1
    assert result["items"] == [{
        "task_id": "task-1",
        "kb_id": "kb-1",
        "prompt": "筛选合同",
        "status": "done",
        "phase": "generate_summary",
        "progress": 1.0,
        "message": "筛选完成",
        "item_count": 2,
        "created_at": 10,
        "updated_at": 11,
        "finished_at": 12,
    }]
    assert query.page == (1, 20)
    assert query.ordering == [("create_time", "desc")]


def test_persist_completed_task_writes_records_inside_existing_transaction(monkeypatch):
    result_model = _FakeScreeningModel()
    evidence_model = _FakeScreeningModel()
    monkeypatch.setattr(contract_screening_service.DB, "connection_context", lambda: _FakeContext())
    monkeypatch.setattr(contract_screening_service.DB, "atomic", lambda: _FakeContext())
    monkeypatch.setattr(contract_screening_service.ContractScreeningTaskService, "upsert_task", lambda _task: None)
    monkeypatch.setattr(
        contract_screening_service.ContractScreeningResultService,
        "insert_many",
        lambda _rows: (_ for _ in ()).throw(AssertionError("nested service insert_many must not be used")),
    )
    monkeypatch.setattr(
        contract_screening_service.ContractScreeningEvidenceService,
        "insert_many",
        lambda _rows: (_ for _ in ()).throw(AssertionError("nested service insert_many must not be used")),
    )
    monkeypatch.setattr(contract_screening_service, "ContractScreeningResult", result_model)
    monkeypatch.setattr(contract_screening_service, "ContractScreeningEvidence", evidence_model)

    contract_screening_service.persist_completed_task({
        "task_id": "task-1",
        "tenant_id": "tenant-1",
        "items": [{
            "id": "result-1",
            "contract_id": "doc-1",
            "name": "采购合同.pdf",
            "overall_status": "matched",
            "meta": {"risk": "高", "score": 91},
            "evidence": [{"chunk_id": "chunk-1", "text": "付款期限90天"}],
        }],
    })

    assert result_model.deleted == 1
    assert evidence_model.deleted == 1
    assert len(result_model.inserted) == 1
    assert len(evidence_model.inserted) == 1
    assert result_model.inserted[0]["create_time"] == evidence_model.inserted[0]["create_time"]
    assert result_model.inserted[0]["update_date"] == evidence_model.inserted[0]["update_date"]


def test_result_and_evidence_payloads_preserve_frontend_shape():
    result = contract_screening_service.result_record_from_item(
        task_id="task-1",
        tenant_id="tenant-1",
        item={
            "id": "result-1",
            "contract_id": "doc-1",
            "name": "采购合同.pdf",
            "overall_status": "matched",
            "meta": {"risk": "高", "score": 91},
            "matched_conditions": [{"label": "付款周期", "status": "matched"}],
            "evidence": [
                {"source": "合同正文", "ref": "第3页 / chunk-1", "text": "付款期限90天", "page": 3, "chunk_id": "chunk-1"}
            ],
        },
    )
    evidence = contract_screening_service.evidence_records_from_item(
        task_id="task-1",
        tenant_id="tenant-1",
        result_id=result["id"],
        item={"contract_id": "doc-1", "evidence": [{"source": "合同正文", "ref": "第3页 / chunk-1", "text": "付款期限90天", "page": 3, "chunk_id": "chunk-1"}]},
    )

    assert result["task_id"] == "task-1"
    assert result["tenant_id"] == "tenant-1"
    assert result["document_id"] == "doc-1"
    assert result["title"] == "采购合同.pdf"
    assert result["status"] == "matched"
    assert result["risk"] == "高"
    assert result["score"] == 91
    assert result["meta"]["score"] == 91
    assert result["matched_conditions"][0]["label"] == "付款周期"
    assert evidence == [{
        "task_id": "task-1",
        "tenant_id": "tenant-1",
        "result_id": result["id"],
        "document_id": "doc-1",
        "chunk_id": "chunk-1",
        "source": "合同正文",
        "ref": "第3页 / chunk-1",
        "page": 3,
        "text": "付款期限90天",
        "score": None,
        "condition_id": "",
    }]


def test_build_results_payload_filters_task_by_user(monkeypatch):
    calls = []
    monkeypatch.setattr(
        contract_screening_service.ContractScreeningTaskService,
        "get_task",
        lambda **kwargs: calls.append(kwargs) or None,
    )

    result = contract_screening_service.build_results_payload("tenant-1", "task-1", user_id="user-1")

    assert result is None
    assert calls == [{"tenant_id": "tenant-1", "task_id": "task-1", "user_id": "user-1"}]
