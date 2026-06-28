import json
import asyncio

import pytest

from api.apps.services.contract_screening_service import (
    ContractScreeningError,
    ContractScreeningStore,
    build_strategy,
    create_initial_task,
    group_chunks_by_document,
    map_group_to_contract_result,
    mark_stale_task_failed,
    run_screening_task,
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


class FailingRedis(FakeRedis):
    def set_obj(self, key, obj, exp=3600):
        return False


def _new_saved_task(store, prompt="筛选付款周期超过60天且包含违约金条款的合同"):
    task = create_initial_task(
        task_id="task-1",
        tenant_id="tenant-1",
        user_id="user-1",
        kb_id="kb-1",
        prompt=prompt,
        filters={"risk": "全部", "status": "全部", "source": "全部"},
    )
    store.save(task)
    return task


class SearchDatasetsStub:
    def __init__(self, result):
        self.result = result
        self.calls = []

    async def search_datasets(self, tenant_id, req):
        self.calls.append({"tenant_id": tenant_id, "req": req})
        return self.result


class SearchStub:
    def __init__(self, result):
        self.result = result
        self.calls = []

    async def search(self, dataset_id, tenant_id, req):
        self.calls.append({"dataset_id": dataset_id, "tenant_id": tenant_id, "req": req})
        return self.result


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


def test_run_screening_task_retrieves_and_sorts_contract_results():
    store = ContractScreeningStore(redis=FakeRedis(), ttl_seconds=60)
    _new_saved_task(store)
    search = SearchDatasetsStub({
        "chunks": [
            {
                "id": "chunk-low",
                "document_id": "doc-low",
                "docnm_kwd": "服务合同.pdf",
                "content": "付款周期为30天。",
                "score": 0.61,
            },
            {
                "id": "chunk-high",
                "document_id": "doc-high",
                "docnm_kwd": "采购合同.pdf",
                "content": "付款期限为验收合格后90日内完成，逾期承担违约金。",
                "positions": [[3, 1, 1, 1, 1]],
                "score": 0.93,
            },
        ]
    })

    task = asyncio.run(run_screening_task("tenant-1", "task-1", store=store, search_service=search))

    assert search.calls == [{
        "tenant_id": "tenant-1",
        "req": {
            "dataset_ids": ["kb-1"],
            "question": "筛选付款周期超过60天且包含违约金条款的合同",
            "top_k": 64,
            "size": 64,
            "page": 1,
            "similarity_threshold": 0.0,
            "vector_similarity_weight": 0.3,
            "use_kg": False,
        },
    }]
    assert task["status"] == "done"
    assert task["phase"] == "generate_summary"
    assert task["progress"] == 1.0
    assert task["message"] == "筛选完成"
    assert task["strategy"]["query"] == task["prompt"]
    assert task["strategy"]["evidence_policy"]["group_by"] == "document"
    assert task["items"][0]["name"] == "采购合同.pdf"
    assert task["items"][0]["contract_id"] == "doc-high"
    assert [item["meta"]["score"] for item in task["items"]] == [93, 61]
    assert task["skipped"]["unparsed"] == 0
    assert task["error"] == ""

    saved = store.get("tenant-1", "task-1")
    assert saved["status"] == "done"
    assert saved["items"][0]["contract_id"] == "doc-high"


def test_run_screening_task_fails_fast_when_progress_save_fails():
    store = ContractScreeningStore(redis=FailingRedis(), ttl_seconds=60)
    task = create_initial_task(
        task_id="task-1",
        tenant_id="tenant-1",
        user_id="user-1",
        kb_id="kb-1",
        prompt="筛选付款周期超过60天的合同",
        filters={"risk": "全部", "status": "全部", "source": "全部"},
    )
    store.redis.values["contract_screening:tenant-1:task-1"] = json.dumps(task, ensure_ascii=False)

    with pytest.raises(ContractScreeningError) as exc:
        asyncio.run(run_screening_task("tenant-1", "task-1", store=store, search_service=SearchDatasetsStub({"chunks": []})))

    assert exc.value.message == "Failed to persist contract screening task"


def test_mark_stale_task_failed_expires_active_tasks():
    task = create_initial_task(
        task_id="task-1",
        tenant_id="tenant-1",
        user_id="user-1",
        kb_id="kb-1",
        prompt="筛选付款周期超过60天的合同",
        filters={"risk": "全部", "status": "全部", "source": "全部"},
    )
    task.update({"status": "running", "updated_at": 100.0})

    changed = mark_stale_task_failed(task, now=1000.0, stale_seconds=60)

    assert changed is True
    assert task["status"] == "failed"
    assert task["phase"] == "timeout"
    assert task["progress"] == 1.0
    assert "超时" in task["message"]
    assert "超时" in task["error"]


def test_mark_stale_task_failed_keeps_terminal_tasks():
    task = create_initial_task(
        task_id="task-1",
        tenant_id="tenant-1",
        user_id="user-1",
        kb_id="kb-1",
        prompt="筛选付款周期超过60天的合同",
        filters={"risk": "全部", "status": "全部", "source": "全部"},
    )
    task.update({"status": "done", "updated_at": 100.0})

    assert mark_stale_task_failed(task, now=1000.0, stale_seconds=60) is False
    assert task["status"] == "done"


def test_run_screening_task_marks_task_failed_when_search_fails():
    store = ContractScreeningStore(redis=FakeRedis(), ttl_seconds=60)
    _new_saved_task(store)
    search = SearchDatasetsStub((False, "retrieval unavailable"))

    with pytest.raises(ContractScreeningError) as exc:
        asyncio.run(run_screening_task("tenant-1", "task-1", store=store, search_service=search))

    assert "retrieval unavailable" in exc.value.message
    saved = store.get("tenant-1", "task-1")
    assert saved["status"] == "failed"
    assert saved["progress"] == 1.0
    assert "retrieval unavailable" in saved["message"]
    assert "retrieval unavailable" in saved["error"]


def test_run_screening_task_uses_search_method_when_search_datasets_missing():
    store = ContractScreeningStore(redis=FakeRedis(), ttl_seconds=60)
    _new_saved_task(store, prompt="筛选续签合同")
    search = SearchStub((True, {
        "chunks": [
            {
                "chunk_id": "chunk-1",
                "doc_id": "doc-1",
                "doc_name": "续签合同.pdf",
                "content_with_weight": "合同到期后自动续签一年。",
                "similarity": 0.82,
            }
        ]
    }))

    task = asyncio.run(run_screening_task("tenant-1", "task-1", store=store, search_service=search))

    assert search.calls[0]["dataset_id"] == "kb-1"
    assert search.calls[0]["tenant_id"] == "tenant-1"
    assert search.calls[0]["req"]["dataset_ids"] == ["kb-1"]
    assert task["status"] == "done"
    assert task["items"][0]["contract_id"] == "doc-1"


def test_build_strategy_returns_structured_strategy_and_keeps_filters():
    task = create_initial_task(
        task_id="task-1",
        tenant_id="tenant-1",
        user_id="user-1",
        kb_id="kb-1",
        prompt="筛选付款周期超过60天且包含违约金条款的合同",
        filters={"risk": "高", "status": "全部", "source": "全部"},
    )
    strategy = build_strategy(task)

    assert strategy["query"] == task["prompt"]
    assert strategy["filters"] == task["filters"]
    assert any("付款周期" in condition["label"] for condition in strategy["conditions"])
    assert any("违约金" in condition["label"] for condition in strategy["conditions"])
    assert strategy["evidence_policy"]["group_by"] == "document"
    assert strategy["evidence_policy"]["max_evidence_per_contract"] == 5
    assert strategy["limit_per_condition"] > 0


def test_group_chunks_by_document_uses_document_id():
    chunks = [
        {"document_id": "doc-1", "docnm_kwd": "A.pdf", "content": "付款周期90天"},
        {"doc_id": "doc-1", "doc_name": "A.pdf", "content_with_weight": "违约金为每日万分之五"},
        {"document_id": "doc-2", "docnm_kwd": "B.pdf", "content": "付款周期30天"},
        {"docnm_kwd": "C.pdf", "content": "缺少文档ID"},
    ]
    grouped = group_chunks_by_document(chunks)
    assert sorted(grouped) == ["doc-1", "doc-2"]
    assert len(grouped["doc-1"]) == 2
    assert all(chunks[3] not in group for group in grouped.values())


def test_group_chunks_by_document_supports_object_chunks():
    class Chunk:
        def __init__(self, doc_id, content):
            self.doc_id = doc_id
            self.content = content

    chunks = [
        Chunk("doc-1", "付款周期90天"),
        {"document_id": "doc-1", "content": "违约金为每日万分之五"},
        Chunk("doc-2", "付款周期30天"),
    ]

    grouped = group_chunks_by_document(chunks)

    assert sorted(grouped) == ["doc-1", "doc-2"]
    assert grouped["doc-1"][0] is chunks[0]


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
    )

    assert result["contract_id"] == "doc-1"
    assert result["name"] == "采购合同.pdf"
    assert result["overall_status"] == "matched"
    assert result["meta"]["score"] == 91
    assert result["meta"]["confidence"] == 91
    assert result["matched_conditions"][0]["status"] == "matched"
    assert result["matched_conditions"][0]["score"] == 91
    assert result["evidence"][0]["page"] == 12
    assert result["evidence"][0]["chunk_id"] == "chunk-1"


