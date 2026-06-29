# Contract Agent Internal Model Migration Design

**Goal:** Make the contract-agent screening runtime use only enterprise-internal model services, while leaving document parsing migration for a later phase.

**Scope:** This design covers contract-agent screening, dataset retrieval used by screening, model configuration migration, and screening-time safety checks. It does not replace the document parsing service or redesign the general RAGFlow model marketplace.

## Background

The project is primarily used inside the enterprise. To protect contract and business data, the contract-agent screening workflow must stop using external model providers.

The internal model documentation in `docs/sprixin` defines these enterprise services:

- Chat model: `Qwen3-30B-A3B`, OpenAI-compatible API at `http://10.10.10.245:8000/v1/chat/completions`.
- Embedding model: `bge-m3`, OpenAI-compatible API at `http://10.10.10.245:8000/v1/embeddings`.
- Rerank model: `bge-reranker-v2-m3`, rerank API at `http://10.10.10.245:8000/rerank`.
- Document parser: `http://10.8.0.248:8000/api/v1/parse`, intentionally deferred to a later phase.

Current runtime configuration still points to external providers:

- Tenant default chat: `deepseek-ai/DeepSeek-V4-Flash@SILICONFLOW@SILICONFLOW`.
- Tenant default embedding: `BAAI/bge-large-zh-v1.5@SILICONFLOW@SILICONFLOW`.
- Tenant default rerank: `Qwen/Qwen3-VL-Reranker-8B@SILICONFLOW@SILICONFLOW`.
- Tenant default image-to-text: `Qwen/Qwen3.6-35B-A3B@SILICONFLOW@SILICONFLOW`.
- Current knowledge base embedding: `BAAI/bge-large-zh-v1.5@SILICONFLOW@SILICONFLOW`.
- `conf/service_conf.yaml` still contains external PaddleOCR API configuration.

The current database has one active contract knowledge base with 152 chunks. Because vector embeddings from different models are not compatible, switching the knowledge base to `bge-m3` requires rebuilding vectors for existing documents.

## Recommended Approach

Use RAGFlow's existing provider-instance model architecture instead of adding a separate contract-agent-only model configuration.

Create enterprise-internal `OpenAI-API-Compatible` provider instances and model records:

| Purpose | Instance | Model ID |
| --- | --- | --- |
| Chat | `sprixin-chat` | `Qwen3-30B-A3B@sprixin-chat@OpenAI-API-Compatible` |
| Embedding | `sprixin-embedding` | `bge-m3@sprixin-embedding@OpenAI-API-Compatible` |
| Rerank | `sprixin-rerank` | `bge-reranker-v2-m3@sprixin-rerank@OpenAI-API-Compatible` |

Use separate instances because the current adapters normalize base URLs differently:

- Chat expects an OpenAI-compatible base URL that already includes `/v1`.
- Embedding adapter appends `/v1` internally.
- Rerank adapter accepts an endpoint with `/rerank`.

This avoids accidental calls such as `/v1/v1/embeddings` while keeping all model access inside the standard RAGFlow model configuration path.

## Contract-Agent Runtime Policy

Contract-agent screening must enforce this runtime policy:

1. Prompt parsing remains rule-based and does not call a chat model.
2. Dataset retrieval uses the selected knowledge base embedding model.
3. The selected knowledge base embedding provider must be enterprise-internal.
4. If screening uses rerank, the rerank model must be enterprise-internal.
5. If `search_id`, metadata auto filter, keyword expansion, or KG retrieval causes a chat model call, the chat model must be enterprise-internal.
6. External provider names and external base URLs are rejected for contract-agent screening.

Allowed model endpoints for this phase:

- `http://10.10.10.245:8000`
- `http://10.10.10.245:8000/v1`
- `http://10.10.10.245:8000/rerank`

Blocked providers for contract-agent screening include:

- `SILICONFLOW`
- `OpenRouter`
- `OpenAI`
- `Azure-OpenAI`
- Any provider instance whose configured `base_url` is outside the approved internal endpoint list.

## Data Migration

Migration should be explicit and repeatable:

1. Create the `OpenAI-API-Compatible` provider for the tenant if it does not exist.
2. Create three model instances: `sprixin-chat`, `sprixin-embedding`, and `sprixin-rerank`.
3. Register the three models under their matching model types.
4. Update the tenant defaults:
   - `tenant.llm_id = Qwen3-30B-A3B@sprixin-chat@OpenAI-API-Compatible`
   - `tenant.embd_id = bge-m3@sprixin-embedding@OpenAI-API-Compatible`
   - `tenant.rerank_id = bge-reranker-v2-m3@sprixin-rerank@OpenAI-API-Compatible`
5. Update contract knowledge bases from the external embedding model to `bge-m3@sprixin-embedding@OpenAI-API-Compatible`.
6. Rebuild vectors for affected knowledge bases before accepting screening results as valid.

The migration should not delete external provider records in this phase. It only ensures contract-agent screening refuses to use them.

## Error Handling

When contract-agent detects an external model provider or external base URL, the API should return a business-readable error:

`合同筛选仅允许使用企业内网模型，请切换知识库和检索配置后重试。`

The log should include:

- tenant ID
- knowledge base ID
- model type
- model ID
- provider name
- configured base URL
- rejected reason

The response must not include API keys or sensitive model credentials.

## Testing Strategy

Backend tests should cover:

1. Contract screening accepts internal `OpenAI-API-Compatible` chat, embedding, and rerank models.
2. Contract screening rejects `SILICONFLOW` embedding on the selected knowledge base.
3. Contract screening rejects external rerank models passed through request or search config.
4. Contract screening rejects external chat models reached through search config.
5. Contract screening works when prompt parsing is rule-based and no chat model is needed.
6. Migration helper is idempotent: running it twice does not duplicate provider instances or model rows.

Manual verification should cover:

1. Run contract-agent screening from the UI.
2. Confirm backend logs only show internal endpoints for model calls.
3. Confirm logs do not contain `api.siliconflow.cn`.
4. Confirm the migrated knowledge base can return screening results after vector rebuild.

## Rollout Plan

Phase 1 implements contract-agent runtime safety and model migration only:

1. Add internal model provider migration helper.
2. Add contract-agent model policy validation.
3. Update current tenant and knowledge base model IDs.
4. Rebuild affected knowledge base vectors.
5. Verify contract-agent screening.

Phase 2, outside this design, replaces document parsing with the internal document parser at `http://10.8.0.248:8000/api/v1/parse`.

Phase 3, outside this design, can enforce enterprise-internal model policy across the entire RAGFlow product.

## Acceptance Criteria

- Contract-agent screening no longer calls `SILICONFLOW` or any external model endpoint.
- Current tenant defaults point to enterprise-internal models.
- Current contract knowledge base uses `bge-m3@sprixin-embedding@OpenAI-API-Compatible`.
- Existing contract knowledge base vectors are rebuilt after embedding migration.
- Screening fails fast with a clear message if an external provider is configured.
- No API keys are printed in logs or returned to the browser.

## Open Decision

The formal production API key for the enterprise model server must be provided before production rollout. Until then, development may use the temporary key from the Sprixin documentation.
