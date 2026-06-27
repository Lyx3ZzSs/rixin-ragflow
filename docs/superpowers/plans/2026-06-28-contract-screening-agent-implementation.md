# 合同智能筛选 Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 基于现有 Open Design 原型实现合同智能筛选 Agent，用户登录后进入 `/contract-agent`，输入自然语言 Prompt 后调用 RAGFlow 后端完成合同筛选并返回合同列表优先的证据结果。

**Architecture:** 前端源码独立放在 `contract-agent-web/`，由 Vite 构建，生产挂载到同站点 `/contract-agent`。后端新增 `contract_screening` REST API，使用 Redis 保存筛选任务状态和结果，复用 RAGFlow 登录、知识库权限、检索、Chunks、LLM 和远程 PaddleOCR 解析链路。

**Tech Stack:** Python 3.13, Quart, Redis/Valkey, RAGFlow dataset search, React 19, Vite 7, Node test runner, Nginx static mount.

---

## File Structure

Create or modify these files only for Phase 1:

- Create `api/apps/services/contract_screening_service.py`
  - Pure screening domain logic, Redis task store, task status transitions, retrieval orchestration, result normalization.
- Create `api/apps/restful_apis/contract_screening_api.py`
  - REST endpoints for task creation, status, and results.
- Create `test/unit_test/api/apps/services/test_contract_screening_service.py`
  - Unit tests for prompt validation, Redis store behavior, parsed-document filtering, chunk grouping, evidence mapping, and result normalization.
- Create `test/unit_test/api/apps/restful_apis/test_contract_screening_api.py`
  - API route tests with mocked service functions.
- Create `contract-agent-web/`
  - Copy the Open Design Vite React prototype into this directory.
- Modify `contract-agent-web/package.json`
  - Keep Vite scripts and add API-driven tests.
- Modify `contract-agent-web/vite.config.js`
  - Set `base: "/contract-agent/"` and dev proxy to RAGFlow API.
- Create `contract-agent-web/src/api.js`
  - Contract screening API client.
- Create `contract-agent-web/src/api.test.js`
  - API adapter and mapper tests.
- Modify `contract-agent-web/src/App.jsx`
  - Replace mock `smartFilter` flow with backend task creation, polling, result loading, and local task history.
- Modify `contract-agent-web/src/logic.js`
  - Keep presentational helpers; replace local filter helpers with backend result mapping helpers.
- Modify `contract-agent-web/src/logic.test.js`
  - Update tests for backend-shaped result mapping.
- Create `web/src/utils/contract-agent-config.ts`
  - Feature flag and route helpers for login redirect.
- Modify `web/src/pages/login-next/index.tsx`
  - Redirect to `/contract-agent` after login when enabled.
- Create `web/src/utils/contract-agent-config.test.ts`
  - Tests for route helper behavior.
- Modify `docker/nginx/ragflow.conf.python`
  - Serve `/contract-agent` static assets before the root SPA fallback.
- Modify `docker/nginx/ragflow.https.conf`
  - Same `/contract-agent` static mount for HTTPS config.
- Modify `docker/nginx/ragflow.conf.hybrid`
  - Same mount for hybrid deployment.
- Modify `docker/nginx/ragflow.conf.golang`
  - Same mount for golang deployment.
- Modify `Dockerfile`
  - Build `contract-agent-web` and copy its `dist` to the runtime image path used by Nginx.

Do not commit `conf/service_conf.yaml` because it may contain local PaddleOCR credentials.

---

## Task 1: Backend Pure Logic and Redis Task Store

**Files:**
- Create: `api/apps/services/contract_screening_service.py`
- Create: `test/unit_test/api/apps/services/test_contract_screening_service.py`

- [ ] **Step 1: Write failing tests for prompt validation and task store**

Create `test/unit_test/api/apps/services/test_contract_screening_service.py` with:

```python
import json

import pytest

from api.apps.services.contract_screening_service import (
    ContractScreeningError,
    ContractScreeningStore,
    create_initial_task,
    validate_create_task_request,
)


class FakeRedis:
    def __init__(self):
        self.values = {}

    def set_obj(self, key, obj, exp=3600):
        self.values[key] = json.dumps(obj, ensure_ascii=False)
        return True

    def get(self, key):
        return self.values.get(key)


def test_validate_create_task_request_requires_kb_id():
    with pytest.raises(ContractScreeningError) as exc:
        validate_create_task_request({"prompt": "筛选付款周期超过60天的合同"})
    assert exc.value.message == "`kb_id` is required"


def test_validate_create_task_request_requires_prompt():
    with pytest.raises(ContractScreeningError) as exc:
        validate_create_task_request({"kb_id": "kb-1", "prompt": "  "})
    assert exc.value.message == "`prompt` is required"


def test_validate_create_task_request_normalizes_filters():
    payload = validate_create_task_request({
        "kb_id": "kb-1",
        "prompt": "筛选付款周期超过60天的合同",
        "filters": {"risk": "高"},
    })
    assert payload["kb_id"] == "kb-1"
    assert payload["prompt"] == "筛选付款周期超过60天的合同"
    assert payload["filters"] == {"risk": "高", "status": "全部", "source": "全部"}


def test_store_roundtrips_task():
    redis = FakeRedis()
    store = ContractScreeningStore(redis=redis, ttl_seconds=60)
    task = create_initial_task(
        task_id="task-1",
        tenant_id="tenant-1",
        user_id="user-1",
        kb_id="kb-1",
        prompt="筛选付款周期超过60天的合同",
        filters={"risk": "全部", "status": "全部", "source": "全部"},
    )
    store.save(task)
    loaded = store.get("tenant-1", "task-1")
    assert loaded["task_id"] == "task-1"
    assert loaded["status"] == "pending"
    assert loaded["phase"] == "parse_prompt"
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
.venv/bin/python -m pytest test/unit_test/api/apps/services/test_contract_screening_service.py -q
```

