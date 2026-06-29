# Contract Agent Internal Model Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure contract-agent screening uses only Sprixin enterprise-internal chat, embedding, and rerank models, and reject external model providers during screening.

**Architecture:** Keep RAGFlow's existing provider-instance model architecture. Add a contract-agent model policy module that validates model configs before retrieval, and add an idempotent migration helper that creates Sprixin model provider instances and updates tenant / knowledge base model IDs. Document parsing stays unchanged in this phase.

**Tech Stack:** Python 3.13, Peewee services, RAGFlow model provider tables, pytest, existing contract screening service.

---

## File Structure

- Create `api/apps/services/contract_screening_model_policy.py`
  - Owns the contract-agent internal model allowlist, external provider blocklist, and runtime validation.
- Create `api/apps/services/contract_screening_internal_model_migration.py`
  - Owns idempotent creation of Sprixin provider instances and model rows, plus tenant / knowledge base model ID updates.
- Create `tools/scripts/contract_agent_internal_model_migration.py`
  - CLI wrapper for running dry-run and real migration from the local environment.
- Modify `api/apps/services/contract_screening_service.py`
  - Calls model policy validation before invoking dataset retrieval.
- Create `test/unit_test/api/apps/services/test_contract_screening_model_policy.py`
  - Tests internal / external model validation without a real database.
- Create `test/unit_test/api/apps/services/test_contract_screening_internal_model_migration.py`
  - Tests migration idempotency with fake repositories.
- Modify `test/unit_test/api/apps/services/test_contract_screening_service.py`
  - Keeps existing screening tests isolated from DB by injecting an allow-all policy and adds one rejection test.

## Constants

Use these exact values in implementation:

```python
CONTRACT_AGENT_INTERNAL_MODEL_ERROR = "合同筛选仅允许使用企业内网模型，请切换知识库和检索配置后重试。"
SPRIXIN_PROVIDER_NAME = "OpenAI-API-Compatible"
SPRIXIN_CHAT_INSTANCE = "sprixin-chat"
SPRIXIN_EMBEDDING_INSTANCE = "sprixin-embedding"
SPRIXIN_RERANK_INSTANCE = "sprixin-rerank"
SPRIXIN_CHAT_MODEL = "Qwen3-30B-A3B"
SPRIXIN_EMBEDDING_MODEL = "bge-m3"
SPRIXIN_RERANK_MODEL = "bge-reranker-v2-m3"
SPRIXIN_CHAT_BASE_URL = "http://10.10.10.245:8000/v1"
SPRIXIN_EMBEDDING_BASE_URL = "http://10.10.10.245:8000"
SPRIXIN_RERANK_BASE_URL = "http://10.10.10.245:8000/rerank"
SPRIXIN_ALLOWED_BASE_URLS = {
    SPRIXIN_CHAT_BASE_URL,
    SPRIXIN_EMBEDDING_BASE_URL,
    SPRIXIN_RERANK_BASE_URL,
}
CONTRACT_AGENT_BLOCKED_PROVIDERS = {
    "SILICONFLOW",
    "OpenAI",
    "Azure-OpenAI",
    "OpenRouter",
}
```

Expected model IDs:

```python
SPRIXIN_CHAT_ID = "Qwen3-30B-A3B@sprixin-chat@OpenAI-API-Compatible"
SPRIXIN_EMBEDDING_ID = "bge-m3@sprixin-embedding@OpenAI-API-Compatible"
SPRIXIN_RERANK_ID = "bge-reranker-v2-m3@sprixin-rerank@OpenAI-API-Compatible"
```

### Task 1: Add Contract-Agent Model Policy Tests

**Files:**
- Create: `test/unit_test/api/apps/services/test_contract_screening_model_policy.py`
- Create later: `api/apps/services/contract_screening_model_policy.py`

- [ ] **Step 1: Write failing unit tests**

Create `test/unit_test/api/apps/services/test_contract_screening_model_policy.py`:

```python
import pytest

from api.apps.services.contract_screening_service import ContractScreeningError
from api.apps.services.contract_screening_model_policy import (
    CONTRACT_AGENT_INTERNAL_MODEL_ERROR,
    SPRIXIN_CHAT_ID,
    SPRIXIN_EMBEDDING_ID,
    SPRIXIN_RERANK_ID,
    validate_contract_model_config,
    validate_contract_screening_models,
)


class FakeKnowledgebase:
    def __init__(self, embd_id):
        self.embd_id = embd_id


class FakeSearchService:
    def __init__(self, detail=None):
        self.detail = detail

    def get_detail(self, search_id):
        return self.detail if search_id == "search-1" else None


class FakeRepository:
    def __init__(self, configs, kb_embd_id=SPRIXIN_EMBEDDING_ID, search_detail=None):
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
    repo = FakeRepository({
        ("kb", "default"): SPRIXIN_EMBEDDING_ID,
        ("embedding", SPRIXIN_EMBEDDING_ID): internal_config("embedding", "bge-m3", "http://10.10.10.245:8000"),
        ("rerank", SPRIXIN_RERANK_ID): internal_config("rerank", "bge-reranker-v2-m3", "http://10.10.10.245:8000/rerank"),
    })

    validate_contract_screening_models(
        tenant_id="tenant-1",
        task={"kb_id": "kb-1"},
        search_req={"rerank_id": SPRIXIN_RERANK_ID},
        repository=repo,
    )


def test_validate_contract_screening_models_rejects_external_kb_embedding():
    repo = FakeRepository({
        ("kb", "default"): "BAAI/bge-large-zh-v1.5@SILICONFLOW@SILICONFLOW",
        ("embedding", "BAAI/bge-large-zh-v1.5@SILICONFLOW@SILICONFLOW"): {
            "llm_factory": "SILICONFLOW",
            "llm_name": "BAAI/bge-large-zh-v1.5",
            "api_base": "https://api.siliconflow.cn/v1",
            "model_type": "embedding",
        },
    })

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
```

- [ ] **Step 2: Run the new test to verify it fails**

Run:

```bash
env -u VIRTUAL_ENV uv run pytest test/unit_test/api/apps/services/test_contract_screening_model_policy.py -q
```

Expected: FAIL with `ModuleNotFoundError` or import errors for `contract_screening_model_policy`.

### Task 2: Implement Contract-Agent Model Policy

**Files:**
- Create: `api/apps/services/contract_screening_model_policy.py`
- Test: `test/unit_test/api/apps/services/test_contract_screening_model_policy.py`

- [ ] **Step 1: Implement the policy module**

Create `api/apps/services/contract_screening_model_policy.py` with:

```python
from __future__ import annotations

import logging
from typing import Any

from api.apps.services.contract_screening_service import ContractScreeningError
from api.db.joint_services.tenant_model_service import get_model_config_from_provider_instance, get_tenant_default_model_by_type
from api.db.services.knowledgebase_service import KnowledgebaseService
from api.db.services.search_service import SearchService
from common.constants import LLMType

CONTRACT_AGENT_INTERNAL_MODEL_ERROR = "合同筛选仅允许使用企业内网模型，请切换知识库和检索配置后重试。"
SPRIXIN_PROVIDER_NAME = "OpenAI-API-Compatible"
SPRIXIN_CHAT_INSTANCE = "sprixin-chat"
SPRIXIN_EMBEDDING_INSTANCE = "sprixin-embedding"
SPRIXIN_RERANK_INSTANCE = "sprixin-rerank"
SPRIXIN_CHAT_MODEL = "Qwen3-30B-A3B"
SPRIXIN_EMBEDDING_MODEL = "bge-m3"
SPRIXIN_RERANK_MODEL = "bge-reranker-v2-m3"
SPRIXIN_CHAT_BASE_URL = "http://10.10.10.245:8000/v1"
SPRIXIN_EMBEDDING_BASE_URL = "http://10.10.10.245:8000"
SPRIXIN_RERANK_BASE_URL = "http://10.10.10.245:8000/rerank"
SPRIXIN_ALLOWED_BASE_URLS = {
    SPRIXIN_CHAT_BASE_URL,
    SPRIXIN_EMBEDDING_BASE_URL,
    SPRIXIN_RERANK_BASE_URL,
}
CONTRACT_AGENT_BLOCKED_PROVIDERS = {
    "SILICONFLOW",
    "OpenAI",
    "Azure-OpenAI",
    "OpenRouter",
}
SPRIXIN_CHAT_ID = f"{SPRIXIN_CHAT_MODEL}@{SPRIXIN_CHAT_INSTANCE}@{SPRIXIN_PROVIDER_NAME}"
SPRIXIN_EMBEDDING_ID = f"{SPRIXIN_EMBEDDING_MODEL}@{SPRIXIN_EMBEDDING_INSTANCE}@{SPRIXIN_PROVIDER_NAME}"
SPRIXIN_RERANK_ID = f"{SPRIXIN_RERANK_MODEL}@{SPRIXIN_RERANK_INSTANCE}@{SPRIXIN_PROVIDER_NAME}"


class DefaultContractModelPolicyRepository:
    def get_knowledgebase(self, kb_id: str) -> Any:
        exists, kb = KnowledgebaseService.get_by_id(kb_id)
        if not exists:
            raise ContractScreeningError("Knowledge base not found")
        return kb

    def get_model_config(self, tenant_id: str, model_type: str, model_id: str) -> dict[str, Any]:
        return get_model_config_from_provider_instance(tenant_id, model_type, model_id)

    def get_default_model_config(self, tenant_id: str, model_type: str) -> dict[str, Any]:
        return get_tenant_default_model_by_type(tenant_id, model_type)

    def get_search_detail(self, search_id: str) -> dict[str, Any] | None:
        return SearchService.get_detail(search_id)


def _normalise_base_url(base_url: str | None) -> str:
    return str(base_url or "").strip().rstrip("/")


def _reject_external_model(*, tenant_id: str, kb_id: str, model_type: str, model_id: str, model_config: dict[str, Any], reason: str) -> None:
    logging.warning(
        "contract screening rejected external model: tenant_id=%s kb_id=%s model_type=%s model_id=%s provider=%s base_url=%s reason=%s",
        tenant_id,
        kb_id,
        model_type,
        model_id,
        model_config.get("llm_factory"),
        model_config.get("api_base"),
        reason,
    )
    raise ContractScreeningError(CONTRACT_AGENT_INTERNAL_MODEL_ERROR)


def validate_contract_model_config(
    *,
    tenant_id: str,
    kb_id: str,
    model_type: str,
    model_id: str,
    model_config: dict[str, Any],
) -> None:
    provider = str(model_config.get("llm_factory") or "")
    base_url = _normalise_base_url(model_config.get("api_base"))
    if provider in CONTRACT_AGENT_BLOCKED_PROVIDERS:
        _reject_external_model(tenant_id=tenant_id, kb_id=kb_id, model_type=model_type, model_id=model_id, model_config=model_config, reason="blocked provider")
    if provider != SPRIXIN_PROVIDER_NAME:
        _reject_external_model(tenant_id=tenant_id, kb_id=kb_id, model_type=model_type, model_id=model_id, model_config=model_config, reason="provider is not Sprixin internal compatible provider")
    if base_url not in SPRIXIN_ALLOWED_BASE_URLS:
        _reject_external_model(tenant_id=tenant_id, kb_id=kb_id, model_type=model_type, model_id=model_id, model_config=model_config, reason="base url is not allowlisted")


def _validate_model_id(tenant_id: str, kb_id: str, model_type: str, model_id: str, repository: Any) -> None:
    config = repository.get_model_config(tenant_id, model_type, model_id)
    validate_contract_model_config(tenant_id=tenant_id, kb_id=kb_id, model_type=model_type, model_id=model_id, model_config=config)


def _validate_default_chat(tenant_id: str, kb_id: str, repository: Any) -> None:
    config = repository.get_default_model_config(tenant_id, LLMType.CHAT.value)
    validate_contract_model_config(tenant_id=tenant_id, kb_id=kb_id, model_type=LLMType.CHAT.value, model_id=config.get("llm_name", ""), model_config=config)


def validate_contract_screening_models(
    *,
    tenant_id: str,
    task: dict[str, Any],
    search_req: dict[str, Any],
    repository: Any | None = None,
) -> None:
    repository = repository or DefaultContractModelPolicyRepository()
    kb_id = str(task.get("kb_id") or "")
    kb = repository.get_knowledgebase(kb_id)
    embd_id = getattr(kb, "embd_id", None) or kb.get("embd_id")
    _validate_model_id(tenant_id, kb_id, LLMType.EMBEDDING.value, embd_id, repository)

    if search_req.get("rerank_id"):
        _validate_model_id(tenant_id, kb_id, LLMType.RERANK.value, str(search_req["rerank_id"]), repository)

    search_id = search_req.get("search_id")
    if not search_id:
        return
    search_detail = repository.get_search_detail(str(search_id)) or {}
    search_config = search_detail.get("search_config") or {}
    if search_config.get("rerank_id"):
        _validate_model_id(tenant_id, kb_id, LLMType.RERANK.value, str(search_config["rerank_id"]), repository)
    meta_data_filter = search_config.get("meta_data_filter") or {}
    if meta_data_filter.get("method") in {"auto", "semi_auto"}:
        chat_id = search_config.get("chat_id")
        if chat_id:
            _validate_model_id(tenant_id, kb_id, LLMType.CHAT.value, str(chat_id), repository)
        else:
            _validate_default_chat(tenant_id, kb_id, repository)
    if search_config.get("keyword") or search_config.get("use_kg"):
        _validate_default_chat(tenant_id, kb_id, repository)
```

