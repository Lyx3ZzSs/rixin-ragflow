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

import logging
from typing import Any, Callable

from api.apps.services.contract_screening_service import (
    ContractScreeningError,
    build_strategy,
    validate_create_task_request,
)


def validate_parse_prompt_request(req: dict[str, Any]) -> dict[str, Any]:
    return validate_create_task_request(req)


def parse_screening_prompt(
    req: dict[str, Any],
    *,
    llm_parser: Callable[[dict[str, Any]], dict[str, Any]] | None = None,
) -> dict[str, Any]:
    payload = validate_parse_prompt_request(req)
    if llm_parser:
        try:
            parsed = llm_parser(payload)
            return _normalize_parsed_payload(payload, parsed)
        except Exception:
            logging.exception("contract screening prompt LLM parse failed, falling back to rules")

    return _normalize_parsed_payload(payload, build_strategy(payload))


def _normalize_parsed_payload(payload: dict[str, Any], parsed: dict[str, Any]) -> dict[str, Any]:
    strategy = parsed if isinstance(parsed, dict) else {}
    evidence_policy = strategy.get("evidence_policy") if isinstance(strategy.get("evidence_policy"), dict) else {}
    return {
        "query": str(strategy.get("query") or payload["prompt"]),
        "conditions": [_normalize_condition(condition) for condition in strategy.get("conditions", []) if isinstance(condition, dict)],
        "filters": strategy.get("filters") if isinstance(strategy.get("filters"), dict) else payload["filters"],
        "evidence_policy": {
            "group_by": evidence_policy.get("group_by") or "document",
            "max_evidence_per_contract": int(evidence_policy.get("max_evidence_per_contract") or 5),
        },
    }


def _normalize_condition(condition: dict[str, Any]) -> dict[str, Any]:
    keywords = condition.get("keywords")
    if not isinstance(keywords, list):
        keywords = []
    return {
        "id": str(condition.get("id") or "contract_terms"),
        "label": str(condition.get("label") or "合同筛选条件"),
        "keywords": [str(keyword) for keyword in keywords if str(keyword).strip()],
        "operator": str(condition.get("operator") or "exists"),
        "value": str(condition.get("value") or ""),
        "enabled": bool(condition.get("enabled", True)),
    }