Expected: fail with `ModuleNotFoundError: No module named 'api.apps.services.contract_screening_service'`.

- [ ] **Step 3: Implement minimal service store and validation**

Create `api/apps/services/contract_screening_service.py` with:

```python
import json
import time
from dataclasses import asdict, dataclass, field
from typing import Any

from common.misc_utils import get_uuid
from rag.utils.redis_conn import REDIS_CONN


DEFAULT_FILTERS = {"risk": "全部", "status": "全部", "source": "全部"}
TASK_TTL_SECONDS = 60 * 60 * 24


class ContractScreeningError(Exception):
    def __init__(self, message: str):
        super().__init__(message)
        self.message = message


@dataclass
class ContractScreeningTask:
    task_id: str
    tenant_id: str
    user_id: str
    kb_id: str
    prompt: str
    filters: dict[str, str]
    status: str = "pending"
    phase: str = "parse_prompt"
    progress: float = 0.0
    message: str = "等待开始筛选"
    strategy: list[str] = field(default_factory=list)
    items: list[dict[str, Any]] = field(default_factory=list)
    skipped: dict[str, int] = field(default_factory=dict)
    error: str = ""
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)


def _task_key(tenant_id: str, task_id: str) -> str:
    return f"contract_screening:{tenant_id}:{task_id}"


def validate_create_task_request(req: dict[str, Any]) -> dict[str, Any]:
    kb_id = str(req.get("kb_id") or "").strip()
    if not kb_id:
        raise ContractScreeningError("`kb_id` is required")

    prompt = str(req.get("prompt") or "").strip()
    if not prompt:
        raise ContractScreeningError("`prompt` is required")

    filters = dict(DEFAULT_FILTERS)
    incoming_filters = req.get("filters") or {}
    if isinstance(incoming_filters, dict):
        for key in filters:
            value = incoming_filters.get(key)
            if isinstance(value, str) and value.strip():
                filters[key] = value.strip()

    return {"kb_id": kb_id, "prompt": prompt, "filters": filters}


def create_initial_task(
    task_id: str,
    tenant_id: str,
    user_id: str,
    kb_id: str,
    prompt: str,
    filters: dict[str, str],
) -> dict[str, Any]:
    return asdict(
        ContractScreeningTask(
            task_id=task_id,
            tenant_id=tenant_id,
            user_id=user_id,
            kb_id=kb_id,
            prompt=prompt,
            filters=filters,
        )
    )


class ContractScreeningStore:
    def __init__(self, redis=REDIS_CONN, ttl_seconds: int = TASK_TTL_SECONDS):
        self.redis = redis
        self.ttl_seconds = ttl_seconds

    def save(self, task: dict[str, Any]) -> None:
        task["updated_at"] = time.time()
        ok = self.redis.set_obj(
            _task_key(task["tenant_id"], task["task_id"]),
            task,
            exp=self.ttl_seconds,
        )
        if not ok:
            raise ContractScreeningError("Failed to persist contract screening task")

    def get(self, tenant_id: str, task_id: str) -> dict[str, Any] | None:
        raw = self.redis.get(_task_key(tenant_id, task_id))
        if not raw:
            return None
        if isinstance(raw, bytes):
            raw = raw.decode("utf-8")
        return json.loads(raw)


def new_task_id() -> str:
    return get_uuid()
```

- [ ] **Step 4: Run tests and verify pass**

Run:

```bash
.venv/bin/python -m pytest test/unit_test/api/apps/services/test_contract_screening_service.py -q
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add api/apps/services/contract_screening_service.py test/unit_test/api/apps/services/test_contract_screening_service.py
git commit -m "feat(contract-agent): add screening task store"
```

---

## Task 2: Backend Screening Result Mapping

**Files:**
- Modify: `api/apps/services/contract_screening_service.py`
- Modify: `test/unit_test/api/apps/services/test_contract_screening_service.py`

- [ ] **Step 1: Add failing tests for strategy, grouping, and evidence mapping**

Append to `test/unit_test/api/apps/services/test_contract_screening_service.py`:

```python
from api.apps.services.contract_screening_service import (
    build_strategy,
    group_chunks_by_document,
    map_group_to_contract_result,
)


def test_build_strategy_mentions_prompt_terms():
    strategy = build_strategy("筛选付款周期超过60天且包含违约金条款的合同")
    assert strategy[0] == "字段过滤：限定已解析完成的合同文档"
    assert any("付款周期" in step for step in strategy)
    assert any("违约金" in step for step in strategy)


def test_group_chunks_by_document_uses_document_id():
    chunks = [
        {"document_id": "doc-1", "docnm_kwd": "A.pdf", "content": "付款周期90天"},
        {"doc_id": "doc-1", "doc_name": "A.pdf", "content_with_weight": "违约金为每日万分之五"},
        {"document_id": "doc-2", "docnm_kwd": "B.pdf", "content": "付款周期30天"},
    ]
    grouped = group_chunks_by_document(chunks)
    assert sorted(grouped) == ["doc-1", "doc-2"]
    assert len(grouped["doc-1"]) == 2


def test_map_group_to_contract_result_returns_contract_first_shape():
    result = map_group_to_contract_result(
        document_id="doc-1",
        chunks=[
            {
                "id": "chunk-1",
                "document_id": "doc-1",
                "docnm_kwd": "采购合同.pdf",
                "content": "付款期限为验收合格后90日内完成。",
                "positions": [[12, 1, 1, 1, 1]],
                "score": 0.91,
            }
        ],
        prompt="筛选付款周期超过60天的合同",
    )
    assert result["id"] == "doc-1"
    assert result["title"] == "采购合同.pdf"
    assert result["score"] == 91
    assert result["evidence"][0]["page"] == 12
    assert result["evidence"][0]["chunk_id"] == "chunk-1"
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
.venv/bin/python -m pytest test/unit_test/api/apps/services/test_contract_screening_service.py -q
```