def test_map_group_to_contract_result_maps_page_num_to_evidence():
    class Chunk:
        id = "chunk-1"
        document_id = "doc-1"
        document_name = "采购合同.pdf"
        text = "付款期限为验收合格后90日内完成。"
        page_num = 8
        similarity = 0.8

    result = map_group_to_contract_result(document_id="doc-1", chunks=[Chunk()])

    assert result["evidence"][0]["page"] == 8
    assert result["evidence"][0]["chunk_id"] == "chunk-1"


def test_map_group_to_contract_result_maps_position_int_to_evidence():
    result = map_group_to_contract_result(
        document_id="doc-1",
        chunks=[
            {
                "chunk_id": "chunk-1",
                "document_id": "doc-1",
                "doc_name": "采购合同.pdf",
                "content_with_weight": "付款期限为验收合格后90日内完成。",
                "position_int": [[9, 1, 1, 1, 1]],
                "similarity": 0.8,
            }
        ],
    )

    assert result["evidence"][0]["page"] == 9
    assert result["evidence"][0]["chunk_id"] == "chunk-1"


def test_map_group_to_contract_result_preserves_zero_score():
    result = map_group_to_contract_result(
        document_id="doc-1",
        chunks=[
            {
                "id": "chunk-1",
                "document_id": "doc-1",
                "docnm_kwd": "采购合同.pdf",
                "content": "付款期限未命中。",
                "score": 0,
            }
        ],
    )
    assert result["meta"]["score"] == 0
    assert result["meta"]["confidence"] == 0
    assert result["matched_conditions"][0]["score"] == 0


