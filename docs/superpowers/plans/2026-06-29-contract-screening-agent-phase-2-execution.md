# Contract Screening Agent Phase 2 Execution Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the phase 2 product loop for the contract screening agent: persisted user history, automatic parsed conditions, Excel/Word export, result/evidence feedback, and hardening.

**Architecture:** Keep Redis as the running-task status channel and add database-backed history, result, evidence, export, and feedback records as the durable source of truth. Extend the existing `contract_screening` API surface incrementally while keeping first-stage request compatibility. Keep `contract-agent-web/` independent and add focused frontend modules for API adapters, condition normalization, export actions, and feedback controls.

**Tech Stack:** Python 3.13, Peewee, Redis, existing RAGFlow API utilities, `openpyxl`, `python-docx`, React 18, Vite, Node test runner, `uv run pytest`, `npm test`.

---

## Scope Split

The phase 2 spec spans several independent subsystems. Execute it as five milestone plans instead of one oversized implementation pass:

1. M1: durable task history, result, and evidence persistence.
2. M2: Prompt parsing and direct screening start.
3. M3: Excel and Word export.
4. M4: result and evidence feedback.
5. M5: hardening, observability, and regression coverage.

Each milestone must leave the app in a working state and must be independently testable. Do not start M2 until M1 passes backend and frontend tests, because M2 relies on the persisted task shape. Do not start M3 or M4 until M1 result/evidence ids are stable.

## Baseline Commands

- [ ] **Step 1: Check worktree before starting implementation**

Run:

```bash
git status --short
```

Expected: note existing unrelated untracked files and do not stage them unless they belong to the milestone.

- [ ] **Step 2: Run focused baseline backend tests**

Run:

```bash
uv run pytest test/unit_test/api/apps/services/test_contract_screening_service.py test/unit_test/api/apps/restful_apis/test_contract_screening_api.py
```

Expected: both first-stage contract screening test files pass before phase 2 edits begin.

- [ ] **Step 3: Run focused baseline frontend tests**

Run:

```bash
cd contract-agent-web && npm test
```

Expected: first-stage frontend tests pass before phase 2 edits begin.

## File Structure

### Backend Models and DB Services

- Modify: `api/db/db_models.py`
  - Add `ContractScreeningTask`, `ContractScreeningResult`, `ContractScreeningEvidence`, `ContractScreeningExport`, and `ContractScreeningFeedback`.
  - Add migration table creation in `migrate_db()` using existing migrator conventions.
- Create: `api/db/services/contract_screening_service.py`
  - Add `CommonService` subclasses and query helpers for the five new database models.
- Test: `test/unit_test/api/db/services/test_contract_screening_db_service.py`
  - Cover insert, list, permission filters, and result/evidence lookup behavior.

### Backend App Services

- Modify: `api/apps/services/contract_screening_service.py`
  - Preserve Redis task behavior.
  - Accept optional `conditions` and `evidence_policy` in create request validation.
  - Persist completed task, result, and evidence records through the DB service.
  - Read persisted results when available.
- Create: `api/apps/services/contract_screening_parser_service.py`
  - Expose rule-backed Prompt parsing using first-stage `build_strategy` as the fallback.
- Create: `api/apps/services/contract_screening_export_service.py`
  - Generate Excel and Word files from persisted task data.
- Create: `api/apps/services/contract_screening_feedback_service.py`
  - Validate and save result/evidence feedback.
- Test: `test/unit_test/api/apps/services/test_contract_screening_parser_service.py`
- Test: `test/unit_test/api/apps/services/test_contract_screening_export_service.py`
- Test: `test/unit_test/api/apps/services/test_contract_screening_feedback_service.py`

### Backend REST API