Expected: fail because `build_strategy`, `group_chunks_by_document`, and `map_group_to_contract_result` are missing.

- [ ] **Step 3: Implement mapping helpers**

Append to `api/apps/services/contract_screening_service.py`:

```python
def build_strategy(prompt: str) -> list[str]:
    terms = []
    if "付款" in prompt or "账期" in prompt:
        terms.append("付款周期、账期")
    if "违约" in prompt or "违约金" in prompt:
        terms.append("违约金、逾期责任")
    if "续签" in prompt or "到期" in prompt:
        terms.append("续签、到期时间")
    if "补充协议" in prompt or "附件" in prompt:
        terms.append("补充协议、附件完整性")
    if not terms:
        terms.append("合同正文、审批和履约相关表达")
    return [
        "字段过滤：限定已解析完成的合同文档",
        f"语义召回：检索{','.join(terms)}相关条款",
        "证据复核：按合同聚合证据并判断条件是否满足",
        "综合排序：按命中条件、置信度和风险等级排序",
    ]


def _chunk_document_id(chunk: dict[str, Any]) -> str:
    return str(chunk.get("document_id") or chunk.get("doc_id") or "").strip()


def _chunk_document_name(chunk: dict[str, Any]) -> str:
    return str(chunk.get("docnm_kwd") or chunk.get("doc_name") or chunk.get("document_name") or "未命名合同")


def _chunk_text(chunk: dict[str, Any]) -> str:
    return str(chunk.get("content") or chunk.get("content_with_weight") or chunk.get("text") or "").strip()


def _chunk_page(chunk: dict[str, Any]) -> int | None:
    positions = chunk.get("positions") or chunk.get("position_int") or []
    if positions and isinstance(positions[0], list) and positions[0]:
        try:
            return int(positions[0][0])
        except Exception:
            return None
    return None


def group_chunks_by_document(chunks: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    grouped: dict[str, list[dict[str, Any]]] = {}
    for chunk in chunks:
        document_id = _chunk_document_id(chunk)
        if not document_id:
            continue
        grouped.setdefault(document_id, []).append(chunk)
    return grouped


def map_group_to_contract_result(document_id: str, chunks: list[dict[str, Any]], prompt: str) -> dict[str, Any]:
    first = chunks[0] if chunks else {}
    evidence = []
    scores = []
    for chunk in chunks[:5]:
        text = _chunk_text(chunk)
        if not text:
            continue
        score = chunk.get("score") or chunk.get("similarity") or chunk.get("vector_similarity")
        if isinstance(score, (int, float)):
            scores.append(float(score))
        page = _chunk_page(chunk)
        chunk_id = str(chunk.get("id") or chunk.get("chunk_id") or "")
        evidence.append({
            "source": "合同正文",
            "ref": f"第{page}页 / {chunk_id}" if page else chunk_id,
            "text": text[:500],
            "page": page,
            "chunk_id": chunk_id,
        })
    confidence = int(round((max(scores) if scores else 0.75) * 100))
    confidence = max(0, min(confidence, 100))
    return {
        "id": document_id,
        "title": _chunk_document_name(first),
        "supplier": "待抽取",
        "owner": "当前知识库",
        "status": "命中",
        "risk": "中",
        "amount": "待抽取",
        "expiry": "待抽取",
        "score": confidence,
        "permissions": "按 RAGFlow 知识库权限可见",
        "reason": f"该合同包含与“{prompt}”相关的可追溯证据。",
        "evidence": evidence,
        "actions": ["复核右侧证据并确认是否加入待办"],
        "timeline": [],
    }
```

- [ ] **Step 4: Run tests and verify pass**

Run:

```bash
.venv/bin/python -m pytest test/unit_test/api/apps/services/test_contract_screening_service.py -q
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add api/apps/services/contract_screening_service.py test/unit_test/api/apps/services/test_contract_screening_service.py
git commit -m "feat(contract-agent): map screening chunks to contracts"
```

---

## Task 3: Backend Screening Orchestration

**Files:**
- Modify: `api/apps/services/contract_screening_service.py`
- Modify: `test/unit_test/api/apps/services/test_contract_screening_service.py`

- [ ] **Step 1: Add failing orchestration test with mocked retrieval**

Append to `test/unit_test/api/apps/services/test_contract_screening_service.py`:

```python
import asyncio

from api.apps.services.contract_screening_service import run_screening_task


class SearchStub:
    async def search_datasets(self, tenant_id, req):
        assert tenant_id == "tenant-1"
        assert req["dataset_ids"] == ["kb-1"]
        assert req["question"] == "筛选付款周期超过60天的合同"
        return True, {
            "chunks": [
                {
                    "id": "chunk-1",
                    "document_id": "doc-1",
                    "docnm_kwd": "采购合同.pdf",
                    "content": "付款期限为验收合格后90日内完成。",
                    "positions": [[12, 1, 1, 1, 1]],
                    "score": 0.91,
                }
            ],
            "total": 1,
        }


def test_run_screening_task_persists_done_result():
    redis = FakeRedis()
    store = ContractScreeningStore(redis=redis, ttl_seconds=60)
    task = create_initial_task(
        task_id="task-1",
        tenant_id="tenant-1",
        user_id="user-1",
        kb_id="kb-1",
        prompt="筛选付款周期超过60天的合同",
        filters={"risk": "全部", "status": "全部", "source": "全部"},
    )
    store.save(task)
    asyncio.run(run_screening_task("tenant-1", "task-1", store=store, search_service=SearchStub()))
    loaded = store.get("tenant-1", "task-1")
    assert loaded["status"] == "done"
    assert loaded["phase"] == "generate_summary"
    assert loaded["progress"] == 1.0
    assert loaded["items"][0]["title"] == "采购合同.pdf"
```