def test_map_group_to_contract_result_uses_vector_similarity_for_score():
    result = map_group_to_contract_result(
        document_id="doc-1",
        chunks=[
            {
                "id": "chunk-1",
                "document_id": "doc-1",
                "docnm_kwd": "采购合同.pdf",
                "content": "付款期限为验收合格后90日内完成。",
                "vector_similarity": 0.87,
            }
        ],
    )

    assert result["meta"]["score"] == 87
    assert result["meta"]["confidence"] == 87
    assert result["matched_conditions"][0]["score"] == 87


def test_map_group_to_contract_result_scores_all_chunks_but_limits_evidence():
    chunks = [
        {
            "id": f"chunk-{index}",
            "document_id": "doc-1",
            "docnm_kwd": "采购合同.pdf",
            "content": f"第{index}条证据",
            "score": 0.2,
        }
        for index in range(1, 6)
    ]
    chunks.append({
        "id": "chunk-6",
        "document_id": "doc-1",
        "docnm_kwd": "采购合同.pdf",
        "content": "",
        "score": 0.98,
    })

    result = map_group_to_contract_result(
        document_id="doc-1",
        chunks=chunks,
    )

    assert result["meta"]["score"] == 98
    assert result["meta"]["confidence"] == 98
    assert len(result["evidence"]) == 5
    assert [item["chunk_id"] for item in result["evidence"]] == [
        "chunk-1",
        "chunk-2",
        "chunk-3",
        "chunk-4",
        "chunk-5",
    ]
