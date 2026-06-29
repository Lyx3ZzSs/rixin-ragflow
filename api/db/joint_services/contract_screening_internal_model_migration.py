from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from api.db.services.knowledgebase_service import KnowledgebaseService
from api.db.services.tenant_model_instance_service import TenantModelInstanceService
from api.db.services.tenant_model_provider_service import TenantModelProviderService
from api.db.services.tenant_model_service import TenantModelService
from api.db.services.user_service import TenantService
from common.constants import LLMType
from common.contract_agent_internal_models import (
    SPRIXIN_CHAT_BASE_URL,
    SPRIXIN_CHAT_ID,
    SPRIXIN_CHAT_INSTANCE,
    SPRIXIN_CHAT_MAX_TOKENS,
    SPRIXIN_CHAT_MODEL,
    SPRIXIN_EMBEDDING_BASE_URL,
    SPRIXIN_EMBEDDING_ID,
    SPRIXIN_EMBEDDING_INSTANCE,
    SPRIXIN_EMBEDDING_MAX_TOKENS,
    SPRIXIN_EMBEDDING_MODEL,
    SPRIXIN_PROVIDER_NAME,
    SPRIXIN_RERANK_BASE_URL,
    SPRIXIN_RERANK_ID,
    SPRIXIN_RERANK_INSTANCE,
    SPRIXIN_RERANK_MAX_TOKENS,
    SPRIXIN_RERANK_MODEL,
)


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
        TenantModelInstanceService.create_instance(
            provider_id=provider_id,
            instance_name=instance_name,
            api_key=api_key,
            extra=extra,
        )
        return TenantModelInstanceService.get_by_provider_id_and_instance_name(provider_id, instance_name)

    def get_model(self, provider_id: str, instance_id: str, model_type: str, model_name: str) -> Any:
        return TenantModelService.get_by_provider_id_and_instance_id_and_model_type_and_model_name(
            provider_id,
            instance_id,
            model_type,
            model_name,
        )

    def create_model(self, provider_id: str, instance_id: str, model_type: str, model_name: str, extra: str) -> Any:
        return TenantModelService.insert(
            provider_id=provider_id,
            instance_id=instance_id,
            model_type=model_type,
            model_name=model_name,
            extra=extra,
        )

    def update_model_extra(self, model_id: str, extra: str) -> None:
        TenantModelService.update_by_id(model_id, {"extra": extra})

    def update_tenant_defaults(self, tenant_id: str, chat_id: str, embedding_id: str, rerank_id: str) -> None:
        TenantService.update_by_id(
            tenant_id,
            {
                "llm_id": chat_id,
                "embd_id": embedding_id,
                "rerank_id": rerank_id,
            },
        )

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
    return repository.create_instance(
        provider_id,
        instance_name,
        api_key,
        json.dumps({"base_url": base_url}, ensure_ascii=False),
    )


def _ensure_model(provider_id: str, instance_id: str, model_type: str, model_name: str, max_tokens: int, repository: Any) -> None:
    desired_extra = json.dumps({"max_tokens": max_tokens}, ensure_ascii=False)
    model = repository.get_model(provider_id, instance_id, model_type, model_name)
    if model:
        current_extra = model.get("extra") if isinstance(model, dict) else model.extra
        if current_extra != desired_extra and hasattr(repository, "update_model_extra"):
            repository.update_model_extra(_obj_id(model), desired_extra)
        return
    repository.create_model(
        provider_id,
        instance_id,
        model_type,
        model_name,
        desired_extra,
    )


def ensure_contract_agent_internal_models(
    tenant_id: str,
    api_key: str,
    kb_ids: list[str],
    *,
    repository: Any | None = None,
    dry_run: bool = False,
) -> InternalModelMigrationResult:
    result = InternalModelMigrationResult(
        chat_id=SPRIXIN_CHAT_ID,
        embedding_id=SPRIXIN_EMBEDDING_ID,
        rerank_id=SPRIXIN_RERANK_ID,
    )
    if dry_run:
        return result

    repository = repository or DefaultInternalModelMigrationRepository()
    provider = _ensure_provider(tenant_id, repository)
    provider_id = _obj_id(provider)

    chat = _ensure_instance(provider_id, SPRIXIN_CHAT_INSTANCE, api_key, SPRIXIN_CHAT_BASE_URL, repository)
    embedding = _ensure_instance(provider_id, SPRIXIN_EMBEDDING_INSTANCE, api_key, SPRIXIN_EMBEDDING_BASE_URL, repository)
    rerank = _ensure_instance(provider_id, SPRIXIN_RERANK_INSTANCE, api_key, SPRIXIN_RERANK_BASE_URL, repository)

    _ensure_model(provider_id, _obj_id(chat), LLMType.CHAT.value, SPRIXIN_CHAT_MODEL, SPRIXIN_CHAT_MAX_TOKENS, repository)
    _ensure_model(provider_id, _obj_id(embedding), LLMType.EMBEDDING.value, SPRIXIN_EMBEDDING_MODEL, SPRIXIN_EMBEDDING_MAX_TOKENS, repository)
    _ensure_model(provider_id, _obj_id(rerank), LLMType.RERANK.value, SPRIXIN_RERANK_MODEL, SPRIXIN_RERANK_MAX_TOKENS, repository)

    repository.update_tenant_defaults(tenant_id, result.chat_id, result.embedding_id, result.rerank_id)
    for kb_id in kb_ids:
        repository.update_knowledgebase_embedding(kb_id, result.embedding_id)
    return result