- [ ] **Step 2: Run test and verify failure**

Run:

```bash
.venv/bin/python -m pytest test/unit_test/api/apps/services/test_contract_screening_service.py::test_run_screening_task_persists_done_result -q
```

Expected: fail because `run_screening_task` is missing.

- [ ] **Step 3: Implement orchestration**

Append to `api/apps/services/contract_screening_service.py`:

```python
async def run_screening_task(
    tenant_id: str,
    task_id: str,
    store: ContractScreeningStore | None = None,
    search_service=None,
) -> None:
    store = store or ContractScreeningStore()
    task = store.get(tenant_id, task_id)
    if not task:
        raise ContractScreeningError("Task not found")

    if search_service is None:
        from api.apps.services import dataset_api_service as search_service

    try:
        task.update({
            "status": "running",
            "phase": "retrieve_candidates",
            "progress": 0.25,
            "message": "正在检索候选合同证据",
            "strategy": build_strategy(task["prompt"]),
        })
        store.save(task)

        success, result = await search_service.search_datasets(
            tenant_id,
            {
                "dataset_ids": [task["kb_id"]],
                "question": task["prompt"],
                "top_k": 64,
                "size": 64,
                "page": 1,
                "similarity_threshold": 0.0,
                "vector_similarity_weight": 0.3,
                "use_kg": False,
            },
        )
        if not success:
            raise ContractScreeningError(str(result))

        task.update({
            "phase": "review_evidence",
            "progress": 0.68,
            "message": "正在复核合同证据",
        })
        store.save(task)

        grouped = group_chunks_by_document(result.get("chunks", []))
        items = [
            map_group_to_contract_result(document_id, chunks, task["prompt"])
            for document_id, chunks in grouped.items()
        ]
        items.sort(key=lambda item: item.get("score", 0), reverse=True)

        task.update({
            "status": "done",
            "phase": "generate_summary",
            "progress": 1.0,
            "message": "筛选完成",
            "items": items,
            "skipped": {"unparsed": 0},
            "error": "",
        })
        store.save(task)
    except Exception as exc:
        task.update({
            "status": "failed",
            "progress": 1.0,
            "message": str(exc),
            "error": str(exc),
        })
        store.save(task)
```

- [ ] **Step 4: Run service tests**

Run:

```bash
.venv/bin/python -m pytest test/unit_test/api/apps/services/test_contract_screening_service.py -q
```

Expected: all service tests pass.

- [ ] **Step 5: Commit**

```bash
git add api/apps/services/contract_screening_service.py test/unit_test/api/apps/services/test_contract_screening_service.py
git commit -m "feat(contract-agent): run screening retrieval task"
```

---

## Task 4: Backend REST API

**Files:**
- Create: `api/apps/restful_apis/contract_screening_api.py`
- Create: `test/unit_test/api/apps/restful_apis/test_contract_screening_api.py`

- [ ] **Step 1: Add route tests with mocked service**

Create `test/unit_test/api/apps/restful_apis/test_contract_screening_api.py` with:

```python
import pytest

from api.apps.services.contract_screening_service import create_initial_task


@pytest.mark.asyncio
async def test_create_task_route_returns_task_id(monkeypatch, client):
    import api.apps.restful_apis.contract_screening_api as api_mod

    monkeypatch.setattr(api_mod, "current_user", type("User", (), {"id": "user-1"})())
    monkeypatch.setattr(api_mod.KnowledgebaseService, "accessible", lambda kb_id, user_id: True)
    monkeypatch.setattr(api_mod, "new_task_id", lambda: "task-1")
    saved = {}

    class Store:
        def save(self, task):
            saved.update(task)

    monkeypatch.setattr(api_mod, "ContractScreeningStore", lambda: Store())
    monkeypatch.setattr(api_mod, "_start_background_task", lambda tenant_id, task_id: None)

    response = await client.post("/api/v1/contract-screening/tasks", json={
        "kb_id": "kb-1",
        "prompt": "筛选付款周期超过60天的合同",
    })
    payload = await response.get_json()
    assert payload["code"] == 0
    assert payload["data"]["task_id"] == "task-1"
    assert saved["prompt"] == "筛选付款周期超过60天的合同"
```

If the existing test harness does not expose `client`, replace this route test with a direct async view test using Quart's `app.test_client()` after importing `api.apps.app`.

- [ ] **Step 2: Run route test and verify failure**

Run:

```bash
.venv/bin/python -m pytest test/unit_test/api/apps/restful_apis/test_contract_screening_api.py -q
```

Expected: fail because `contract_screening_api.py` does not exist or test fixture needs adaptation.

- [ ] **Step 3: Implement REST API**

Create `api/apps/restful_apis/contract_screening_api.py` with:

