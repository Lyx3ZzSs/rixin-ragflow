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
from api.apps.services.contract_screening_feedback_service import create_screening_feedback


class FakeRepository:
    def __init__(self):
        self.records = []

    def build_results_payload(self, tenant_id, task_id):
        if tenant_id != "tenant-1" or task_id != "task-1":
            return None
        return {
            "task_id": task_id,
            "status": "done",
            "items": [
                {
                    "id": "result-1",
                    "contract_id": "doc-1",
                    "evidence": [{"id": "evidence-1", "text": "付款期限90天"}],
                }
            ],
        }

    def create_feedback_record(self, record):
        self.records.append(record)


def test_create_screening_feedback_saves_result_feedback():
    repository = FakeRepository()

    result = create_screening_feedback(
        tenant_id="tenant-1",
        user_id="user-1",
        task_id="task-1",
        payload={
            "result_id": "result-1",
            "evidence_id": "evidence-1",
            "feedback_type": "useful",
            "comment": "证据准确",
        },
        repository=repository,
    )

    assert result["feedback_id"]
    assert result["task_id"] == "task-1"
    assert result["result_id"] == "result-1"
    assert result["evidence_id"] == "evidence-1"
    assert result["feedback_type"] == "useful"
    assert repository.records[0]["user_id"] == "user-1"
    assert repository.records[0]["comment"] == "证据准确"


def test_create_screening_feedback_rejects_unknown_type():
    with pytest.raises(ContractScreeningError, match="Unsupported feedback type"):
        create_screening_feedback(
            tenant_id="tenant-1",
            user_id="user-1",
            task_id="task-1",
            payload={"feedback_type": "maybe"},
            repository=FakeRepository(),
        )


def test_create_screening_feedback_rejects_foreign_result():
    with pytest.raises(ContractScreeningError, match="Result not found"):
        create_screening_feedback(
            tenant_id="tenant-1",
            user_id="user-1",
            task_id="task-1",
            payload={"result_id": "other-result", "feedback_type": "not_relevant"},
            repository=FakeRepository(),
        )


def test_create_screening_feedback_rejects_foreign_evidence():
    with pytest.raises(ContractScreeningError, match="Evidence not found"):
        create_screening_feedback(
            tenant_id="tenant-1",
            user_id="user-1",
            task_id="task-1",
            payload={"result_id": "result-1", "evidence_id": "other-evidence", "feedback_type": "missing_evidence"},
            repository=FakeRepository(),
        )
