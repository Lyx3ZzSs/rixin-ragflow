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

import inspect
import json
import time
import asyncio
from dataclasses import asdict, dataclass, field
from typing import Any

from common.misc_utils import get_uuid
from api.db.services import contract_screening_service as contract_screening_db_service
from rag.utils.redis_conn import REDIS_CONN


DEFAULT_FILTERS = {"risk": "全部", "status": "全部", "source": "全部"}
TASK_TTL_SECONDS = 60 * 60 * 24
TASK_STALE_SECONDS = 30 * 60
TASK_HEARTBEAT_SECONDS = 30
ACTIVE_TASK_STATUSES = {"pending", "running"}


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
    strategy: dict[str, Any] = field(default_factory=dict)
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
    *,
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

    def save(self, task: dict[str, Any]) -> bool:
        task["updated_at"] = time.time()
        return self.redis.set_obj(
            _task_key(task["tenant_id"], task["task_id"]),
            task,
            exp=self.ttl_seconds,
        )

    def get(self, tenant_id: str, task_id: str) -> dict[str, Any] | None:
        raw = self.redis.get(_task_key(tenant_id, task_id))
        if not raw:
            return None
        if isinstance(raw, bytes):
            raw = raw.decode("utf-8")
        if isinstance(raw, str):
            return json.loads(raw)
        return raw


def new_task_id() -> str:
    return get_uuid()


def save_task_or_raise(store: ContractScreeningStore, task: dict[str, Any]) -> None:
    if not store.save(task):
        raise ContractScreeningError("Failed to persist contract screening task")


def mark_stale_task_failed(
    task: dict[str, Any],
    *,
    now: float | None = None,
    stale_seconds: int = TASK_STALE_SECONDS,
) -> bool:
    status = str(task.get("status") or "").lower()
    if status not in ACTIVE_TASK_STATUSES:
        return False

    try:
        updated_at = float(task.get("updated_at") or 0)
    except Exception:
        updated_at = 0
    if updated_at <= 0:
        return False

    now = time.time() if now is None else now
    if now - updated_at <= stale_seconds:
        return False

    message = "筛选任务超时，请重新发起筛选"
    task.update({
        "status": "failed",
        "phase": "timeout",
        "progress": 1.0,
        "message": message,
        "error": message,
    })
    return True


def _field_value(source: Any, *names: str) -> Any:
    if isinstance(source, dict):
        for name in names:
            if name in source and source[name] is not None:
                return source[name]
        return None

    for name in names:
        if hasattr(source, name):
            value = getattr(source, name)
            if value is not None:
                return value
    return None


def build_strategy(task: Any) -> dict[str, Any]:
    prompt = str(_field_value(task, "prompt", "query") or "").strip()
    filters = _field_value(task, "filters")
    if not isinstance(filters, dict):
        filters = {}

    conditions = []
    if "付款" in prompt or "账期" in prompt:
        conditions.append({
            "id": "payment_terms",
            "label": "付款周期、账期",
            "keywords": ["付款", "账期", "付款周期"],
        })
    if "违约" in prompt or "违约金" in prompt:
        conditions.append({
            "id": "penalty_terms",
            "label": "违约金、逾期责任",
            "keywords": ["违约", "违约金", "逾期责任"],
        })
    if "续签" in prompt or "到期" in prompt:
        conditions.append({
            "id": "renewal_terms",
            "label": "续签、到期时间",
            "keywords": ["续签", "到期"],
        })
    if "补充协议" in prompt or "附件" in prompt:
        conditions.append({
            "id": "attachment_terms",
            "label": "补充协议、附件完整性",
            "keywords": ["补充协议", "附件"],
        })
    if not conditions:
        conditions.append({
            "id": "contract_terms",
            "label": "合同正文、审批和履约相关表达",
            "keywords": ["合同", "审批", "履约"],
        })

    return {
        "query": prompt,
        "conditions": conditions,
        "filters": dict(filters),
        "evidence_policy": {
            "group_by": "document",
            "text_fields": ["content", "content_with_weight", "text"],
            "max_evidence_per_contract": 5,
        },
        "limit_per_condition": 20,
    }


def _chunk_document_id(chunk: Any) -> str:
    return str(_field_value(chunk, "document_id", "doc_id") or "").strip()


def _chunk_document_name(chunk: Any) -> str:
    return str(_field_value(chunk, "docnm_kwd", "doc_name", "document_name") or "未命名合同")


def _chunk_text(chunk: Any) -> str:
    return str(_field_value(chunk, "content", "content_with_weight", "text") or "").strip()


def _chunk_identifier(chunk: Any) -> str:
    return str(_field_value(chunk, "id", "chunk_id") or "")


def _chunk_page(chunk: Any) -> int | None:
    positions = _field_value(chunk, "positions") or _field_value(chunk, "position_int") or []
    if isinstance(positions, (int, float, str)):
        try:
            return int(positions)
        except Exception:
            return None
    if positions and isinstance(positions[0], list) and positions[0]:
        try:
            return int(positions[0][0])
        except Exception:
            return None
    if positions:
        try:
            return int(positions[0])
        except Exception:
            return None
    page_num = _field_value(chunk, "page_num")
    if page_num is not None:
        try:
            return int(page_num)
        except Exception:
            return None
    return None


def _chunk_score(chunk: Any) -> float | None:
    for key in ("score", "similarity", "vector_similarity"):
        score = _field_value(chunk, key)
        if isinstance(score, (int, float)):
            return float(score)
    return None


def group_chunks_by_document(chunks: list[Any]) -> dict[str, list[Any]]:
    grouped: dict[str, list[Any]] = {}
    for chunk in chunks:
        document_id = _chunk_document_id(chunk)
        if not document_id:
            continue
        grouped.setdefault(document_id, []).append(chunk)
    return grouped