```python
import asyncio
import logging

from quart import request

from api.apps import current_user, login_required
from api.db.services.knowledgebase_service import KnowledgebaseService
from api.utils.api_utils import add_tenant_id_to_kwargs, get_error_argument_result, get_error_data_result, get_request_json, get_result
from api.apps.services.contract_screening_service import (
    ContractScreeningError,
    ContractScreeningStore,
    create_initial_task,
    new_task_id,
    run_screening_task,
    validate_create_task_request,
)


def _start_background_task(tenant_id: str, task_id: str) -> None:
    try:
        asyncio.create_task(run_screening_task(tenant_id, task_id))
    except RuntimeError:
        loop = asyncio.get_event_loop()
        loop.create_task(run_screening_task(tenant_id, task_id))


@manager.route("/contract-screening/tasks", methods=["POST"])  # noqa: F821
@login_required
@add_tenant_id_to_kwargs
async def create_task(tenant_id: str):
    try:
        req = await get_request_json()
        payload = validate_create_task_request(req)
        if not KnowledgebaseService.accessible(kb_id=payload["kb_id"], user_id=tenant_id):
            return get_error_data_result(message=f"You don't own the dataset {payload['kb_id']}.")
        task_id = new_task_id()
        task = create_initial_task(
            task_id=task_id,
            tenant_id=tenant_id,
            user_id=current_user.id,
            kb_id=payload["kb_id"],
            prompt=payload["prompt"],
            filters=payload["filters"],
        )
        ContractScreeningStore().save(task)
        _start_background_task(tenant_id, task_id)
        return get_result(data={"task_id": task_id})
    except ContractScreeningError as exc:
        return get_error_argument_result(exc.message)
    except Exception as exc:
        logging.exception(exc)
        return get_error_data_result(message="Internal server error")


@manager.route("/contract-screening/tasks/<task_id>", methods=["GET"])  # noqa: F821
@login_required
@add_tenant_id_to_kwargs
async def get_task(tenant_id: str, task_id: str):
    task = ContractScreeningStore().get(tenant_id, task_id)
    if not task:
        return get_error_data_result(message="Task not found")
    return get_result(data={
        "task_id": task["task_id"],
        "status": task["status"],
        "phase": task["phase"],
        "progress": task["progress"],
        "message": task["message"],
        "error": task.get("error", ""),
    })


@manager.route("/contract-screening/tasks/<task_id>/results", methods=["GET"])  # noqa: F821
@login_required
@add_tenant_id_to_kwargs
async def get_results(tenant_id: str, task_id: str):
    task = ContractScreeningStore().get(tenant_id, task_id)
    if not task:
        return get_error_data_result(message="Task not found")
    return get_result(data={
        "task_id": task["task_id"],
        "prompt": task["prompt"],
        "strategy": task.get("strategy", []),
        "items": task.get("items", []),
        "skipped": task.get("skipped", {}),
        "status": task["status"],
    })
```

- [ ] **Step 4: Run backend checks**

Run:

```bash
.venv/bin/python -m py_compile api/apps/restful_apis/contract_screening_api.py api/apps/services/contract_screening_service.py
.venv/bin/python -m pytest test/unit_test/api/apps/services/test_contract_screening_service.py test/unit_test/api/apps/restful_apis/test_contract_screening_api.py -q
```

Expected: py_compile passes and tests pass. If `.venv` lacks `pytest`, run the direct assertion fallback used in prior work and record the missing dependency.

- [ ] **Step 5: Commit**

```bash
git add api/apps/restful_apis/contract_screening_api.py api/apps/services/contract_screening_service.py test/unit_test/api/apps/services/test_contract_screening_service.py test/unit_test/api/apps/restful_apis/test_contract_screening_api.py
git commit -m "feat(contract-agent): expose screening task api"
```

---

## Task 5: Bring Open Design Prototype Into Repo

**Files:**
- Create: `contract-agent-web/package.json`
- Create: `contract-agent-web/package-lock.json`
- Create: `contract-agent-web/vite.config.js`
- Create: `contract-agent-web/index.html`
- Create: `contract-agent-web/src/App.jsx`
- Create: `contract-agent-web/src/data.js`
- Create: `contract-agent-web/src/logic.js`
- Create: `contract-agent-web/src/logic.test.js`
- Create: `contract-agent-web/src/main.jsx`
- Create: `contract-agent-web/src/styles.css`

- [ ] **Step 1: Copy prototype source**

Run:

```bash
mkdir -p contract-agent-web
cp -R "/Users/liyuanxin/Library/Application Support/Open Design/namespaces/release-stable/data/projects/13d03357-ba9c-44d0-8ad1-9050ebc75d32/index.html" contract-agent-web/
cp -R "/Users/liyuanxin/Library/Application Support/Open Design/namespaces/release-stable/data/projects/13d03357-ba9c-44d0-8ad1-9050ebc75d32/package.json" contract-agent-web/
cp -R "/Users/liyuanxin/Library/Application Support/Open Design/namespaces/release-stable/data/projects/13d03357-ba9c-44d0-8ad1-9050ebc75d32/package-lock.json" contract-agent-web/
cp -R "/Users/liyuanxin/Library/Application Support/Open Design/namespaces/release-stable/data/projects/13d03357-ba9c-44d0-8ad1-9050ebc75d32/vite.config.js" contract-agent-web/
cp -R "/Users/liyuanxin/Library/Application Support/Open Design/namespaces/release-stable/data/projects/13d03357-ba9c-44d0-8ad1-9050ebc75d32/src" contract-agent-web/
```

Expected: `contract-agent-web/src/App.jsx` exists and matches the prototype.

- [ ] **Step 2: Update Vite base and proxy**

Edit `contract-agent-web/vite.config.js` to:

```js
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/contract-agent/",
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    proxy: {
      "/api": "http://127.0.0.1:9380",
      "/v1": "http://127.0.0.1:9380"
    }
  }
});
```

- [ ] **Step 3: Run prototype tests and build**

Run:

```bash
cd contract-agent-web
npm test
npm run build
```

Expected: `npm test` passes and `dist/index.html` references `/contract-agent/` asset paths.

- [ ] **Step 4: Commit**

