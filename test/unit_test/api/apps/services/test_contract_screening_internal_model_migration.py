from api.db.joint_services.contract_screening_internal_model_migration import (
    SPRIXIN_CHAT_ID,
    SPRIXIN_EMBEDDING_ID,
    SPRIXIN_RERANK_ID,
    ensure_contract_agent_internal_models,
)
from common.contract_agent_internal_models import SPRIXIN_EMBEDDING_MAX_TOKENS


class FakeRepository:
    def __init__(self):
        self.providers = {}
        self.instances = {}
        self.models = {}
        self.tenant_updates = []
        self.kb_updates = []

    def get_provider(self, tenant_id, provider_name):
        return self.providers.get((tenant_id, provider_name))

    def create_provider(self, tenant_id, provider_name):
        provider = {
            "id": f"provider-{len(self.providers) + 1}",
            "tenant_id": tenant_id,
            "provider_name": provider_name,
        }
        self.providers[(tenant_id, provider_name)] = provider
        return provider

    def get_instance(self, provider_id, instance_name):
        return self.instances.get((provider_id, instance_name))

    def create_instance(self, provider_id, instance_name, api_key, extra):
        instance = {
            "id": f"instance-{len(self.instances) + 1}",
            "provider_id": provider_id,
            "instance_name": instance_name,
            "api_key": api_key,
            "extra": extra,
        }
        self.instances[(provider_id, instance_name)] = instance
        return instance

    def get_model(self, provider_id, instance_id, model_type, model_name):
        return self.models.get((provider_id, instance_id, model_type, model_name))

    def create_model(self, provider_id, instance_id, model_type, model_name, extra):
        model = {
            "id": f"model-{len(self.models) + 1}",
            "provider_id": provider_id,
            "instance_id": instance_id,
            "model_type": model_type,
            "model_name": model_name,
            "extra": extra,
        }
        self.models[(provider_id, instance_id, model_type, model_name)] = model
        return model

    def update_model_extra(self, model_id, extra):
        for model in self.models.values():
            if model["id"] == model_id:
                model["extra"] = extra
                return

    def update_tenant_defaults(self, tenant_id, chat_id, embedding_id, rerank_id):
        self.tenant_updates.append((tenant_id, chat_id, embedding_id, rerank_id))

    def update_knowledgebase_embedding(self, kb_id, embedding_id):
        self.kb_updates.append((kb_id, embedding_id))


def test_ensure_contract_agent_internal_models_creates_three_instances_and_updates_defaults():
    repo = FakeRepository()

    result = ensure_contract_agent_internal_models(
        tenant_id="tenant-1",
        api_key="sk-test",
        kb_ids=["kb-1"],
        repository=repo,
        dry_run=False,
    )

    assert result.chat_id == SPRIXIN_CHAT_ID
    assert result.embedding_id == SPRIXIN_EMBEDDING_ID
    assert result.rerank_id == SPRIXIN_RERANK_ID
    assert len(repo.instances) == 3
    embedding_model = next(model for model in repo.models.values() if model["model_type"] == "embedding")
    assert embedding_model["extra"] == f'{{"max_tokens": {SPRIXIN_EMBEDDING_MAX_TOKENS}}}'
    assert repo.tenant_updates == [("tenant-1", SPRIXIN_CHAT_ID, SPRIXIN_EMBEDDING_ID, SPRIXIN_RERANK_ID)]
    assert repo.kb_updates == [("kb-1", SPRIXIN_EMBEDDING_ID)]


def test_ensure_contract_agent_internal_models_is_idempotent():
    repo = FakeRepository()

    ensure_contract_agent_internal_models("tenant-1", "sk-test", ["kb-1"], repository=repo, dry_run=False)
    ensure_contract_agent_internal_models("tenant-1", "sk-test", ["kb-1"], repository=repo, dry_run=False)

    assert len(repo.providers) == 1
    assert len(repo.instances) == 3
    assert len(repo.models) == 3


def test_ensure_contract_agent_internal_models_dry_run_does_not_update_tenant_or_kbs():
    repo = FakeRepository()

    result = ensure_contract_agent_internal_models(
        tenant_id="tenant-1",
        api_key="sk-test",
        kb_ids=["kb-1"],
        repository=repo,
        dry_run=True,
    )

    assert result.embedding_id == SPRIXIN_EMBEDDING_ID
    assert repo.providers == {}
    assert repo.instances == {}
    assert repo.models == {}
    assert repo.tenant_updates == []
    assert repo.kb_updates == []


def test_ensure_contract_agent_internal_models_updates_existing_embedding_limit():
    repo = FakeRepository()
    ensure_contract_agent_internal_models("tenant-1", "sk-test", ["kb-1"], repository=repo, dry_run=False)
    embedding_key = next(key for key in repo.models if key[2] == "embedding")
    repo.models[embedding_key]["extra"] = '{"max_tokens": 8192}'

    ensure_contract_agent_internal_models("tenant-1", "sk-test", ["kb-1"], repository=repo, dry_run=False)

    assert repo.models[embedding_key]["extra"] == f'{{"max_tokens": {SPRIXIN_EMBEDDING_MAX_TOKENS}}}'