- [ ] **Step 2: Run policy tests**

Run:

```bash
env -u VIRTUAL_ENV uv run pytest test/unit_test/api/apps/services/test_contract_screening_model_policy.py -q
```

Expected: PASS.

- [ ] **Step 3: Commit policy module**

```bash
git add api/apps/services/contract_screening_model_policy.py test/unit_test/api/apps/services/test_contract_screening_model_policy.py
git commit -m "feat(contract-agent): add internal model policy"
```

### Task 3: Add Migration Helper Tests

**Files:**
- Create: `test/unit_test/api/apps/services/test_contract_screening_internal_model_migration.py`
- Create later: `api/apps/services/contract_screening_internal_model_migration.py`

- [ ] **Step 1: Write failing migration tests**

Create `test/unit_test/api/apps/services/test_contract_screening_internal_model_migration.py`:

```python
from api.apps.services.contract_screening_internal_model_migration import (
    SPRIXIN_CHAT_ID,
    SPRIXIN_EMBEDDING_ID,
    SPRIXIN_RERANK_ID,
    ensure_contract_agent_internal_models,
)


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
        provider = {"id": f"provider-{len(self.providers) + 1}", "tenant_id": tenant_id, "provider_name": provider_name}
        self.providers[(tenant_id, provider_name)] = provider
        return provider

    def get_instance(self, provider_id, instance_name):
        return self.instances.get((provider_id, instance_name))

    def create_instance(self, provider_id, instance_name, api_key, extra):
        instance = {"id": f"instance-{len(self.instances) + 1}", "provider_id": provider_id, "instance_name": instance_name, "api_key": api_key, "extra": extra}
        self.instances[(provider_id, instance_name)] = instance
        return instance

    def get_model(self, provider_id, instance_id, model_type, model_name):
        return self.models.get((provider_id, instance_id, model_type, model_name))

    def create_model(self, provider_id, instance_id, model_type, model_name, extra):
        model = {"id": f"model-{len(self.models) + 1}", "provider_id": provider_id, "instance_id": instance_id, "model_type": model_type, "model_name": model_name, "extra": extra}
        self.models[(provider_id, instance_id, model_type, model_name)] = model
        return model

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
    assert repo.tenant_updates == []
    assert repo.kb_updates == []
```

- [ ] **Step 2: Run migration tests to verify they fail**

Run:

```bash
env -u VIRTUAL_ENV uv run pytest test/unit_test/api/apps/services/test_contract_screening_internal_model_migration.py -q
```

Expected: FAIL with `ModuleNotFoundError` or missing function errors.

### Task 4: Implement Migration Helper and CLI

**Files:**
- Create: `api/apps/services/contract_screening_internal_model_migration.py`
- Create: `tools/scripts/contract_agent_internal_model_migration.py`
- Test: `test/unit_test/api/apps/services/test_contract_screening_internal_model_migration.py`

- [ ] **Step 1: Implement migration helper**

Create `api/apps/services/contract_screening_internal_model_migration.py`:

```python
from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from api.apps.services.contract_screening_model_policy import (
    SPRIXIN_CHAT_BASE_URL,
    SPRIXIN_CHAT_ID,
    SPRIXIN_CHAT_INSTANCE,
    SPRIXIN_CHAT_MODEL,
    SPRIXIN_EMBEDDING_BASE_URL,
    SPRIXIN_EMBEDDING_ID,
    SPRIXIN_EMBEDDING_INSTANCE,
    SPRIXIN_EMBEDDING_MODEL,
    SPRIXIN_PROVIDER_NAME,
    SPRIXIN_RERANK_BASE_URL,
    SPRIXIN_RERANK_ID,
    SPRIXIN_RERANK_INSTANCE,
    SPRIXIN_RERANK_MODEL,
)
from api.db.services.knowledgebase_service import KnowledgebaseService
from api.db.services.tenant_model_instance_service import TenantModelInstanceService
from api.db.services.tenant_model_provider_service import TenantModelProviderService
from api.db.services.tenant_model_service import TenantModelService
from api.db.services.user_service import TenantService
from common.constants import LLMType


@dataclass(frozen=True)
class InternalModelMigrationResult:
    chat_id: str
    embedding_id: str
    rerank_id: str


class DefaultInternalModelMigrationRepository:
    def get_provider(self, tenant_id: str, provider_name: str) -> Any:
        return TenantModelProviderService.get_by_tenant_id_and_provider_name(tenant_id, provider_name)

    def create_provider(self, tenant_id: str, provider_name: str) -> Any:
        TenantModelProviderService.insert(tenant_id=tenant_id, provider_name=provider_name)
        return TenantModelProviderService.get_by_tenant_id_and_provider_name(tenant_id, provider_name)

    def get_instance(self, provider_id: str, instance_name: str) -> Any:
        return TenantModelInstanceService.get_by_provider_id_and_instance_name(provider_id, instance_name)

    def create_instance(self, provider_id: str, instance_name: str, api_key: str, extra: str) -> Any:
        return TenantModelInstanceService.create_instance(provider_id=provider_id, instance_name=instance_name, api_key=api_key, extra=extra)

    def get_model(self, provider_id: str, instance_id: str, model_type: str, model_name: str) -> Any:
        return TenantModelService.get_by_provider_id_and_instance_id_and_model_type_and_model_name(provider_id, instance_id, model_type, model_name)

    def create_model(self, provider_id: str, instance_id: str, model_type: str, model_name: str, extra: str) -> Any:
        return TenantModelService.insert(provider_id=provider_id, instance_id=instance_id, model_type=model_type, model_name=model_name, extra=extra)

    def update_tenant_defaults(self, tenant_id: str, chat_id: str, embedding_id: str, rerank_id: str) -> None:
        TenantService.update_by_id(tenant_id, {"llm_id": chat_id, "embd_id": embedding_id, "rerank_id": rerank_id})

    def update_knowledgebase_embedding(self, kb_id: str, embedding_id: str) -> None:
        KnowledgebaseService.update_by_id(kb_id, {"embd_id": embedding_id})


def _obj_id(obj: Any) -> str:
    return obj["id"] if isinstance(obj, dict) else obj.id


def _ensure_provider(tenant_id: str, repository: Any) -> Any:
    provider = repository.get_provider(tenant_id, SPRIXIN_PROVIDER_NAME)
    return provider or repository.create_provider(tenant_id, SPRIXIN_PROVIDER_NAME)


def _ensure_instance(provider_id: str, instance_name: str, api_key: str, base_url: str, repository: Any) -> Any:
    instance = repository.get_instance(provider_id, instance_name)
    if instance:
        return instance
    return repository.create_instance(provider_id, instance_name, api_key, json.dumps({"base_url": base_url}, ensure_ascii=False))


def _ensure_model(provider_id: str, instance_id: str, model_type: str, model_name: str, max_tokens: int, repository: Any) -> None:
    model = repository.get_model(provider_id, instance_id, model_type, model_name)
    if model:
        return
    repository.create_model(provider_id, instance_id, model_type, model_name, json.dumps({"max_tokens": max_tokens}, ensure_ascii=False))


def ensure_contract_agent_internal_models(
    tenant_id: str,
    api_key: str,
    kb_ids: list[str],
    *,
    repository: Any | None = None,
    dry_run: bool = False,
) -> InternalModelMigrationResult:
    repository = repository or DefaultInternalModelMigrationRepository()
    provider = _ensure_provider(tenant_id, repository)
    provider_id = _obj_id(provider)

    chat = _ensure_instance(provider_id, SPRIXIN_CHAT_INSTANCE, api_key, SPRIXIN_CHAT_BASE_URL, repository)
    embedding = _ensure_instance(provider_id, SPRIXIN_EMBEDDING_INSTANCE, api_key, SPRIXIN_EMBEDDING_BASE_URL, repository)
    rerank = _ensure_instance(provider_id, SPRIXIN_RERANK_INSTANCE, api_key, SPRIXIN_RERANK_BASE_URL, repository)

    _ensure_model(provider_id, _obj_id(chat), LLMType.CHAT.value, SPRIXIN_CHAT_MODEL, 32768, repository)
    _ensure_model(provider_id, _obj_id(embedding), LLMType.EMBEDDING.value, SPRIXIN_EMBEDDING_MODEL, 8192, repository)
    _ensure_model(provider_id, _obj_id(rerank), LLMType.RERANK.value, SPRIXIN_RERANK_MODEL, 8192, repository)

    result = InternalModelMigrationResult(chat_id=SPRIXIN_CHAT_ID, embedding_id=SPRIXIN_EMBEDDING_ID, rerank_id=SPRIXIN_RERANK_ID)
    if dry_run:
        return result

    repository.update_tenant_defaults(tenant_id, result.chat_id, result.embedding_id, result.rerank_id)
    for kb_id in kb_ids:
        repository.update_knowledgebase_embedding(kb_id, result.embedding_id)
    return result
```

