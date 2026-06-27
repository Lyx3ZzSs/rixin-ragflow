# Contract Screening Agent Design

Date: 2026-06-28

## Summary

Build a contract screening Agent that lets users enter natural-language screening prompts, runs a backend screening task against parsed contract knowledge bases, and returns contract-first results with traceable evidence.

The UI must follow the existing Open Design prototype at:

`/Users/liyuanxin/Library/Application Support/Open Design/namespaces/release-stable/data/projects/13d03357-ba9c-44d0-8ad1-9050ebc75d32`

The prototype is a standalone Vite + React project. It should remain the UI baseline. The implementation should replace mock data and local filtering logic with RAGFlow-backed APIs, while preserving the current three-panel interaction model.

## Core Decisions

1. The contract Agent frontend uses an independent Vite React source boundary.
2. Production deployment is same-site, not a second user-facing frontend service.
3. The built contract Agent frontend is mounted under `/contract-agent`.
4. RAGFlow remains the source of truth for login, permissions, knowledge bases, PDF parsing, OCR, chunks, retrieval, and LLM configuration.
5. OCR defaults to remote PaddleOCR through the existing backend configuration.
6. Screening results are contract-list-first. Evidence is shown in the right detail panel after selecting a contract.
7. Phase 1 uses a deterministic screening pipeline, not an open-ended autonomous multi-agent flow.

## Non-Goals

- Do not merge the Open Design prototype into the main RAGFlow `web/` application in Phase 1.
- Do not rewrite the prototype visual design.
- Do not introduce CSS Modules or scoped CSS in Phase 1; keep the prototype stylesheet as the UI baseline.
- Do not support screening contracts that have not finished parsing.
- Do not build a separate authentication system.
- Do not expose raw chunk lists as the primary result view.

## Deployment Shape

Development can run the contract Agent with its own Vite dev server for fast iteration:

```text
RAGFlow web dev:       http://127.0.0.1:8000
Contract Agent dev:   http://127.0.0.1:5173
RAGFlow API/backend:  http://127.0.0.1:9380
```

Production should serve a single user-facing site:

```text
/                  -> existing RAGFlow frontend
/contract-agent    -> contract screening Agent frontend
/api/...           -> existing and new RAGFlow backend APIs
```

The contract Agent build output can be copied into a static serving path for the RAGFlow/Nginx deployment. Users should not need to know that the Agent has a separate source project.

## Authentication and Entry

The Agent uses the existing RAGFlow login session or token. After successful login, a configurable redirect can send users to `/contract-agent`.

Configuration should control the behavior:

```text
CONTRACT_AGENT_ENABLED=true
CONTRACT_AGENT_DEFAULT_ROUTE=/contract-agent
```

When disabled, RAGFlow keeps its existing login redirect behavior.

## Frontend Design

The Open Design prototype provides the Phase 1 UI. Its current structure maps to production behavior as follows.

### Prototype Files

- `src/App.jsx`: three-panel workbench, conversation flow, result cards, evidence panel.
- `src/styles.css`: design tokens, layout, responsive behavior, component styling.
- `src/data.js`: mock contracts and prompt examples.
- `src/logic.js`: local mock filtering and audit text helpers.
- `src/logic.test.js`: current local logic tests.

### UI Areas

The implemented UI keeps these areas:

- Header: product identity, history toggle, evidence toggle.
- Left panel: conversation history.
- Center panel: prompt input, streaming task phases, contract result cards.
- Right panel: selected contract evidence and suggested actions.
- Toasts: copy, queued action, failure feedback.

### UI Changes From Prototype

The visual layout remains the same. Data behavior changes:

- `src/data.js` becomes development-only mock data.
- `smartFilter` and local filtering are replaced by API calls.
- Streaming phases are driven by backend task status.
- Contract cards render backend task results.
- The evidence panel renders backend evidence fields.
- Conversation history is persisted locally in Phase 1 and can be moved to backend storage in Phase 2.

## Backend API

Add a small contract screening API surface. It should not change existing knowledge base, document, chunk, or retrieval API semantics.

### Create Task

`POST /api/v1/contract-screening/tasks`

Request:

```json
{
  "kb_id": "knowledge-base-id",
  "prompt": "筛选出付款周期超过60天且包含违约金条款的合同",
  "filters": {
    "risk": "全部",
    "status": "全部",
    "source": "全部"
  }
}
```

Response:

```json
{
  "code": 0,
  "data": {
    "task_id": "screening-task-id"
  }
}
```

### Get Task Status

`GET /api/v1/contract-screening/tasks/{task_id}`

Response:

```json
{
  "code": 0,
  "data": {
    "task_id": "screening-task-id",
    "status": "running",
    "phase": "reviewing_evidence",
    "progress": 0.68,
    "message": "正在复核合同证据"
  }
}
```

Allowed statuses:

- `pending`
- `running`
- `done`
- `failed`
- `cancelled`

Allowed phases:

- `parse_prompt`
- `retrieve_candidates`
- `review_evidence`
- `rank_contracts`
- `generate_summary`

### Get Results

`GET /api/v1/contract-screening/tasks/{task_id}/results`

Response:

```json
{
  "code": 0,
  "data": {
    "task_id": "screening-task-id",
    "prompt": "筛选出付款周期超过60天且包含违约金条款的合同",
    "strategy": [
      "字段过滤：限定已解析完成的合同文档",
      "语义召回：检索付款周期、账期、违约金、逾期责任相关条款",
      "证据复核：按合同聚合证据并判断条件是否满足",
      "综合排序：按命中条件、置信度和风险等级排序"
    ],
    "items": [
      {
        "id": "document-id",
        "title": "采购合同.pdf",
        "supplier": "上海曜石科技有限公司",
        "owner": "采购部",
        "status": "命中",
        "risk": "高",
        "amount": "¥4,860,000",
        "expiry": "2026-09-30",
        "score": 92,
        "permissions": "采购部、法务部可见",
        "reason": "该合同付款周期为90天，并包含逾期违约金条款。",
        "evidence": [
          {
            "source": "合同正文",
            "ref": "第12页 / chunk-1",
            "text": "付款期限为验收合格后90日内...",
            "page": 12,
            "chunk_id": "chunk-1"
          }
        ],
        "actions": [
          "请求法务复核付款及违约责任条款"
        ],
        "timeline": [
          ["到期", "2026-09-30"],
          ["付款周期", "90天"]
        ]
      }
    ]
  }
}
```

### Optional Evidence Detail

If Phase 1 result payload becomes too large, move evidence details behind:

`GET /api/v1/contract-screening/documents/{document_id}/evidence?task_id={task_id}`

The UI can still behave the same: selecting a contract opens the right evidence panel.

## Screening Pipeline

Phase 1 uses a controlled pipeline:

1. Validate the user and selected knowledge base.
2. Parse the natural-language prompt into screening intent and conditions.
3. Restrict documents to parsed contracts with available chunks.
4. Retrieve candidate chunks using existing RAGFlow retrieval/search capabilities.
5. Group candidate chunks by document.
6. Ask the configured LLM to judge each candidate contract against the parsed conditions.
7. Generate a contract-level summary, confidence score, and evidence list.
8. Persist task status and results.
9. Return contract-list-first results to the frontend.

The pipeline should prefer explainability over autonomy. Every included contract must have evidence. If a condition cannot be verified, the result should say evidence is insufficient instead of inventing an answer.

## OCR and Knowledge Base Flow

Contract files are uploaded and parsed through existing RAGFlow knowledge base flows:

1. User uploads PDFs to a contract knowledge base.
2. Backend parses PDFs using remote PaddleOCR by default.
3. Parsed text is chunked and indexed.
4. Contract Agent screens only documents whose parse status is complete.
5. Documents still parsing are excluded and reported in task metadata.

The existing remote PaddleOCR configuration remains the default OCR path. Local OCR should not be loaded by default.

## Error Handling

Frontend behavior:

- Empty prompt: keep send button disabled.
- Missing knowledge base: show a clear action message.
- Task failed: show the backend failure message in the conversation.
- No matched contracts: show a normal empty result, not an error.
- Partially parsed knowledge base: show how many documents were skipped because parsing is not complete.
- Session expired: redirect to RAGFlow login.

Backend behavior:

- Invalid prompt returns a validation error with a user-readable message.
- Missing or unauthorized knowledge base returns a permission error.
- No parsed documents returns a successful empty result with skipped document counts.
- LLM failure marks the task failed and preserves the error message.
- Retrieval failure marks the task failed; it should not return fabricated results.

## Testing

Frontend tests:

- API adapter maps backend result fields into the existing card/evidence shape.
- Prompt submission creates a task and starts polling.
- Polling stops on `done`, `failed`, or `cancelled`.
- Selecting a result updates the evidence panel.
- Empty result and failed task states render correctly.

Backend tests:

- Task creation validates `kb_id` and `prompt`.
- Screening excludes documents that are not parsed.
- Prompt parser returns structured conditions.
- Retrieval candidates are grouped by document.
- LLM judgment output is normalized into contract-level results.
- Results include evidence with document id, chunk id, page, and text.
- Permission checks prevent cross-tenant access.

Integration checks:

- Upload PDF, parse through remote PaddleOCR, wait for chunks, run screening prompt, see contract cards and evidence.
- Login redirects to `/contract-agent` only when the feature flag is enabled.
- Production build can be served under `/contract-agent`.

## Rollout Plan

Phase 1:

- Add contract Agent frontend source boundary based on the Open Design prototype.
- Add backend contract screening task APIs.
- Replace mock data with API-driven task creation, polling, and results.
- Serve the built Agent under `/contract-agent`.
- Add configurable login redirect.

Phase 2:

- Persist task history per user.
- Add export to Excel or Word.
- Add condition editing after prompt parsing.
- Add result feedback for tuning.

Phase 3:

- Add multi-turn clarification.
- Add contract metadata extraction and normalized fields.
- Add risk scoring templates.
- Generate formal screening reports.

## Risks and Mitigations

- Risk: CSS conflicts if merged into RAGFlow `web/`.
  - Mitigation: keep source and build output independent; mount under `/contract-agent`.

- Risk: LLM returns unsupported or fabricated evidence.
  - Mitigation: require evidence references from retrieved chunks and reject unsupported claims.

- Risk: OCR and parsing latency make screening appear broken.
  - Mitigation: show parse status, skip unparsed documents, and explain skipped counts.

- Risk: Authentication becomes duplicated.
  - Mitigation: use existing RAGFlow session/token and same-site deployment.

- Risk: Results become too chunk-centric for business users.
  - Mitigation: contract-list-first result model with evidence only in the detail panel.

## Approval State

The approved product direction is:

- Follow the existing Open Design prototype for UI.
- Keep the contract Agent frontend source independent.
- Deploy it on the same RAGFlow site under `/contract-agent`.
- Reuse RAGFlow login and backend services.
- Return contract-list-first screening results with traceable evidence.