def map_group_to_contract_result(document_id: str, chunks: list[Any]) -> dict[str, Any]:
    first = chunks[0] if chunks else {}
    evidence = []
    scores = [_score for chunk in chunks if (_score := _chunk_score(chunk)) is not None]
    for chunk in chunks:
        if len(evidence) >= 5:
            break
        text = _chunk_text(chunk)
        if not text:
            continue
        page = _chunk_page(chunk)
        chunk_id = _chunk_identifier(chunk)
        evidence.append({
            "source": "合同正文",
            "ref": f"第{page}页 / {chunk_id}" if page else chunk_id,
            "text": text[:500],
            "page": page,
            "chunk_id": chunk_id,
        })
    confidence = int(round((max(scores) if scores else 0.75) * 100))
    confidence = max(0, min(confidence, 100))
    overall_status = "matched" if evidence else "unmatched"
    return {
        "contract_id": document_id,
        "name": _chunk_document_name(first),
        "meta": {
            "supplier": "待抽取",
            "owner": "当前知识库",
            "risk": "中",
            "amount": "待抽取",
            "expiry": "待抽取",
            "permissions": "按 RAGFlow 知识库权限可见",
            "score": confidence,
            "confidence": confidence,
            "evidence_count": len(evidence),
        },
        "overall_status": overall_status,
        "matched_conditions": [{
            "condition_id": "semantic_match",
            "label": "合同正文证据匹配",
            "status": overall_status,
            "score": confidence,
            "confidence": confidence,
            "evidence_count": len(evidence),
        }],
        "evidence": evidence,
    }


def _build_search_request(task: dict[str, Any]) -> dict[str, Any]:
    return {
        "dataset_ids": [task["kb_id"]],
        "question": task["prompt"],
        "top_k": 64,
        "size": 64,
        "page": 1,
        "similarity_threshold": 0.0,
        "vector_similarity_weight": 0.3,
        "use_kg": False,
    }


async def _call_search_service(
    search_service: Any,
    tenant_id: str,
    task: dict[str, Any],
    req: dict[str, Any],
) -> Any:
    if search_service is None:
        from api.apps.services import dataset_api_service

        search_service = dataset_api_service

    if hasattr(search_service, "search_datasets"):
        method = search_service.search_datasets
        args = (tenant_id, req)
    else:
        method = search_service.search
        args = (task["kb_id"], tenant_id, req)

    if inspect.iscoroutinefunction(method):
        return await method(*args)

    return await asyncio.to_thread(method, *args)


async def _await_with_heartbeat(
    awaitable: Any,
    *,
    store: ContractScreeningStore,
    task: dict[str, Any],
    heartbeat_seconds: float,
) -> Any:
    pending = asyncio.create_task(awaitable)
    try:
        while True:
            done, _ = await asyncio.wait({pending}, timeout=heartbeat_seconds)
            if done:
                return pending.result()
            save_task_or_raise(store, task)
    except Exception:
        if not pending.done():
            pending.cancel()
        raise


def _normalize_search_result(result: Any) -> dict[str, Any]:
    if isinstance(result, tuple):
        success = bool(result[0]) if result else False
        if not success:
            raise ContractScreeningError(str(result))
        payload = result[1] if len(result) > 1 else {}
        return payload if isinstance(payload, dict) else {}

    if isinstance(result, dict):
        if result.get("success") is False:
            raise ContractScreeningError(str(result))
        return result

    raise ContractScreeningError(str(result))


async def run_screening_task(
    tenant_id: str,
    task_id: str,
    store: ContractScreeningStore | None = None,
    search_service: Any = None,
    history_service: Any = contract_screening_db_service,
    heartbeat_seconds: float = TASK_HEARTBEAT_SECONDS,
) -> dict[str, Any]:
    store = store or ContractScreeningStore()
    task = store.get(tenant_id, task_id)
    if not task:
        raise ContractScreeningError("Task not found")

    try:
        strategy = build_strategy(task)
        task.update({
            "status": "running",
            "phase": "retrieve_candidates",
            "progress": 0.25,
            "message": "正在检索候选合同",
            "strategy": strategy,
            "error": "",
        })
        save_task_or_raise(store, task)

        req = _build_search_request(task)
        result = await _await_with_heartbeat(
            _call_search_service(search_service, tenant_id, task, req),
            store=store,
            task=task,
            heartbeat_seconds=heartbeat_seconds,
        )
        result = _normalize_search_result(result)

        task.update({
            "phase": "review_evidence",
            "progress": 0.68,
            "message": "正在复核合同证据",
        })
        save_task_or_raise(store, task)

        grouped = group_chunks_by_document(result.get("chunks", []))
        items = [
            map_group_to_contract_result(document_id, chunks)
            for document_id, chunks in grouped.items()
        ]
        items.sort(key=lambda item: item.get("meta", {}).get("score", 0), reverse=True)

        task.update({
            "status": "done",
            "phase": "generate_summary",
            "progress": 1.0,
            "message": "筛选完成",
            "items": items,
            "skipped": {"unparsed": 0},
            "error": "",
        })
        history_service.persist_completed_task(task)
        save_task_or_raise(store, task)
        return task
    except Exception as exc:
        message = exc.message if isinstance(exc, ContractScreeningError) else str(exc)
        task.update({
            "status": "failed",
            "progress": 1.0,
            "message": message,
            "error": message,
        })
        saved_failed_state = store.save(task)
        if not saved_failed_state and not (
            isinstance(exc, ContractScreeningError)
            and exc.message == "Failed to persist contract screening task"
        ):
            raise ContractScreeningError("Failed to persist contract screening task") from exc
        if isinstance(exc, ContractScreeningError):
            raise
        raise ContractScreeningError(message) from exc