- [ ] **Step 2: Implement CLI wrapper**

Create `tools/scripts/contract_agent_internal_model_migration.py`:

```python
from __future__ import annotations

import argparse
import os
import sys

from api.apps.services.contract_screening_internal_model_migration import ensure_contract_agent_internal_models


def main() -> int:
    parser = argparse.ArgumentParser(description="Configure contract-agent to use Sprixin internal models.")
    parser.add_argument("--tenant-id", default=os.getenv("CONTRACT_AGENT_TENANT_ID"), required=not os.getenv("CONTRACT_AGENT_TENANT_ID"))
    parser.add_argument("--kb-id", action="append", default=[], help="Knowledge base ID to switch to internal embedding. Repeat for multiple KBs.")
    parser.add_argument("--api-key", default=os.getenv("SPRIXIN_MODEL_API_KEY"), required=not os.getenv("SPRIXIN_MODEL_API_KEY"))
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    kb_ids = args.kb_id or [item for item in os.getenv("CONTRACT_AGENT_KB_IDS", "").split(",") if item]
    if not kb_ids:
        print("At least one --kb-id or CONTRACT_AGENT_KB_IDS value is required.", file=sys.stderr)
        return 2

    result = ensure_contract_agent_internal_models(
        tenant_id=args.tenant_id,
        api_key=args.api_key,
        kb_ids=kb_ids,
        dry_run=args.dry_run,
    )
    print(f"chat_id={result.chat_id}")
    print(f"embedding_id={result.embedding_id}")
    print(f"rerank_id={result.rerank_id}")
    print("dry_run=true" if args.dry_run else "dry_run=false")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
```

- [ ] **Step 3: Run migration tests**

Run:

```bash
env -u VIRTUAL_ENV uv run pytest test/unit_test/api/apps/services/test_contract_screening_internal_model_migration.py -q
```

Expected: PASS.

- [ ] **Step 4: Commit migration helper**

```bash
git add api/apps/services/contract_screening_internal_model_migration.py tools/scripts/contract_agent_internal_model_migration.py test/unit_test/api/apps/services/test_contract_screening_internal_model_migration.py
git commit -m "feat(contract-agent): add internal model migration helper"
```

### Task 5: Wire Policy Into Contract Screening Runtime

**Files:**
- Modify: `api/apps/services/contract_screening_service.py`
- Modify: `test/unit_test/api/apps/services/test_contract_screening_service.py`

- [ ] **Step 1: Add an allow-all policy fake to existing screening tests**

In `test/unit_test/api/apps/services/test_contract_screening_service.py`, add:

```python
class AllowAllModelPolicy:
    def __init__(self):
        self.calls = []

    def validate_contract_screening_models(self, *, tenant_id, task, search_req):
        self.calls.append({"tenant_id": tenant_id, "task": task, "search_req": search_req})
```

For existing `run_screening_task(...)` test calls, pass `model_policy_service=AllowAllModelPolicy()` so existing unit tests remain focused on screening behavior rather than DB-backed model policy.

- [ ] **Step 2: Add a rejection test**

Add this test to `test_contract_screening_service.py`:

```python
class RejectingModelPolicy:
    def validate_contract_screening_models(self, *, tenant_id, task, search_req):
        raise ContractScreeningError("合同筛选仅允许使用企业内网模型，请切换知识库和检索配置后重试。")


def test_run_screening_task_rejects_external_model_before_search():
    store = ContractScreeningStore(redis=FakeRedis(), ttl_seconds=60)
    _new_saved_task(store)
    search = SearchDatasetsStub({"chunks": []})

    with pytest.raises(ContractScreeningError) as exc:
        asyncio.run(
            run_screening_task(
                "tenant-1",
                "task-1",
                store=store,
                search_service=search,
                history_service=NoopHistoryService(),
                model_policy_service=RejectingModelPolicy(),
            )
        )

    assert "企业内网模型" in exc.value.message
    assert search.calls == []
    saved = store.get("tenant-1", "task-1")
    assert saved["status"] == "failed"
    assert "企业内网模型" in saved["error"]
```

