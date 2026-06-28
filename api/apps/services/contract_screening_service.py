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


def _chunk_score(chunk: dict[str, Any]) -> float | None:
    for key in ("score", "similarity", "vector_similarity"):
        score = chunk.get(key)
        if isinstance(score, (int, float)):
            return float(score)
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
    scores = [_score for chunk in chunks if (_score := _chunk_score(chunk)) is not None]
    for chunk in chunks:
        if len(evidence) >= 5:
            break
        text = _chunk_text(chunk)
        if not text:
            continue
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
