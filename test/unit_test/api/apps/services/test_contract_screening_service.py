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