```bash
git add contract-agent-web
git commit -m "feat(contract-agent): add Open Design frontend"
```

---

## Task 6: Frontend API Client and Result Mapper

**Files:**
- Create: `contract-agent-web/src/api.js`
- Create: `contract-agent-web/src/api.test.js`
- Modify: `contract-agent-web/src/logic.js`
- Modify: `contract-agent-web/src/logic.test.js`

- [ ] **Step 1: Add failing API mapper tests**

Create `contract-agent-web/src/api.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { mapScreeningItemToContract } from "./api.js";

test("mapScreeningItemToContract preserves prototype card shape", () => {
  const item = mapScreeningItemToContract({
    id: "doc-1",
    title: "采购合同.pdf",
    supplier: "上海曜石科技有限公司",
    owner: "采购部",
    status: "命中",
    risk: "高",
    amount: "¥4,860,000",
    expiry: "2026-09-30",
    score: 92,
    permissions: "采购部、法务部可见",
    reason: "付款周期为90天。",
    evidence: [{ source: "合同正文", ref: "第12页 / chunk-1", text: "付款期限90天", page: 12, chunk_id: "chunk-1" }],
    actions: ["请求法务复核"],
    timeline: [["到期", "2026-09-30"]]
  });

  assert.equal(item.id, "doc-1");
  assert.equal(item.title, "采购合同.pdf");
  assert.equal(item.evidence[0].ref, "第12页 / chunk-1");
  assert.deepEqual(item.timeline, [["到期", "2026-09-30"]]);
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
cd contract-agent-web
npm test
```

Expected: fail because `src/api.js` is missing.

- [ ] **Step 3: Implement API client**

Create `contract-agent-web/src/api.js`:

```js
const JSON_HEADERS = { "Content-Type": "application/json" };

async function parseResponse(response) {
  const payload = await response.json();
  if (!response.ok || payload.code !== 0) {
    throw new Error(payload.message || `HTTP ${response.status}`);
  }
  return payload.data;
}

export function mapScreeningItemToContract(item) {
  return {
    id: item.id,
    title: item.title || "未命名合同",
    supplier: item.supplier || "待抽取",
    owner: item.owner || "当前知识库",
    status: item.status || "命中",
    risk: item.risk || "中",
    amount: item.amount || "待抽取",
    expiry: item.expiry || "待抽取",
    score: Number.isFinite(item.score) ? item.score : 0,
    permissions: item.permissions || "按 RAGFlow 知识库权限可见",
    reason: item.reason || "命中当前筛选条件。",
    evidence: Array.isArray(item.evidence) ? item.evidence : [],
    actions: Array.isArray(item.actions) ? item.actions : [],
    timeline: Array.isArray(item.timeline) ? item.timeline : []
  };
}

export async function createScreeningTask({ kbId, prompt, filters }) {
  const response = await fetch("/api/v1/contract-screening/tasks", {
    method: "POST",
    headers: JSON_HEADERS,
    credentials: "include",
    body: JSON.stringify({ kb_id: kbId, prompt, filters })
  });
  return parseResponse(response);
}

export async function getScreeningTask(taskId) {
  const response = await fetch(`/api/v1/contract-screening/tasks/${taskId}`, {
    credentials: "include"
  });
  return parseResponse(response);
}

export async function getScreeningResults(taskId) {
  const response = await fetch(`/api/v1/contract-screening/tasks/${taskId}/results`, {
    credentials: "include"
  });
  const data = await parseResponse(response);
  return {
    ...data,
    items: (data.items || []).map(mapScreeningItemToContract)
  };
}
```

- [ ] **Step 4: Run tests and build**

Run:

```bash
cd contract-agent-web
npm test
npm run build
```

Expected: tests and build pass.

- [ ] **Step 5: Commit**

```bash
git add contract-agent-web/src/api.js contract-agent-web/src/api.test.js contract-agent-web/src/logic.js contract-agent-web/src/logic.test.js
git commit -m "feat(contract-agent): add frontend screening api client"
```

---

## Task 7: Wire Prototype UI to Backend Tasks

**Files:**
- Modify: `contract-agent-web/src/App.jsx`
- Modify: `contract-agent-web/src/logic.js`
- Modify: `contract-agent-web/src/logic.test.js`

- [ ] **Step 1: Add local history helpers test**

Append to `contract-agent-web/src/logic.test.js`:

```js
import { buildConversationTitle, taskPhaseToLabel } from "./logic.js";

test("buildConversationTitle trims long prompts", () => {
  assert.equal(buildConversationTitle("筛选付款周期超过60天且包含违约金条款的合同"), "筛选付款周期超过60天且包含违约金条...");
});

test("taskPhaseToLabel maps backend phases", () => {
  assert.equal(taskPhaseToLabel("parse_prompt"), "解析筛选意图");
  assert.equal(taskPhaseToLabel("retrieve_candidates"), "检索候选合同证据");
  assert.equal(taskPhaseToLabel("review_evidence"), "复核合同证据");
  assert.equal(taskPhaseToLabel("rank_contracts"), "排序合同结果");
  assert.equal(taskPhaseToLabel("generate_summary"), "生成筛选结果");
});
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
cd contract-agent-web
npm test
```

Expected: fail because helper functions are missing.

- [ ] **Step 3: Add helpers**

Append to `contract-agent-web/src/logic.js`:

```js
export function buildConversationTitle(prompt) {
  const text = String(prompt || "").trim();
  return text.length > 18 ? `${text.slice(0, 18)}...` : text || "新的筛选任务";
}

export function taskPhaseToLabel(phase) {
  return {
    parse_prompt: "解析筛选意图",
    retrieve_candidates: "检索候选合同证据",
    review_evidence: "复核合同证据",
    rank_contracts: "排序合同结果",
    generate_summary: "生成筛选结果"
  }[phase] || "正在处理";
}
```

