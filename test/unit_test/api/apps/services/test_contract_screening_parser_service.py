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
import pytest

from api.apps.services.contract_screening_service import ContractScreeningError
from api.apps.services.contract_screening_parser_service import (
    parse_screening_prompt,
    validate_parse_prompt_request,
)


def test_validate_parse_prompt_request_requires_kb_id():
    with pytest.raises(ContractScreeningError) as exc:
        validate_parse_prompt_request({"prompt": "筛选付款周期超过60天的合同"})

    assert exc.value.message == "`kb_id` is required"


def test_validate_parse_prompt_request_requires_prompt():
    with pytest.raises(ContractScreeningError) as exc:
        validate_parse_prompt_request({"kb_id": "kb-1", "prompt": " "})

    assert exc.value.message == "`prompt` is required"


def test_parse_screening_prompt_returns_editable_conditions():
    result = parse_screening_prompt({
        "kb_id": "kb-1",
        "prompt": "筛选付款周期超过60天且包含违约金条款的合同",
        "filters": {"risk": "高"},
    })

    assert result["query"] == "筛选付款周期超过60天且包含违约金条款的合同"
    assert result["filters"] == {"risk": "高", "status": "全部", "source": "全部"}
    assert result["evidence_policy"] == {
        "group_by": "document",
        "max_evidence_per_contract": 5,
    }
    assert {
        condition["id"]: {
            "label": condition["label"],
            "operator": condition["operator"],
            "enabled": condition["enabled"],
        }
        for condition in result["conditions"]
    } == {
        "payment_terms": {
            "label": "付款周期、账期",
            "operator": "exists",
            "enabled": True,
        },
        "penalty_terms": {
            "label": "违约金、逾期责任",
            "operator": "exists",
            "enabled": True,
        },
    }


def test_parse_screening_prompt_falls_back_when_llm_parser_fails():
    def failing_llm_parser(_payload):
        raise RuntimeError("llm unavailable")

    result = parse_screening_prompt(
        {
            "kb_id": "kb-1",
            "prompt": "筛选即将到期并需要续签的合同",
        },
        llm_parser=failing_llm_parser,
    )

    assert result["conditions"][0]["id"] == "renewal_terms"
    assert result["conditions"][0]["enabled"] is True