- [ ] **Step 3: Run the screening service tests to verify failure**

Run:

```bash
env -u VIRTUAL_ENV uv run pytest test/unit_test/api/apps/services/test_contract_screening_service.py -q
```

Expected: FAIL because `run_screening_task` does not accept `model_policy_service`.

- [ ] **Step 4: Modify `run_screening_task` signature and call policy**

In `api/apps/services/contract_screening_service.py`, import the policy module inside the function to avoid circular imports:

```python
async def run_screening_task(
    tenant_id: str,
    task_id: str,
    store: ContractScreeningStore | None = None,
    search_service: Any = None,
    history_service: Any = contract_screening_db_service,
    heartbeat_seconds: float = TASK_HEARTBEAT_SECONDS,
    model_policy_service: Any = None,
) -> dict[str, Any]:
```

After `req = _build_search_request(task)` and before `_call_search_service(...)`, add:

```python
        if model_policy_service is None:
            from api.apps.services import contract_screening_model_policy as model_policy_service

        model_policy_service.validate_contract_screening_models(
            tenant_id=tenant_id,
            task=task,
            search_req=req,
        )
```

- [ ] **Step 5: Run screening and policy tests**

Run:

```bash
env -u VIRTUAL_ENV uv run pytest \
  test/unit_test/api/apps/services/test_contract_screening_service.py \
  test/unit_test/api/apps/services/test_contract_screening_model_policy.py \
  -q
```

Expected: PASS.

- [ ] **Step 6: Commit runtime integration**

```bash
git add api/apps/services/contract_screening_service.py test/unit_test/api/apps/services/test_contract_screening_service.py
git commit -m "feat(contract-agent): enforce internal model policy"
```

### Task 6: Run Full Contract-Agent Unit Verification

**Files:**
- Verify only.

- [ ] **Step 1: Run all contract screening unit tests**

Run:

```bash
env -u VIRTUAL_ENV uv run pytest \
  test/unit_test/api/apps/services/test_contract_screening_parser_service.py \
  test/unit_test/api/apps/services/test_contract_screening_service.py \
  test/unit_test/api/apps/services/test_contract_screening_feedback_service.py \
  test/unit_test/api/apps/services/test_contract_screening_export_service.py \
  test/unit_test/api/apps/restful_apis/test_contract_screening_api.py \
  test/unit_test/api/db/services/test_contract_screening_db_service.py \
  -q
```

Expected: PASS.

- [ ] **Step 2: Run focused model migration and policy tests**

Run:

```bash
env -u VIRTUAL_ENV uv run pytest \
  test/unit_test/api/apps/services/test_contract_screening_model_policy.py \
  test/unit_test/api/apps/services/test_contract_screening_internal_model_migration.py \
  -q
```

Expected: PASS.

### Task 7: Dry-Run Local Migration

**Files:**
- Verify and operate only.

- [ ] **Step 1: Identify current tenant and KB IDs**

Run:

```bash
docker exec docker-mysql-1 mysql -uroot -pinfini_rag_flow rag_flow -e "select id,name,llm_id,embd_id,rerank_id from tenant; select id,name,embd_id,doc_num,chunk_num from knowledgebase;"
```

Expected current values include external `SILICONFLOW` model IDs before migration.

- [ ] **Step 2: Run dry-run migration**

Use the tenant and KB IDs from Step 1:

```bash
SPRIXIN_MODEL_API_KEY=sk-1234567890 \
env -u VIRTUAL_ENV uv run python tools/scripts/contract_agent_internal_model_migration.py \
  --tenant-id 3246c9c6722d11f1be8b2b1edd326c62 \
  --kb-id 6ccb31ee722e11f1be8b2b1edd326c62 \
  --dry-run
```

Expected output:

```text
chat_id=Qwen3-30B-A3B@sprixin-chat@OpenAI-API-Compatible
embedding_id=bge-m3@sprixin-embedding@OpenAI-API-Compatible
rerank_id=bge-reranker-v2-m3@sprixin-rerank@OpenAI-API-Compatible
dry_run=true
```

- [ ] **Step 3: Confirm dry-run did not modify tenant / KB defaults**

Run the same SQL from Step 1.

Expected: tenant and knowledgebase model IDs are still unchanged.

### Task 8: Execute Local Migration and Rebuild Knowledge Base Vectors

**Files:**
- Operate only.

- [ ] **Step 1: Run real migration**

