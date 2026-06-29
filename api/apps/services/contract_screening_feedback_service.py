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

from typing import Any

from api.apps.services.contract_screening_service import ContractScreeningError
from api.db.services import contract_screening_service as contract_screening_db_service
from common.misc_utils import get_uuid


FEEDBACK_TYPES = {"useful", "not_relevant", "missing_evidence", "wrong_metadata"}
MAX_COMMENT_LENGTH = 2000


def create_screening_feedback(
    *,
    tenant_id: str,
    user_id: str,
    task_id: str,
    payload: dict[str, Any],
    repository: Any = contract_screening_db_service,
) -> dict[str, Any]:
    feedback = _normalize_feedback_payload(payload)
    result_id = feedback["result_id"]
    evidence_id = feedback["evidence_id"]

    task_payload = repository.build_results_payload(tenant_id, task_id, user_id=user_id)
    if not task_payload:
        raise ContractScreeningError("Task not found")
    if result_id:
        result = _find_result(task_payload, result_id)
        if not result:
            raise ContractScreeningError("Result not found")
        if evidence_id and not _find_evidence(result, evidence_id):
            raise ContractScreeningError("Evidence not found")

    feedback_id = get_uuid()
    record = {
        "id": feedback_id,
        "task_id": task_id,
        "result_id": result_id,
        "evidence_id": evidence_id,
        "tenant_id": tenant_id,
        "user_id": user_id,
        "feedback_type": feedback["feedback_type"],
        "comment": feedback["comment"],
    }
    _create_feedback_record(repository, record)

    return {
        "feedback_id": feedback_id,
        "task_id": task_id,
        "result_id": result_id,
        "evidence_id": evidence_id,
        "feedback_type": feedback["feedback_type"],
    }


def _normalize_feedback_payload(payload: dict[str, Any]) -> dict[str, str]:
    if not isinstance(payload, dict):
        payload = {}
    feedback_type = str(payload.get("feedback_type") or "").strip().lower()
    if feedback_type not in FEEDBACK_TYPES:
        raise ContractScreeningError("Unsupported feedback type")

    return {
        "result_id": str(payload.get("result_id") or "").strip(),
        "evidence_id": str(payload.get("evidence_id") or "").strip(),
        "feedback_type": feedback_type,
        "comment": str(payload.get("comment") or "").strip()[:MAX_COMMENT_LENGTH],
    }


def _find_result(payload: dict[str, Any], result_id: str) -> dict[str, Any] | None:
    for item in payload.get("items") or []:
        if not isinstance(item, dict):
            continue
        identifiers = (
            item.get("id"),
            item.get("contract_id"),
            item.get("document_id"),
        )
        if any(str(identifier or "") == result_id for identifier in identifiers):
            return item
    return None


def _find_evidence(result: dict[str, Any], evidence_id: str) -> dict[str, Any] | None:
    for evidence in result.get("evidence") or []:
        if isinstance(evidence, dict) and str(evidence.get("id") or "") == evidence_id:
            return evidence
    return None


def _create_feedback_record(repository: Any, record: dict[str, Any]) -> None:
    create = getattr(repository, "create_feedback_record", None)
    if callable(create):
        create(record)
        return
    repository.ContractScreeningFeedbackService.insert(**record)