- Modify: `api/apps/restful_apis/contract_screening_api.py`
  - Add `POST /contract-screening/parse`.
  - Add `GET /contract-screening/tasks` history list.
  - Extend `POST /contract-screening/tasks` without breaking first-stage request bodies.
  - Add `POST /contract-screening/tasks/<task_id>/exports`.
  - Add `GET /contract-screening/exports/<export_id>`.
  - Add `POST /contract-screening/tasks/<task_id>/feedback`.
- Test: `test/unit_test/api/apps/restful_apis/test_contract_screening_api.py`
  - Extend current API tests for parse, history, export, and feedback.

### Frontend

- Modify: `contract-agent-web/src/api.js`
  - Add `parseScreeningPrompt`, `listScreeningTasks`, `createScreeningExport`, `getScreeningExport`, and `submitScreeningFeedback`.
  - Extend `createScreeningTask` to include `conditions` and `evidencePolicy`.
- Modify: `contract-agent-web/src/api.test.js`
  - Cover all new API adapters and request payloads.
- Create: `contract-agent-web/src/conditions.js`
  - Normalize parsed conditions, edit payloads, and evidence policy values.
- Create: `contract-agent-web/src/conditions.test.js`
  - Cover condition defaults, disabled conditions, and evidence limit normalization.
- Modify: `contract-agent-web/src/App.jsx`
  - Load history from backend.
  - Parse conditions after send and start screening directly without condition confirmation.
  - Show export actions for completed tasks.
  - Show result/evidence feedback controls.
- Modify: `contract-agent-web/src/logic.js`
  - Add pure helpers for export state labels and feedback labels if they are needed by `App.jsx`.
- Modify: `contract-agent-web/src/logic.test.js`
  - Cover new pure helpers.
- Modify: `contract-agent-web/src/styles.css`
  - Add scoped styles for condition editor, export controls, and feedback controls.
- Modify: `contract-agent-web/src/layout.test.js`
  - Replace first-stage assertion that export actions are absent with second-stage assertions that export actions are present only for completed tasks.

## M1: Durable Task History

**Outcome:** Completed screening tasks, contract results, and evidence survive refresh and can be listed per user.

- [ ] **Step 1: Write DB service tests for task persistence**

Create `test/unit_test/api/db/services/test_contract_screening_db_service.py` with tests that verify:

```python
def test_create_and_list_tasks_filters_by_tenant_and_user():
    service.create_task(task_id="task-1", tenant_id="tenant-1", user_id="user-1", kb_id="kb-1", prompt="筛选合同")
    service.create_task(task_id="task-2", tenant_id="tenant-1", user_id="user-2", kb_id="kb-1", prompt="其他用户")
    rows = service.list_tasks(tenant_id="tenant-1", user_id="user-1", page=1, page_size=20)
    assert [row["task_id"] for row in rows["items"]] == ["task-1"]
```

Run:

```bash
uv run pytest test/unit_test/api/db/services/test_contract_screening_db_service.py -q
```

Expected: FAIL because DB models and services do not exist yet.

- [ ] **Step 2: Add database models and DB services**

Implement:

- `ContractScreeningTask`
- `ContractScreeningResult`
- `ContractScreeningEvidence`
- `ContractScreeningExport`
- `ContractScreeningFeedback`
- `ContractScreeningTaskService`
- `ContractScreeningResultService`
- `ContractScreeningEvidenceService`
- `ContractScreeningExportService`
- `ContractScreeningFeedbackService`

Use `JSONField` for JSON payloads and `LongTextField` for long evidence text. Use `create_time`, `update_time`, and `create_date` from `BaseModel`.

- [ ] **Step 3: Add idempotent migration creation**

Modify `migrate_db()` to create the five tables if missing. Use the existing migrator style and keep table names aligned with Peewee model table names.

- [ ] **Step 4: Persist completed screening output**

Modify `run_screening_task()` so a successful task writes:

- one task row,
- one result row per contract,
- one evidence row per evidence item.

Keep Redis updates unchanged during running states. If final DB persistence fails, mark the Redis task as `failed` with a user-readable error.