- [ ] **Step 4: Replace `smartFilter` flow in `App.jsx`**

In `contract-agent-web/src/App.jsx`, import API functions:

```js
import { createScreeningTask, getScreeningResults, getScreeningTask } from "./api.js";
import { buildConversationTitle, taskPhaseToLabel } from "./logic.js";
```

Change `handleSend` or the existing send handler so it:

```js
async function runRemoteScreening(query) {
  const userMessage = { id: nextMessageId(), role: "user", content: query };
  setMessages((prev) => [...prev, userMessage]);
  setIsStreaming(true);
  setStreamingPhases([{ key: "parse_prompt", label: "解析筛选意图", done: false }]);

  try {
    const created = await createScreeningTask({
      kbId: selectedKnowledgeBaseId,
      prompt: query,
      filters
    });
    const taskId = created.task_id;
    let current = await getScreeningTask(taskId);

    while (!["done", "failed", "cancelled"].includes(current.status)) {
      setStreamingPhases((prev) => {
        const existing = new Set(prev.map((item) => item.key));
        const next = prev.map((item) => ({
          ...item,
          done: item.key !== current.phase
        }));
        if (!existing.has(current.phase)) {
          next.push({ key: current.phase, label: taskPhaseToLabel(current.phase), done: false });
        }
        return next;
      });
      await new Promise((resolve) => setTimeout(resolve, 1500));
      current = await getScreeningTask(taskId);
    }

    if (current.status !== "done") {
      throw new Error(current.message || "筛选任务失败");
    }

    const result = await getScreeningResults(taskId);
    const agentMessage = {
      id: nextMessageId(),
      role: "agent",
      content: result.items.length ? `筛选完成，命中 ${result.items.length} 份合同。` : "筛选完成，没有命中合同。",
      strategy: result.strategy,
      results: result.items
    };
    setMessages((prev) => [...prev, agentMessage]);
    saveConversationToLocalHistory({
      id: taskId,
      title: buildConversationTitle(query),
      time: new Date().toLocaleString(),
      messages: [userMessage, agentMessage]
    });
  } catch (error) {
    setMessages((prev) => [...prev, {
      id: nextMessageId(),
      role: "agent",
      content: `筛选失败：${error.message}`
    }]);
  } finally {
    setIsStreaming(false);
    setStreamingPhases([]);
  }
}
```

Define `selectedKnowledgeBaseId` from `new URLSearchParams(window.location.search).get("kb_id") || localStorage.getItem("contract-agent-kb-id") || ""`. If it is empty, show an agent message telling the user to add `?kb_id=<知识库ID>` or select a knowledge base after the selector is implemented.

- [ ] **Step 5: Run frontend checks**

Run:

```bash
cd contract-agent-web
npm test
npm run build
```

Expected: tests and build pass.

- [ ] **Step 6: Commit**

```bash
git add contract-agent-web/src/App.jsx contract-agent-web/src/logic.js contract-agent-web/src/logic.test.js
git commit -m "feat(contract-agent): connect prototype to screening tasks"
```

---

## Task 8: Login Redirect Feature Flag

**Files:**
- Create: `web/src/utils/contract-agent-config.ts`
- Create: `web/src/utils/contract-agent-config.test.ts`
- Modify: `web/src/pages/login-next/index.tsx`

- [ ] **Step 1: Add failing route helper test**

Create `web/src/utils/contract-agent-config.test.ts`:

```ts
import {
  getContractAgentDefaultRoute,
  isContractAgentEnabled,
} from './contract-agent-config';

describe('contract agent config', () => {
  it('is disabled unless explicitly enabled', () => {
    expect(isContractAgentEnabled({ VITE_CONTRACT_AGENT_ENABLED: 'false' })).toBe(false);
    expect(isContractAgentEnabled({})).toBe(false);
  });

  it('uses /contract-agent as default route', () => {
    expect(getContractAgentDefaultRoute({ VITE_CONTRACT_AGENT_ENABLED: 'true' })).toBe('/contract-agent');
  });
});
```

- [ ] **Step 2: Run focused test and verify failure**

Run:

```bash
cd web
npm test -- --runTestsByPath src/utils/contract-agent-config.test.ts --watchAll=false
```

Expected: fail if Jest config is still missing `umi/test`; record this as environment blocker and use `npx eslint` plus `npm run build` after implementation.

- [ ] **Step 3: Implement route helper**

Create `web/src/utils/contract-agent-config.ts`:

```ts
type EnvLike = Record<string, string | boolean | undefined>;

export function isContractAgentEnabled(env: EnvLike = import.meta.env): boolean {
  return String(env.VITE_CONTRACT_AGENT_ENABLED || '').toLowerCase() === 'true';
}

export function getContractAgentDefaultRoute(env: EnvLike = import.meta.env): string {
  if (!isContractAgentEnabled(env)) {
    return '/';
  }
  return String(env.VITE_CONTRACT_AGENT_DEFAULT_ROUTE || '/contract-agent');
}
```

- [ ] **Step 4: Update login navigation**

In `web/src/pages/login-next/index.tsx`, import:

```ts
import { getContractAgentDefaultRoute } from '@/utils/contract-agent-config';
```

Replace both `navigate('/')` calls after successful login with:

```ts
navigate(getContractAgentDefaultRoute());
```

- [ ] **Step 5: Run frontend checks**

Run:

```bash
cd web
npx eslint src/utils/contract-agent-config.ts src/utils/contract-agent-config.test.ts src/pages/login-next/index.tsx
npm run build
```

