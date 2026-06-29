from __future__ import annotations

import logging
from typing import Any

from api.apps.services.contract_screening_service import ContractScreeningError
from api.db.joint_services.tenant_model_service import (
    get_model_config_from_provider_instance,
    get_tenant_default_model_by_type,
)
from api.db.services.knowledgebase_service import KnowledgebaseService
from api.db.services.search_service import SearchService
from common.contract_agent_internal_models import (
    CONTRACT_AGENT_BLOCKED_PROVIDERS,
    CONTRACT_AGENT_INTERNAL_MODEL_ERROR,
    SPRIXIN_ALLOWED_BASE_URLS,
    SPRIXIN_CHAT_ID,
    SPRIXIN_EMBEDDING_ID,
    SPRIXIN_PROVIDER_NAME,
    SPRIXIN_RERANK_ID,
)
from common.constants import LLMType


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


def _get_value(obj: Any, key: str, default: Any = None) -> Any:
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


def _model_type_value(model_type: str | LLMType) -> str:
    return model_type.value if hasattr(model_type, "value") else str(model_type)


def _reject_external_model(
    *,
    tenant_id: str,
    kb_id: str,
    model_type: str,
    model_id: str,
    model_config: dict[str, Any],
    reason: str,
) -> None:
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
        _reject_external_model(
            tenant_id=tenant_id,
            kb_id=kb_id,
            model_type=model_type,
            model_id=model_id,
            model_config=model_config,
            reason="blocked provider",
        )
    if provider != SPRIXIN_PROVIDER_NAME:
        _reject_external_model(
            tenant_id=tenant_id,
            kb_id=kb_id,
            model_type=model_type,
            model_id=model_id,
            model_config=model_config,
            reason="provider is not Sprixin internal compatible provider",
        )
    if base_url not in SPRIXIN_ALLOWED_BASE_URLS:
        _reject_external_model(
            tenant_id=tenant_id,
            kb_id=kb_id,
            model_type=model_type,
            model_id=model_id,
            model_config=model_config,
            reason="base url is not allowlisted",
        )


def _validate_model_id(tenant_id: str, kb_id: str, model_type: str | LLMType, model_id: str, repository: Any) -> None:
    model_type_value = _model_type_value(model_type)
    config = repository.get_model_config(tenant_id, model_type_value, model_id)
    validate_contract_model_config(
        tenant_id=tenant_id,
        kb_id=kb_id,
        model_type=model_type_value,
        model_id=model_id,
        model_config=config,
    )


def _validate_default_chat(tenant_id: str, kb_id: str, repository: Any) -> None:
    config = repository.get_default_model_config(tenant_id, LLMType.CHAT.value)
    validate_contract_model_config(
        tenant_id=tenant_id,
        kb_id=kb_id,
        model_type=LLMType.CHAT.value,
        model_id=str(config.get("llm_name") or ""),
        model_config=config,
    )


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
    embd_id = _get_value(kb, "embd_id")
    if not embd_id:
        raise ContractScreeningError("Knowledge base embedding model is not configured")

    _validate_model_id(tenant_id, kb_id, LLMType.EMBEDDING.value, str(embd_id), repository)

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
