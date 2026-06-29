import pytest

from api.apps.services.contract_screening_model_policy import (
    CONTRACT_AGENT_INTERNAL_MODEL_ERROR,
    SPRIXIN_CHAT_ID,
    SPRIXIN_EMBEDDING_ID,
    SPRIXIN_RERANK_ID,
    validate_contract_model_config,
    validate_contract_screening_models,
)
from api.apps.services.contract_screening_service import ContractScreeningError


class FakeKnowledgebase:
    def __init__(self, embd_id):
        self.embd_id = embd_id


class FakeSearchService:
    def __init__(self, detail=None):
        self.detail = detail

    def get_detail(self, search_id):
        return self.detail if search_id == "search-1" else None


class FakeRepository:
    def __init__(self, configs, search_detail=None):
        self.configs = configs
        self.search_service = FakeSearchService(search_detail)

    def get_knowledgebase(self, kb_id):
        return FakeKnowledgebase(self.configs.get(("kb", kb_id), self.configs.get(("kb", "default"), SPRIXIN_EMBEDDING_ID)))

    def get_model_config(self, tenant_id, model_type, model_id):
        return self.configs[(model_type, model_id)]

    def get_default_model_config(self, tenant_id, model_type):
        return self.configs[("default", model_type)]

    def get_search_detail(self, search_id):
        return self.search_service.get_detail(search_id)


def internal_config(model_type, model_name, base_url):
    return {
        "llm_factory": "OpenAI-API-Compatible",
        "llm_name": model_name,
        "api_base": base_url,
        "model_type": model_type,
    }


def test_validate_contract_model_config_accepts_internal_base_url():
    validate_contract_model_config(
        tenant_id="tenant-1",
        kb_id="kb-1",
        model_type="chat",
        model_id=SPRIXIN_CHAT_ID,
        model_config=internal_config("chat", "Qwen3-30B-A3B", "http://10.10.10.245:8000/v1"),
    )


def test_validate_contract_model_config_rejects_blocked_provider():
    with pytest.raises(ContractScreeningError) as exc:
        validate_contract_model_config(
            tenant_id="tenant-1",
            kb_id="kb-1",
            model_type="embedding",
            model_id="BAAI/bge-large-zh-v1.5@SILICONFLOW@SILICONFLOW",
            model_config={
                "llm_factory": "SILICONFLOW",
                "llm_name": "BAAI/bge-large-zh-v1.5",
                "api_base": "https://api.siliconflow.cn/v1",
                "model_type": "embedding",
            },
        )

    assert exc.value.message == CONTRACT_AGENT_INTERNAL_MODEL_ERROR


def test_validate_contract_model_config_rejects_external_base_url():
    with pytest.raises(ContractScreeningError) as exc:
        validate_contract_model_config(
            tenant_id="tenant-1",
            kb_id="kb-1",
            model_type="rerank",
            model_id="reranker@external@OpenAI-API-Compatible",
            model_config=internal_config("rerank", "reranker", "https://example.com/rerank"),
        )

    assert exc.value.message == CONTRACT_AGENT_INTERNAL_MODEL_ERROR


def test_validate_contract_screening_models_checks_kb_embedding_and_request_rerank():
    repo = FakeRepository(
        {
            ("kb", "default"): SPRIXIN_EMBEDDING_ID,
            ("embedding", SPRIXIN_EMBEDDING_ID): internal_config("embedding", "bge-m3", "http://10.10.10.245:8000"),
            ("rerank", SPRIXIN_RERANK_ID): internal_config("rerank", "bge-reranker-v2-m3", "http://10.10.10.245:8000/rerank"),
        }
    )

    validate_contract_screening_models(
        tenant_id="tenant-1",
        task={"kb_id": "kb-1"},
        search_req={"rerank_id": SPRIXIN_RERANK_ID},
        repository=repo,
    )


def test_validate_contract_screening_models_rejects_external_kb_embedding():
    repo = FakeRepository(
        {
            ("kb", "default"): "BAAI/bge-large-zh-v1.5@SILICONFLOW@SILICONFLOW",
            ("embedding", "BAAI/bge-large-zh-v1.5@SILICONFLOW@SILICONFLOW"): {
                "llm_factory": "SILICONFLOW",
                "llm_name": "BAAI/bge-large-zh-v1.5",
                "api_base": "https://api.siliconflow.cn/v1",
                "model_type": "embedding",
            },
        }
    )

    with pytest.raises(ContractScreeningError):
        validate_contract_screening_models(
            tenant_id="tenant-1",
            task={"kb_id": "kb-1"},
            search_req={},
            repository=repo,
        )


def test_validate_contract_screening_models_checks_search_config_chat_and_rerank():
    repo = FakeRepository(
        {
            ("kb", "default"): SPRIXIN_EMBEDDING_ID,
            ("embedding", SPRIXIN_EMBEDDING_ID): internal_config("embedding", "bge-m3", "http://10.10.10.245:8000"),
            ("chat", SPRIXIN_CHAT_ID): internal_config("chat", "Qwen3-30B-A3B", "http://10.10.10.245:8000/v1"),
            ("rerank", SPRIXIN_RERANK_ID): internal_config("rerank", "bge-reranker-v2-m3", "http://10.10.10.245:8000/rerank"),
        },
        search_detail={
            "search_config": {
                "chat_id": SPRIXIN_CHAT_ID,
                "rerank_id": SPRIXIN_RERANK_ID,
                "meta_data_filter": {"method": "auto"},
            }
        },
    )

    validate_contract_screening_models(
        tenant_id="tenant-1",
        task={"kb_id": "kb-1"},
        search_req={"search_id": "search-1"},
        repository=repo,
    )
