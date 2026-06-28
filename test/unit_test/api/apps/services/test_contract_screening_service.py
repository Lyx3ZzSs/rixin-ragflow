import json

import pytest

from api.apps.services.contract_screening_service import (
    ContractScreeningError,
    ContractScreeningStore,
    build_strategy,
    create_initial_task,
    group_chunks_by_document,
    map_group_to_contract_result,
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