- [ ] **Step 5: Add history list API**

Add `GET /api/v1/contract-screening/tasks` to `api/apps/restful_apis/contract_screening_api.py`. Return current-user task summaries only.

- [ ] **Step 6: Add frontend history loading**

Update `contract-agent-web/src/api.js` and `App.jsx` so the left history panel loads from `listScreeningTasks()`. Keep local starter mock only when backend history is empty or unavailable in development.

- [ ] **Step 7: Verify M1**

Run:

```bash
uv run pytest test/unit_test/api/db/services/test_contract_screening_db_service.py test/unit_test/api/apps/services/test_contract_screening_service.py test/unit_test/api/apps/restful_apis/test_contract_screening_api.py
cd contract-agent-web && npm test
```

Expected: all focused backend and frontend tests pass.

- [ ] **Step 8: Commit M1**

Run:

```bash
git add api/db/db_models.py api/db/services/contract_screening_service.py api/apps/services/contract_screening_service.py api/apps/restful_apis/contract_screening_api.py test/unit_test/api/db/services/test_contract_screening_db_service.py test/unit_test/api/apps/services/test_contract_screening_service.py test/unit_test/api/apps/restful_apis/test_contract_screening_api.py contract-agent-web/src
git commit -m "feat(contract-agent): persist screening history"
```

## M2: Prompt Parsing and Direct Screening Start

**Outcome:** Users click send once; the frontend parses the Prompt into structured conditions and immediately creates the screening task.

- [ ] **Step 1: Write parser service tests**

Create `test/unit_test/api/apps/services/test_contract_screening_parser_service.py` with tests for:

- `kb_id` required.
- `prompt` required.
- rule-backed parse returns conditions from payment, penalty, renewal, and attachment terms.
- LLM parse failure falls back to rule-backed parse.

Run:

```bash
uv run pytest test/unit_test/api/apps/services/test_contract_screening_parser_service.py -q
```

Expected: FAIL because parser service does not exist yet.

- [ ] **Step 2: Implement parser service**

Create `api/apps/services/contract_screening_parser_service.py`. Reuse `build_strategy()` from first-stage service and normalize to:

```python
{
    "query": prompt,
    "conditions": [{"id": "...", "label": "...", "keywords": [...], "operator": "exists", "value": "", "enabled": True}],
    "filters": filters,
    "evidence_policy": {"group_by": "document", "max_evidence_per_contract": 5},
}
```

- [ ] **Step 3: Add parse API and extend create request validation**

Add `POST /api/v1/contract-screening/parse`. Extend `validate_create_task_request()` to accept optional `conditions` and `evidence_policy`, keeping first-stage request bodies valid.

- [ ] **Step 4: Write frontend condition normalization tests**

Create `contract-agent-web/src/conditions.test.js` for:

- missing conditions become an empty list,
- disabled condition remains disabled,
- `max_evidence_per_contract` clamps to an allowed range,
- create payload preserves parsed keywords and evidence policy values.

Run:

```bash
cd contract-agent-web && npm test -- src/conditions.test.js
```

Expected: FAIL until `conditions.js` exists.

- [ ] **Step 5: Implement frontend direct-run condition flow**

Create `contract-agent-web/src/conditions.js`. Update `api.js` with `parseScreeningPrompt()`. Update `App.jsx` so submit first parses and then immediately starts screening with parsed conditions. Do not show a condition confirmation panel or require a second “开始筛选” click.

- [ ] **Step 6: Verify M2**

Run:

```bash
uv run pytest test/unit_test/api/apps/services/test_contract_screening_parser_service.py test/unit_test/api/apps/services/test_contract_screening_service.py test/unit_test/api/apps/restful_apis/test_contract_screening_api.py
cd contract-agent-web && npm test
```

Expected: all focused tests pass.

- [ ] **Step 7: Commit M2**

Run:

```bash
git add api/apps/services/contract_screening_parser_service.py api/apps/services/contract_screening_service.py api/apps/restful_apis/contract_screening_api.py test/unit_test/api/apps/services/test_contract_screening_parser_service.py test/unit_test/api/apps/services/test_contract_screening_service.py test/unit_test/api/apps/restful_apis/test_contract_screening_api.py contract-agent-web/src
git commit -m "feat(contract-agent): parse screening conditions"
```

## M3: Excel and Word Export

**Outcome:** Completed tasks can be exported to Excel and Word from persisted task data.

- [ ] **Step 1: Write export service tests**

Create `test/unit_test/api/apps/services/test_contract_screening_export_service.py` with tests that verify:

- export rejects unfinished tasks,
- Excel has `筛选摘要`, `合同结果`, and `证据明细` sheets,
- Word includes task prompt, conditions, result summary, and evidence text,
- export rows are scoped by tenant and task.

Run:

```bash
uv run pytest test/unit_test/api/apps/services/test_contract_screening_export_service.py -q
```

Expected: FAIL because export service does not exist yet.

- [ ] **Step 2: Implement export service**

Create `api/apps/services/contract_screening_export_service.py`. Use `openpyxl` for Excel and `python-docx` for Word. Generate files under a controlled configured storage path or existing project temp/export path, then store `file_key` in `ContractScreeningExport`.

- [ ] **Step 3: Add export APIs**

Add:

- `POST /api/v1/contract-screening/tasks/<task_id>/exports`
- `GET /api/v1/contract-screening/exports/<export_id>`

Both endpoints must re-check task ownership and knowledge-base access.

- [ ] **Step 4: Add frontend export adapters and actions**

Update `api.js` with export functions. Update `App.jsx` to show `导出 Excel` and `导出 Word` only when task status is `done`. Update `layout.test.js` to assert exports are gated by completed-state code paths.

- [ ] **Step 5: Verify M3**

Run:

```bash
uv run pytest test/unit_test/api/apps/services/test_contract_screening_export_service.py test/unit_test/api/apps/restful_apis/test_contract_screening_api.py
cd contract-agent-web && npm test
```

Expected: all focused export tests pass.

- [ ] **Step 6: Commit M3**

Run:

```bash
git add api/apps/services/contract_screening_export_service.py api/apps/restful_apis/contract_screening_api.py test/unit_test/api/apps/services/test_contract_screening_export_service.py test/unit_test/api/apps/restful_apis/test_contract_screening_api.py contract-agent-web/src
git commit -m "feat(contract-agent): export screening results"
```

## M4: Result and Evidence Feedback

**Outcome:** Users can submit feedback on contract results and evidence, and feedback is stored for later tuning.

- [ ] **Step 1: Write feedback service tests**

Create `test/unit_test/api/apps/services/test_contract_screening_feedback_service.py` with tests for:

- valid result feedback saves `result_id`,
- valid evidence feedback saves `evidence_id`,
- invalid feedback type is rejected,
- cross-task evidence is rejected,
- cross-tenant feedback is rejected.

Run:

```bash
uv run pytest test/unit_test/api/apps/services/test_contract_screening_feedback_service.py -q
```

Expected: FAIL because feedback service does not exist yet.

- [ ] **Step 2: Implement feedback service and API**

Create `api/apps/services/contract_screening_feedback_service.py`. Add `POST /api/v1/contract-screening/tasks/<task_id>/feedback`. Validate `feedback_type` against the phase 2 spec values.

- [ ] **Step 3: Add frontend feedback actions**

Update `api.js` with `submitScreeningFeedback()`. Update `App.jsx` to provide:

- result feedback on contract cards: `正确命中`, `误命中`, `证据不足`;
- evidence feedback in right panel: `有用`, `无关`, `页码错误`.

Keep feedback UI compact and avoid modal-heavy flows.

- [ ] **Step 4: Verify M4**

Run:

```bash
uv run pytest test/unit_test/api/apps/services/test_contract_screening_feedback_service.py test/unit_test/api/apps/restful_apis/test_contract_screening_api.py
cd contract-agent-web && npm test
```

Expected: all focused feedback tests pass.

- [ ] **Step 5: Commit M4**

Run:

```bash
git add api/apps/services/contract_screening_feedback_service.py api/apps/restful_apis/contract_screening_api.py test/unit_test/api/apps/services/test_contract_screening_feedback_service.py test/unit_test/api/apps/restful_apis/test_contract_screening_api.py contract-agent-web/src
git commit -m "feat(contract-agent): collect screening feedback"
```

## M5: Hardening and Release Verification

**Outcome:** Phase 2 is stable enough to merge and manually verify.

- [ ] **Step 1: Add cross-permission regression tests**

Extend backend tests to prove another user cannot read:

- task history,
- task results,
- export files,
- feedback-linked evidence.

- [ ] **Step 2: Add observability fields and logs**

Add focused logs for:

- parse failure fallback,
- DB persistence failure,
- export creation and completion,
- feedback submission,
- task duration.

Avoid logging evidence text or sensitive contract content.

- [ ] **Step 3: Run full focused backend suite**

Run:

```bash
uv run pytest test/unit_test/api/apps/services/test_contract_screening_service.py test/unit_test/api/apps/services/test_contract_screening_parser_service.py test/unit_test/api/apps/services/test_contract_screening_export_service.py test/unit_test/api/apps/services/test_contract_screening_feedback_service.py test/unit_test/api/apps/restful_apis/test_contract_screening_api.py test/unit_test/api/db/services/test_contract_screening_db_service.py
```

Expected: all phase 1 and phase 2 backend contract screening tests pass.

- [ ] **Step 4: Run frontend suite and build**

Run:

```bash
cd contract-agent-web && npm test && npm run build
```

Expected: tests pass and Vite build succeeds.

- [ ] **Step 5: Run integration smoke checklist**

Manual smoke flow:

1. Open `/contract-agent/?kb_id=<kb_id>`.
2. Submit a Prompt.
3. Confirm no condition confirmation panel appears.
4. Confirm screening starts automatically.
5. Refresh page.
6. Reopen task from history.
7. Open evidence panel.
8. Export Excel.
9. Export Word.
10. Submit result feedback.
11. Submit evidence feedback.

Expected: no permission leaks, no lost task state, and user-facing error messages are readable.

- [ ] **Step 6: Commit M5**

Run:

```bash
git add api contract-agent-web/src test
git commit -m "test(contract-agent): harden phase 2 workflow"
```

## Acceptance Gates

Phase 2 is complete only when all gates pass:

- [ ] User refreshes the page and still sees their own historical screening tasks.
- [ ] Historical tasks reopen with result and evidence data intact.
- [ ] User clicks send once and screening starts directly after Prompt parsing.
- [ ] A completed task exports Excel.
- [ ] A completed task exports Word.
- [ ] User can submit result feedback.
- [ ] User can submit evidence feedback.
- [ ] Cross-tenant and cross-user reads are rejected.
- [ ] Backend focused test suite passes.
- [ ] `contract-agent-web` tests and build pass.

## Execution Notes

- Keep first-stage APIs backward-compatible; existing frontend calls without `conditions` must continue to work.
- Do not stage unrelated files currently shown as untracked, including `package-lock.json`, `web/.vite/`, and `web/tailwind.config.js.bak`, unless the user explicitly asks.
- Keep each milestone commit small enough to review.
- If a milestone requires broad refactoring of `contract-agent-web/src/App.jsx`, split only the new phase 2 UI into focused helper modules first; avoid a full rewrite of the first-stage UI.
- If export file storage has no existing project convention available at implementation time, use a narrow service-level abstraction in `contract_screening_export_service.py` so storage can move later without changing API handlers.
