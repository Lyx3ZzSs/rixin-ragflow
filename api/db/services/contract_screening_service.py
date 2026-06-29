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
from __future__ import annotations

import time
from typing import Any

from api.db.db_models import (
    DB,
    ContractScreeningEvidence,
    ContractScreeningExport,
    ContractScreeningFeedback,
    ContractScreeningResult,
    ContractScreeningTask,
)
from api.db.services.common_service import CommonService
from common.misc_utils import get_uuid


class ContractScreeningTaskService(CommonService):
    model = ContractScreeningTask

    @classmethod
    @DB.connection_context()
    def list_tasks(
        cls,
        *,
        tenant_id: str,
        user_id: str,
        page: int = 1,
        page_size: int = 20,
        kb_id: str | None = None,
    ) -> dict[str, Any]:
        page = max(1, int(page or 1))
        page_size = min(100, max(1, int(page_size or 20)))
        query = cls.model.select().where(
            cls.model.tenant_id == tenant_id,
            cls.model.user_id == user_id,
        )
        if kb_id:
            query = query.where(cls.model.kb_id == kb_id)
        total = query.count()
        rows = query.order_by(cls.model.create_time.desc()).paginate(page, page_size).dicts()
        return {
            "total": total,
            "items": [_task_summary(row) for row in rows],
        }

    @classmethod
    @DB.connection_context()
    def get_task(cls, *, tenant_id: str, task_id: str) -> dict[str, Any] | None:
        row = cls.model.get_or_none(
            (cls.model.id == task_id)
            & (cls.model.tenant_id == tenant_id)
        )
        return row.to_dict() if row else None

    @classmethod
    @DB.connection_context()
    def upsert_task(cls, task: dict[str, Any]) -> None:
        record = task_record_from_runtime_task(task)
        existing = cls.model.get_or_none(cls.model.id == record["id"])
        if existing:
            cls.update_by_id(record["id"], record)
            return
        cls.insert(**record)


class ContractScreeningResultService(CommonService):
    model = ContractScreeningResult

    @classmethod
    @DB.connection_context()
    def list_by_task(cls, *, tenant_id: str, task_id: str) -> list[dict[str, Any]]:
        rows = (
            cls.model.select()
            .where(
                cls.model.tenant_id == tenant_id,
                cls.model.task_id == task_id,
            )
            .order_by(cls.model.score.desc(), cls.model.create_time.asc())
            .dicts()
        )
        return list(rows)


class ContractScreeningEvidenceService(CommonService):
    model = ContractScreeningEvidence

    @classmethod
    @DB.connection_context()
    def list_by_task(cls, *, tenant_id: str, task_id: str) -> list[dict[str, Any]]:
        rows = (
            cls.model.select()
            .where(
                cls.model.tenant_id == tenant_id,
                cls.model.task_id == task_id,
            )
            .order_by(cls.model.create_time.asc())
            .dicts()
        )
        return list(rows)


class ContractScreeningExportService(CommonService):
    model = ContractScreeningExport


class ContractScreeningFeedbackService(CommonService):
    model = ContractScreeningFeedback


def _task_summary(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "task_id": row.get("id") or row.get("task_id"),
        "kb_id": row.get("kb_id", ""),
        "prompt": row.get("prompt", ""),
        "status": row.get("status", ""),
        "phase": row.get("phase", ""),
        "progress": row.get("progress", 0.0),
        "message": row.get("message", ""),
        "item_count": row.get("item_count", 0),
        "created_at": row.get("create_time"),
        "updated_at": row.get("update_time"),
        "finished_at": row.get("finished_at"),
    }


def task_record_from_runtime_task(task: dict[str, Any]) -> dict[str, Any]:
    strategy = task.get("strategy") if isinstance(task.get("strategy"), dict) else {}
    evidence_policy = strategy.get("evidence_policy") if isinstance(strategy.get("evidence_policy"), dict) else {}
    return {
        "id": task["task_id"],
        "tenant_id": task["tenant_id"],
        "user_id": task["user_id"],
        "kb_id": task["kb_id"],
        "prompt": task.get("prompt", ""),
        "filters": task.get("filters") if isinstance(task.get("filters"), dict) else {},
        "parsed_conditions": strategy,
        "edited_conditions": task.get("conditions") if isinstance(task.get("conditions"), list) else [],
        "evidence_policy": evidence_policy,
        "status": task.get("status", ""),
        "phase": task.get("phase", ""),
        "progress": float(task.get("progress") or 0),
        "message": task.get("message", ""),
        "error": task.get("error", ""),
        "item_count": len(task.get("items") or []),
        "skipped": task.get("skipped") if isinstance(task.get("skipped"), dict) else {},
        "finished_at": int(time.time()) if task.get("status") == "done" else None,
    }