Use the formal production API key if available. If not available in development, use the temporary key documented in `docs/sprixin/AI服务器API调用说明_v0.4.md`:

```bash
SPRIXIN_MODEL_API_KEY=sk-1234567890 \
env -u VIRTUAL_ENV uv run python tools/scripts/contract_agent_internal_model_migration.py \
  --tenant-id 3246c9c6722d11f1be8b2b1edd326c62 \
  --kb-id 6ccb31ee722e11f1be8b2b1edd326c62
```

Expected output:

```text
chat_id=Qwen3-30B-A3B@sprixin-chat@OpenAI-API-Compatible
embedding_id=bge-m3@sprixin-embedding@OpenAI-API-Compatible
rerank_id=bge-reranker-v2-m3@sprixin-rerank@OpenAI-API-Compatible
dry_run=false
```

- [ ] **Step 2: Confirm DB model IDs changed**

Run:

```bash
docker exec docker-mysql-1 mysql -uroot -pinfini_rag_flow rag_flow -e "select id,name,llm_id,embd_id,rerank_id from tenant; select id,name,embd_id,doc_num,chunk_num from knowledgebase; select p.provider_name,i.instance_name,i.extra,i.status from tenant_model_provider p join tenant_model_instance i on i.provider_id=p.id where p.provider_name='OpenAI-API-Compatible' order by i.instance_name;"
```

Expected:

- tenant `llm_id` is `Qwen3-30B-A3B@sprixin-chat@OpenAI-API-Compatible`.
- tenant `embd_id` is `bge-m3@sprixin-embedding@OpenAI-API-Compatible`.
- tenant `rerank_id` is `bge-reranker-v2-m3@sprixin-rerank@OpenAI-API-Compatible`.
- knowledgebase `embd_id` is `bge-m3@sprixin-embedding@OpenAI-API-Compatible`.
- provider instances include `sprixin-chat`, `sprixin-embedding`, and `sprixin-rerank`.

- [ ] **Step 3: Rebuild vectors for affected knowledge base**

In the RAGFlow UI:

1. Open the migrated knowledge base.
2. Select the existing contract documents.
3. Trigger document parse / reparse for the selected documents.
4. Wait until document progress reaches 100%.

Expected: the knowledge base chunks are rebuilt using `bge-m3@sprixin-embedding@OpenAI-API-Compatible`.

### Task 9: Manual Contract-Agent Acceptance

**Files:**
- Verify only.

- [ ] **Step 1: Start backend and frontend as usual**

Backend:

```bash
source .venv/bin/activate
export PYTHONPATH=$(pwd)
bash docker/launch_backend_service.sh
```

Frontend / proxy setup should use the project's existing local workflow already used for `http://localhost:9222/`.

- [ ] **Step 2: Run contract-agent screening from UI**

Open:

```text
http://localhost:9222/
```

Submit a contract screening prompt against the migrated knowledge base.

Expected: task completes and returns screening results.

- [ ] **Step 3: Check logs for internal model use**

Search backend logs for:

```text
10.10.10.245
OpenAI-API-Compatible
```

Expected: model calls reference internal endpoint/provider.

- [ ] **Step 4: Check logs for blocked external provider absence**

Search backend logs for:

```text
api.siliconflow.cn
SILICONFLOW
```

Expected: no contract-agent screening model calls use these external values.

### Task 10: Final Commit and Status

**Files:**
- Verify only unless Task 8 created local-only DB changes.

- [ ] **Step 1: Check working tree**

Run:

```bash
git status --short
```

Expected: only intended code/test/script changes are committed. Existing unrelated untracked files such as `docs/sprixin/`, `package-lock.json`, `web/.vite/`, and `web/tailwind.config.js.bak` remain uncommitted unless the user explicitly asks to include them.

- [ ] **Step 2: Summarize commits and migration state**

Run:

```bash
git log --oneline -5
```

Expected: recent commits include:

- `feat(contract-agent): add internal model policy`
- `feat(contract-agent): add internal model migration helper`
- `feat(contract-agent): enforce internal model policy`

Report whether local DB migration and vector rebuild were completed.

## Self-Review

- Spec coverage: The plan covers runtime safety checks, provider migration, tenant and KB model updates, vector rebuild, and acceptance checks. It intentionally excludes document parser replacement.
- Completeness scan: All tasks have concrete files, commands, and expected results.
- Type consistency: Model IDs, provider name, instance names, and constants match the approved design.
- Risk note: Production rollout still requires the formal Sprixin model API key. The temporary key is used only for local development commands.