Expected: eslint passes and build passes. If `npm test` remains blocked by `umi/test`, note it in the task result.

- [ ] **Step 6: Commit**

```bash
git add web/src/utils/contract-agent-config.ts web/src/utils/contract-agent-config.test.ts web/src/pages/login-next/index.tsx
git commit -m "feat(contract-agent): add login redirect flag"
```

---

## Task 9: Same-Site Static Deployment

**Files:**
- Modify: `docker/nginx/ragflow.conf.python`
- Modify: `docker/nginx/ragflow.https.conf`
- Modify: `docker/nginx/ragflow.conf.hybrid`
- Modify: `docker/nginx/ragflow.conf.golang`
- Modify: `Dockerfile`

- [ ] **Step 1: Add `/contract-agent` Nginx location**

In each `docker/nginx/ragflow*.conf` server block, add this location before `location /`:

```nginx
    location /contract-agent/ {
        alias /ragflow/contract-agent-web/dist/;
        index index.html;
        try_files $uri $uri/ /contract-agent/index.html;
    }
```

For `ragflow.https.conf`, add the same block to the HTTPS server block.

- [ ] **Step 2: Update Docker build**

In `Dockerfile`, add a contract-agent build stage near the existing web build stage:

```dockerfile
FROM node:22 AS contract-agent-web-builder
WORKDIR /ragflow/contract-agent-web
COPY contract-agent-web/package*.json ./
RUN npm ci
COPY contract-agent-web/ ./
RUN npm run build
```

In the runtime stage, copy the build output:

```dockerfile
COPY --from=contract-agent-web-builder /ragflow/contract-agent-web/dist /ragflow/contract-agent-web/dist
```

Place the copy near the existing `web/dist` copy.

- [ ] **Step 3: Verify Nginx config text**

Run:

```bash
rg "contract-agent" docker/nginx Dockerfile
```

Expected: all four Nginx configs and `Dockerfile` contain `contract-agent`.

- [ ] **Step 4: Run build checks**

Run:

```bash
cd contract-agent-web
npm run build
cd ../web
npm run build
```

Expected: both frontend builds pass.

- [ ] **Step 5: Commit**

```bash
git add docker/nginx/ragflow.conf.python docker/nginx/ragflow.https.conf docker/nginx/ragflow.conf.hybrid docker/nginx/ragflow.conf.golang Dockerfile
git commit -m "build(contract-agent): serve agent under contract-agent"
```

---

## Task 10: End-to-End Verification

**Files:**
- No new source files unless failures require fixes.

- [ ] **Step 1: Start dependencies and backend**

Run the existing backend stack according to local setup. If services are already running, restart only the API server:

```bash
docker compose -f docker/docker-compose-base.yml up -d
source .venv/bin/activate
export PYTHONPATH=$(pwd)
bash docker/launch_backend_service.sh
```

Expected: API server starts and logs show RAGFlow is ready.

- [ ] **Step 2: Start contract Agent dev server**

Run:

```bash
cd contract-agent-web
npm run dev
```

Expected: Vite serves the Agent on `http://127.0.0.1:5173/contract-agent/`.

- [ ] **Step 3: Manual API smoke test**

With a known parsed contract knowledge base ID:

```bash
curl -s -X POST http://127.0.0.1:9380/api/v1/contract-screening/tasks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{"kb_id":"<kb_id>","prompt":"筛选付款周期超过60天的合同"}'
```

Expected: response contains `{"code":0,"data":{"task_id":"..."}}`.

- [ ] **Step 4: Manual UI smoke test**

Open:

```text
http://127.0.0.1:5173/contract-agent/?kb_id=<kb_id>
```

Expected:

- Welcome screen follows the Open Design prototype.
- Prompt submission creates a task.
- Streaming phases advance.
- Contract cards render after task completion.
- Clicking a contract opens right-side evidence.

- [ ] **Step 5: Final verification commands**

Run:

```bash
.venv/bin/python -m py_compile api/apps/services/contract_screening_service.py api/apps/restful_apis/contract_screening_api.py
cd contract-agent-web && npm test && npm run build
cd ../web && npx eslint src/utils/contract-agent-config.ts src/utils/contract-agent-config.test.ts src/pages/login-next/index.tsx && npm run build
```

Expected: all commands pass, except known pre-existing blockers must be recorded with exact error text.

- [ ] **Step 6: Commit fixes if any**

If verification required changes:

```bash
git add <changed-files>
git commit -m "fix(contract-agent): address verification issues"
```

If no changes were required, do not create an empty commit.

---

## Self-Review

Spec coverage:

- Open Design UI baseline: covered by Tasks 5, 6, and 7.
- Independent source, same-site deployment: covered by Tasks 5 and 9.
- RAGFlow login reuse and default redirect: covered by Task 8.
- Contract screening API: covered by Tasks 1 through 4.
- Redis task status/results: covered by Tasks 1 and 3.
- Contract-list-first results and evidence panel: covered by Tasks 2, 6, and 7.
- Remote PaddleOCR dependency: covered by the design and end-to-end verification; no new OCR code is needed in this plan because backend parsing defaults were already changed.
- Testing and rollout: covered by every task and Task 10.

Placeholder scan:

- This plan contains no unresolved implementation markers or open-ended fill-in instructions.

Type consistency:

- Backend status values: `pending`, `running`, `done`, `failed`, `cancelled`.
- Backend phase values: `parse_prompt`, `retrieve_candidates`, `review_evidence`, `rank_contracts`, `generate_summary`.
- Result fields match the Open Design prototype contract card shape: `id`, `title`, `supplier`, `owner`, `status`, `risk`, `amount`, `expiry`, `score`, `permissions`, `reason`, `evidence`, `actions`, `timeline`.