def result_record_from_item(
    *,
    task_id: str,
    tenant_id: str,
    item: dict[str, Any],
) -> dict[str, Any]:
    meta = item.get("meta") if isinstance(item.get("meta"), dict) else {}
    score = item.get("score", meta.get("score", meta.get("confidence", 0)))
    try:
        score = float(score)
    except (TypeError, ValueError):
        score = 0.0
    return {
        "id": item.get("id") or get_uuid(),
        "task_id": task_id,
        "tenant_id": tenant_id,
        "document_id": item.get("contract_id") or item.get("document_id") or item.get("id", ""),
        "title": item.get("title") or item.get("name") or "未命名合同",
        "status": item.get("status") or item.get("overall_status") or "",
        "risk": item.get("risk") or meta.get("risk") or "",
        "score": score,
        "reason": item.get("reason") or _condition_reason(item.get("matched_conditions")) or "",
        "meta": meta,
        "matched_conditions": item.get("matched_conditions") if isinstance(item.get("matched_conditions"), list) else [],
        "actions": item.get("actions") if isinstance(item.get("actions"), list) else [],
        "timeline": item.get("timeline") if isinstance(item.get("timeline"), list) else [],
    }


def evidence_records_from_item(
    *,
    task_id: str,
    tenant_id: str,
    result_id: str,
    item: dict[str, Any],
) -> list[dict[str, Any]]:
    document_id = item.get("contract_id") or item.get("document_id") or item.get("id", "")
    evidence = item.get("evidence") if isinstance(item.get("evidence"), list) else []
    records = []
    for ev in evidence:
        records.append({
            "task_id": task_id,
            "tenant_id": tenant_id,
            "result_id": result_id,
            "document_id": document_id,
            "chunk_id": ev.get("chunk_id") or "",
            "source": ev.get("source") or "合同正文",
            "ref": ev.get("ref") or "",
            "page": _optional_int(ev.get("page")),
            "text": ev.get("text") or "",
            "score": _optional_float(ev.get("score")),
            "condition_id": ev.get("condition_id") or "",
        })
    return records


def persist_completed_task(task: dict[str, Any]) -> None:
    ContractScreeningTaskService.upsert_task(task)
    task_id = task["task_id"]
    tenant_id = task["tenant_id"]
    result_records = []
    evidence_records = []
    for item in task.get("items") or []:
        result = result_record_from_item(task_id=task_id, tenant_id=tenant_id, item=item)
        result_records.append(result)
        evidence_records.extend(
            {
                "id": get_uuid(),
                **record,
            }
            for record in evidence_records_from_item(
                task_id=task_id,
                tenant_id=tenant_id,
                result_id=result["id"],
                item=item,
            )
        )

    with DB.connection_context():
        with DB.atomic():
            ContractScreeningResult.delete().where(
                (ContractScreeningResult.tenant_id == tenant_id)
                & (ContractScreeningResult.task_id == task_id)
            ).execute()
            ContractScreeningEvidence.delete().where(
                (ContractScreeningEvidence.tenant_id == tenant_id)
                & (ContractScreeningEvidence.task_id == task_id)
            ).execute()
            if result_records:
                ContractScreeningResultService.insert_many(result_records)
            if evidence_records:
                ContractScreeningEvidenceService.insert_many(evidence_records)


def build_results_payload(tenant_id: str, task_id: str) -> dict[str, Any] | None:
    task = ContractScreeningTaskService.get_task(tenant_id=tenant_id, task_id=task_id)
    if not task:
        return None
    results = ContractScreeningResultService.list_by_task(tenant_id=tenant_id, task_id=task_id)
    evidences = ContractScreeningEvidenceService.list_by_task(tenant_id=tenant_id, task_id=task_id)
    by_result: dict[str, list[dict[str, Any]]] = {}
    for evidence in evidences:
        by_result.setdefault(evidence["result_id"], []).append(_frontend_evidence(evidence))

    items = []
    for result in results:
        items.append({
            "id": result["id"],
            "contract_id": result["document_id"],
            "name": result["title"],
            "status": result["status"],
            "risk": result["risk"],
            "score": result["score"],
            "reason": result["reason"],
            "meta": result["meta"] or {},
            "matched_conditions": result["matched_conditions"] or [],
            "actions": result["actions"] or [],
            "timeline": result["timeline"] or [],
            "evidence": by_result.get(result["id"], []),
        })

    return {
        "task_id": task_id,
        "prompt": task.get("prompt", ""),
        "strategy": task.get("parsed_conditions") or {},
        "items": items,
        "skipped": task.get("skipped") or {},
        "status": task.get("status", ""),
    }


def _frontend_evidence(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": row.get("id"),
        "source": row.get("source") or "合同正文",
        "ref": row.get("ref") or "",
        "text": row.get("text") or "",
        "page": row.get("page"),
        "chunk_id": row.get("chunk_id") or "",
        "condition_id": row.get("condition_id") or "",
    }


def _condition_reason(conditions: Any) -> str:
    if not isinstance(conditions, list) or not conditions:
        return ""
    first = conditions[0]
    if not isinstance(first, dict) or not first.get("label"):
        return ""
    return f"{first['label']}: {first['status']}" if first.get("status") else first["label"]


def _optional_int(value: Any) -> int | None:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _optional_float(value: Any) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None
