# Contract Agent P0 Information Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the approved P0 information architecture for the contract screening workbench while preserving the current screening flow and test constraints.

**Architecture:** Keep `App.jsx` as the state orchestrator, but move UI rendering into focused components under `src/components/`. Add small pure helpers for task context and evidence grouping so behavior can be tested without browser tooling. Preserve the existing Vite/React 19 setup, existing API adapter, and existing CSS class contract where tests depend on it.

**Tech Stack:** React 19, Vite 7, Node `node:test`, plain CSS, existing `fetch` API adapter.

---

## File Structure

Create or modify these files:

- Create: `src/components/workspace/WorkspaceShell.jsx`
  - Owns the three-column layout and composes sidebar, main content, and evidence drawer.
- Create: `src/components/workspace/TaskSidebar.jsx`
  - Replaces `ConversationHistory` rendering with task-oriented naming while preserving existing actions.
- Create: `src/components/workspace/TaskHistoryItem.jsx`
  - Renders one task/history row with title, time, status, matched count, and delete affordance.
- Create: `src/components/workspace/TaskContextBar.jsx`
  - Renders knowledge base, task status, result count, parsed condition count, and evidence policy summary.
- Create: `src/components/chat/ChatView.jsx`
  - Owns conversation stream layout and delegates empty, progress, result, and composer rendering.
- Create: `src/components/chat/EmptyPrompt.jsx`
  - Preserves the minimal empty state.
- Create: `src/components/chat/ChatBubble.jsx`
  - Renders user/agent messages and delegates result rendering to `ResultSet`.
- Create: `src/components/chat/ScreeningProgress.jsx`
  - Renders streaming task phases.
- Create: `src/components/chat/PromptComposer.jsx`
  - Renders knowledge base selector, text input, send action, and prompt hints.
- Create: `src/components/results/ResultSet.jsx`
  - Renders result summary and contract result list.
- Create: `src/components/results/ResultSummary.jsx`
  - Renders count and sort/evidence summary for a result set.
- Create: `src/components/results/ContractResultCard.jsx`
  - Renders one result card and opens evidence on click.
- Create: `src/components/results/ResultMetaRow.jsx`
  - Renders supplier, amount, expiry, and contract id metadata.
- Create: `src/components/results/EvidenceActionRow.jsx`
  - Renders evidence selection state and original file download.
- Create: `src/components/evidence/EvidencePanel.jsx`
  - Owns right-side evidence detail layout.
- Create: `src/components/evidence/EvidenceEmptyState.jsx`
  - Renders empty evidence panel state.
- Create: `src/components/evidence/ContractOverview.jsx`
  - Renders contract key/value overview.
- Create: `src/components/evidence/EvidenceGroupList.jsx`
  - Groups and renders evidence snippets by source.
- Create: `src/components/evidence/EvidenceSourceItem.jsx`
  - Renders one evidence snippet.
- Create: `src/components/evidence/ContractTimeline.jsx`
  - Renders key timeline nodes.
- Create: `src/components/ui/IconButton.jsx`
  - Shared icon button wrapper for toggles.
- Create: `src/components/ui/StatusBadge.jsx`
  - Shared badge wrapper for risk/status labels.
- Create: `src/components/ui/KeyValue.jsx`
  - Shared key/value row.
- Create: `src/components/ui/Toast.jsx`
  - Moves existing toast rendering out of `App.jsx`.
- Create: `src/icons.jsx`
  - Moves existing inline icon components from `App.jsx` into a reusable module.
- Create: `src/taskContext.js`
  - Pure helpers for context bar values and evidence grouping.
- Create: `src/taskContext.test.js`
  - Unit tests for task context and evidence grouping.
- Modify: `src/App.jsx`
  - Keep state, API calls, polling, and action handlers. Replace inline UI component definitions with imports and `WorkspaceShell`.
- Modify: `src/styles.css`
  - Add styling for task context bar, result summary, grouped evidence sections, and any component class names introduced by the split.
- Modify: `src/layout.test.js`
  - Preserve existing constraints and add component/source assertions for P0 boundaries.

## Task 1: Add Pure Task Context Helpers

**Files:**
- Create: `src/taskContext.js`
- Create: `src/taskContext.test.js`

- [ ] **Step 1: Write the failing tests**

Create `src/taskContext.test.js`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTaskContext,
  evidencePolicyLabel,
  groupEvidenceBySource,
  resultCountLabel
} from "./taskContext.js";

test("resultCountLabel summarizes result counts", () => {
  assert.equal(resultCountLabel(0), "未命中合同");
  assert.equal(resultCountLabel(1), "命中 1 份合同");
  assert.equal(resultCountLabel(12), "命中 12 份合同");
});

test("evidencePolicyLabel summarizes max evidence policy", () => {
  assert.equal(evidencePolicyLabel({ max_evidence_per_contract: 5 }), "最多 5 条证据/合同");
  assert.equal(evidencePolicyLabel({ max_evidence_per_contract: "3" }), "最多 3 条证据/合同");
  assert.equal(evidencePolicyLabel(null), "按默认证据策略");
  assert.equal(evidencePolicyLabel({}), "按默认证据策略");
});

test("buildTaskContext handles idle and completed task states", () => {
  assert.deepEqual(
    buildTaskContext({
      knowledgeBaseName: "合同知识库",
      taskStatus: "",
      resultCount: 0,
      conditionCount: 0,
      evidencePolicy: null
    }),
    {
      knowledgeBaseName: "合同知识库",
      taskStatusLabel: "准备筛选",
      resultCountLabel: "未命中合同",
      conditionCountLabel: "未解析条件",
      evidencePolicyLabel: "按默认证据策略"
    }
  );

  assert.deepEqual(
    buildTaskContext({
      knowledgeBaseName: "采购合同",
      taskStatus: "done",
      resultCount: 7,
      conditionCount: 2,
      evidencePolicy: { max_evidence_per_contract: 5 }
    }),
    {
      knowledgeBaseName: "采购合同",
      taskStatusLabel: "筛选完成",
      resultCountLabel: "命中 7 份合同",
      conditionCountLabel: "2 个条件",
      evidencePolicyLabel: "最多 5 条证据/合同"
    }
  );
});

test("groupEvidenceBySource groups evidence and preserves order", () => {
  const groups = groupEvidenceBySource([
    { source: "合同正文", ref: "第 1 页", text: "正文证据" },
    { source: "审批单", ref: "FA-1", text: "审批证据" },
    { source: "合同正文", ref: "第 2 页", text: "正文证据 2" },
    { ref: "未知", text: "未知来源证据" }
  ]);

  assert.deepEqual(groups, [
    {
      source: "合同正文",
      items: [
        { source: "合同正文", ref: "第 1 页", text: "正文证据" },
        { source: "合同正文", ref: "第 2 页", text: "正文证据 2" }
      ]
    },
    {
      source: "审批单",
      items: [{ source: "审批单", ref: "FA-1", text: "审批证据" }]
    },
    {
      source: "未标注来源",
      items: [{ ref: "未知", text: "未知来源证据" }]
    }
  ]);
});

test("groupEvidenceBySource returns an empty list for non-arrays", () => {
  assert.deepEqual(groupEvidenceBySource(null), []);
  assert.deepEqual(groupEvidenceBySource({}), []);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/taskContext.test.js
```

Expected: FAIL with a module-not-found error for `./taskContext.js`.

- [ ] **Step 3: Implement the pure helpers**

Create `src/taskContext.js`:

```js
const TASK_STATUS_LABELS = {
  done: "筛选完成",
  failed: "筛选失败",
  cancelled: "任务已取消",
  running: "筛选中",
  pending: "等待筛选"
};

export function resultCountLabel(count) {
  const value = Number(count);
  const normalized = Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
  return normalized > 0 ? `命中 ${normalized} 份合同` : "未命中合同";
}

export function evidencePolicyLabel(policy) {
  const rawMax = Number(policy?.max_evidence_per_contract);
  if (!Number.isFinite(rawMax) || rawMax <= 0) {
    return "按默认证据策略";
  }
  return `最多 ${Math.round(rawMax)} 条证据/合同`;
}

export function conditionCountLabel(count) {
  const value = Number(count);
  const normalized = Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
  return normalized > 0 ? `${normalized} 个条件` : "未解析条件";
}

export function taskStatusLabel(status) {
  const key = String(status || "").toLowerCase();
  return TASK_STATUS_LABELS[key] || "准备筛选";
}

export function buildTaskContext({
  knowledgeBaseName = "未选择知识库",
  taskStatus = "",
  resultCount = 0,
  conditionCount = 0,
  evidencePolicy = null
} = {}) {
  return {
    knowledgeBaseName,
    taskStatusLabel: taskStatusLabel(taskStatus),
    resultCountLabel: resultCountLabel(resultCount),
    conditionCountLabel: conditionCountLabel(conditionCount),
    evidencePolicyLabel: evidencePolicyLabel(evidencePolicy)
  };
}

export function groupEvidenceBySource(evidence) {
  if (!Array.isArray(evidence)) {
    return [];
  }

  const groups = [];
  const indexes = new Map();

  evidence.forEach((item) => {
    const source = String(item?.source || "").trim() || "未标注来源";
    const existingIndex = indexes.get(source);

    if (existingIndex === undefined) {
      indexes.set(source, groups.length);
      groups.push({ source, items: [item] });
      return;
    }

    groups[existingIndex].items.push(item);
  });

  return groups;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
npm test -- src/taskContext.test.js
```

Expected: PASS for all `taskContext` tests.

- [ ] **Step 5: Commit**

```bash
git add src/taskContext.js src/taskContext.test.js
git commit -m "test: add contract task context helpers"
```

## Task 2: Extract Shared Icons And UI Primitives

**Files:**
- Create: `src/icons.jsx`
- Create: `src/components/ui/IconButton.jsx`
- Create: `src/components/ui/StatusBadge.jsx`
- Create: `src/components/ui/KeyValue.jsx`
- Create: `src/components/ui/Toast.jsx`
- Modify: `src/App.jsx`

- [ ] **Step 1: Move icon components**

Create `src/icons.jsx` with the icon components currently defined near the top of `src/App.jsx`:

```jsx
export function HistoryIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12,6 12,12 16,14" />
    </svg>
  );
}

export function ChevronRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <polyline points="9,18 15,12 9,6" />
    </svg>
  );
}

export function SendIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <line x1="22" y1="2" x2="11" y2="13" />
      <polygon points="22,2 15,22 11,13 2,9" />
    </svg>
  );
}

export function DocumentIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v5h5M9 12h6M9 16h4" />
    </svg>
  );
}

export function DownloadIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7,10 12,15 17,10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

export function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <polyline points="3,6 5,6 21,6" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

export function NewChatIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

export function EyeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
      <polyline points="20,6 9,17 4,12" />
    </svg>
  );
}

export function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

export function BrainIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 2a4 4 0 0 1 4 4c0 1.1-.5 2.1-1.2 2.8l1.8 6.2H7.4l1.8-6.2A3.9 3.9 0 0 1 8 6a4 4 0 0 1 4-4z" />
      <path d="M9 15h6v3a2 2 0 0 1-2 2h-2a2 2 0 0 1-2-2v-3z" />
    </svg>
  );
}

export function LogoutIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <polyline points="16,17 21,12 16,7" />
      <line x1="21" y1="12" x2="9" y2="12" />
    </svg>
  );
}
```

Delete the same icon function definitions from `src/App.jsx` after imports are added.

- [ ] **Step 2: Add UI primitives**

Create `src/components/ui/IconButton.jsx`:

```jsx
export function IconButton({ children, className = "sidebar-toggle", label, pressed, title, onClick, type = "button" }) {
  const props = pressed === undefined ? {} : { "aria-pressed": pressed };

  return (
    <button className={className} type={type} aria-label={label} title={title} onClick={onClick} {...props}>
      {children}
    </button>
  );
}
```

Create `src/components/ui/StatusBadge.jsx`:

```jsx
export function StatusBadge({ children, className = "", title }) {
  return (
    <span className={`status${className ? ` ${className}` : ""}`} title={title}>
      {children}
    </span>
  );
}
```

Create `src/components/ui/KeyValue.jsx`:

```jsx
export function KeyValue({ label, value }) {
  return (
    <div className="kv">
      <span>{label}</span>
      <strong>{value || "未提供"}</strong>
    </div>
  );
}
```

Create `src/components/ui/Toast.jsx`:

```jsx
export function Toast({ message, visible }) {
  return (
    <div className={`toast${visible ? " show" : ""}`} role="status" aria-live="polite">
      {message}
    </div>
  );
}
```

- [ ] **Step 3: Wire imports in App without behavior changes**

Modify the top of `src/App.jsx` to import moved symbols:

```jsx
import { Toast } from "./components/ui/Toast.jsx";
import {
  HistoryIcon,
  ChevronRightIcon,
  SendIcon,
  DocumentIcon,
  DownloadIcon,
  TrashIcon,
  NewChatIcon,
  EyeIcon,
  CheckIcon,
  SearchIcon,
  BrainIcon,
  LogoutIcon
} from "./icons.jsx";
```

Remove the local `Toast` and icon component definitions from `src/App.jsx`. Do not change JSX behavior yet.

- [ ] **Step 4: Run full tests**

Run:

```bash
npm test
```

Expected: PASS. Existing layout tests should still pass because visible text and CSS class names are unchanged.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx src/icons.jsx src/components/ui/IconButton.jsx src/components/ui/StatusBadge.jsx src/components/ui/KeyValue.jsx src/components/ui/Toast.jsx
git commit -m "refactor: extract contract agent ui primitives"
```

## Task 3: Extract Result Components

**Files:**
- Create: `src/components/results/ResultMetaRow.jsx`
- Create: `src/components/results/EvidenceActionRow.jsx`
- Create: `src/components/results/ContractResultCard.jsx`
- Create: `src/components/results/ResultSummary.jsx`
- Create: `src/components/results/ResultSet.jsx`
- Modify: `src/App.jsx`
- Modify: `src/layout.test.js`

- [ ] **Step 1: Add layout assertions for result component boundaries**

Append to `src/layout.test.js`:

```js
test("result rendering is split into focused P0 components", () => {
  const resultSetSource = readFileSync(new URL("./components/results/ResultSet.jsx", import.meta.url), "utf8");
  const resultCardSource = readFileSync(new URL("./components/results/ContractResultCard.jsx", import.meta.url), "utf8");
  const evidenceActionSource = readFileSync(new URL("./components/results/EvidenceActionRow.jsx", import.meta.url), "utf8");

  assert.match(resultSetSource, /function ResultSet/, "ResultSet should own result collection rendering");
  assert.match(resultCardSource, /function ContractResultCard/, "ContractResultCard should render one contract result");
  assert.match(evidenceActionSource, /event\.stopPropagation\(\)/, "download clicks should still avoid opening evidence");
  assert.match(evidenceActionSource, /下载原文件/, "original file download should remain available");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/layout.test.js
```

Expected: FAIL because result component files do not exist.

- [ ] **Step 3: Create result components**

Create `src/components/results/ResultMetaRow.jsx`:

```jsx
export function ResultMetaRow({ item }) {
  return (
    <div className="result-meta">
      <span>{item.id || "未编号"}</span>
      <span>{item.supplier || "未提供供应商"}</span>
      <span>{item.amount || "金额未提供"}</span>
      <span>{item.expiry || "到期日未提供"}</span>
    </div>
  );
}
```

Create `src/components/results/EvidenceActionRow.jsx`:

```jsx
import { DownloadIcon, EyeIcon } from "../../icons.jsx";

export function EvidenceActionRow({ evidenceCount, isViewing, downloadUrl }) {
  return (
    <div className="evidence-line">
      {isViewing ? (
        <span className="viewing-badge">
          <EyeIcon /> 正在查看证据
        </span>
      ) : (
        <span className="source-toggle">
          <EyeIcon /> 查看 {evidenceCount} 条证据
        </span>
      )}
      {downloadUrl && (
        <a
          className="btn btn-secondary btn-small download-file-button"
          href={downloadUrl}
          download
          onClick={(event) => {
            event.stopPropagation();
          }}
          title="下载原文件"
        >
          <DownloadIcon /> 下载原文件
        </a>
      )}
    </div>
  );
}
```

Create `src/components/results/ContractResultCard.jsx`:

```jsx
import { statusClass } from "../../logic.js";
import { StatusBadge } from "../ui/StatusBadge.jsx";
import { EvidenceActionRow } from "./EvidenceActionRow.jsx";
import { ResultMetaRow } from "./ResultMetaRow.jsx";

export function ContractResultCard({ item, taskId, isViewing, onViewEvidence }) {
  const evidenceCount = Array.isArray(item.evidence) ? item.evidence.length : 0;

  function openEvidence() {
    onViewEvidence({ ...item, taskId });
  }

  function handleKeyDown(event) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openEvidence();
    }
  }

  return (
    <div
      className={`chat-result-card${isViewing ? " is-viewing" : ""}`}
      role="button"
      tabIndex={0}
      onClick={openEvidence}
      onKeyDown={handleKeyDown}
    >
      <div className="result-top">
        <div>
          <h3>{item.title || "未命名合同"}</h3>
          <ResultMetaRow item={item} />
        </div>
        <span className="score">{item.score || 0}%</span>
      </div>
      <p className="excerpt">{item.reason || "命中当前筛选条件。"}</p>
      <div className="hint-row mt-3">
        <StatusBadge className={statusClass(item.risk)}>{item.risk || "未知"}风险</StatusBadge>
        <StatusBadge className="status-strong">{item.status || "状态未提供"}</StatusBadge>
        <StatusBadge>{item.owner || "负责人未提供"}</StatusBadge>
      </div>
      <EvidenceActionRow evidenceCount={evidenceCount} isViewing={isViewing} downloadUrl={item.downloadUrl} />
    </div>
  );
}
```

Create `src/components/results/ResultSummary.jsx`:

```jsx
import { resultCountLabel } from "../../taskContext.js";

export function ResultSummary({ count }) {
  return (
    <div className="result-summary">
      <strong>{resultCountLabel(count)}</strong>
      <span>按风险等级、到期紧迫度、匹配分综合排序</span>
    </div>
  );
}
```

Create `src/components/results/ResultSet.jsx`:

```jsx
import { ContractResultCard } from "./ContractResultCard.jsx";
import { ResultSummary } from "./ResultSummary.jsx";

export function ResultSet({ items, taskId, viewingItemId, onViewEvidence }) {
  const resultItems = Array.isArray(items) ? items : [];

  if (resultItems.length === 0) {
    return null;
  }

  return (
    <div className="result-set">
      <ResultSummary count={resultItems.length} />
      <div className="chat-results-grid">
        {resultItems.map((item, index) => (
          <ContractResultCard
            key={item.id || `${item.title}-${index}`}
            item={item}
            taskId={taskId}
            isViewing={viewingItemId === item.id}
            onViewEvidence={onViewEvidence}
          />
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire ResultSet in App**

In `src/App.jsx`, import:

```jsx
import { ResultSet } from "./components/results/ResultSet.jsx";
```

Inside `ChatBubble`, replace the inline result card block with:

```jsx
<ResultSet
  items={resultItems}
  taskId={message.taskId}
  viewingItemId={viewingItemId}
  onViewEvidence={onViewEvidence}
/>
```

Remove direct `DownloadIcon`, `EyeIcon`, and `statusClass` usages from `ChatBubble` if no longer needed elsewhere in `App.jsx`.

- [ ] **Step 5: Add result summary CSS**

Append to the result section in `src/styles.css`:

```css
.result-set {
  margin-top: var(--space-3);
}
.result-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-3);
  border: 1px solid var(--color-fog);
  border-radius: var(--radius-sm);
  background: var(--color-paper);
  padding: 8px 12px;
  color: var(--color-smoke);
  font-size: var(--text-sm);
  line-height: 20px;
}
.result-summary strong {
  color: var(--color-ink-black);
  font-weight: 500;
}
```

- [ ] **Step 6: Run tests**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/App.jsx src/layout.test.js src/styles.css src/components/results src/taskContext.js
git commit -m "refactor: split contract result rendering"
```

## Task 4: Extract Evidence Components And Group Evidence

**Files:**
- Create: `src/components/evidence/EvidenceEmptyState.jsx`
- Create: `src/components/evidence/ContractOverview.jsx`
- Create: `src/components/evidence/EvidenceSourceItem.jsx`
- Create: `src/components/evidence/EvidenceGroupList.jsx`
- Create: `src/components/evidence/ContractTimeline.jsx`
- Create: `src/components/evidence/EvidencePanel.jsx`
- Modify: `src/App.jsx`
- Modify: `src/styles.css`
- Modify: `src/layout.test.js`

- [ ] **Step 1: Add layout assertions for evidence components**

Append to `src/layout.test.js`:

```js
test("evidence panel uses grouped evidence components without low-value actions", () => {
  const evidencePanelSource = readFileSync(new URL("./components/evidence/EvidencePanel.jsx", import.meta.url), "utf8");
  const evidenceGroupSource = readFileSync(new URL("./components/evidence/EvidenceGroupList.jsx", import.meta.url), "utf8");

  assert.match(evidencePanelSource, /function EvidencePanel/, "EvidencePanel should own evidence detail rendering");
  assert.match(evidenceGroupSource, /groupEvidenceBySource/, "evidence should be grouped by source");
  assert.ok(!evidencePanelSource.includes("复制证据"), "copy evidence action should not be added");
  assert.ok(!evidencePanelSource.includes("加入待办"), "fake todo action should not be added");
  assert.ok(!evidencePanelSource.includes("结果有用"), "feedback action should not be added");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/layout.test.js
```

Expected: FAIL because evidence component files do not exist.

- [ ] **Step 3: Create evidence components**

Create `src/components/evidence/EvidenceEmptyState.jsx`:

```jsx
export function EvidenceEmptyState() {
  return (
    <div className="state-panel" style={{ minHeight: "200px" }}>
      <strong>选择合同查看证据</strong>
      <span>在对话结果中点击"查看证据"，将在此处展示合同条款、审批记录、履约信息和供应商评级。</span>
    </div>
  );
}
```

Create `src/components/evidence/ContractOverview.jsx`:

```jsx
import { KeyValue } from "../ui/KeyValue.jsx";

export function ContractOverview({ item }) {
  return (
    <div className="detail-section">
      <KeyValue label="合同编号" value={item.id} />
      <KeyValue label="供应商" value={item.supplier} />
      <KeyValue label="合同金额" value={item.amount} />
      <KeyValue label="到期日期" value={item.expiry} />
      <KeyValue label="访问权限" value={item.permissions} />
      <KeyValue label="匹配度" value={`${item.score || 0}%`} />
    </div>
  );
}
```

Create `src/components/evidence/EvidenceSourceItem.jsx`:

```jsx
export function EvidenceSourceItem({ evidence }) {
  return (
    <li className="source-item">
      <strong>{evidence.ref || "未标注位置"}</strong>
      <span>{evidence.text || "后端未返回证据文本。"}</span>
    </li>
  );
}
```

Create `src/components/evidence/EvidenceGroupList.jsx`:

```jsx
import { groupEvidenceBySource } from "../../taskContext.js";
import { EvidenceSourceItem } from "./EvidenceSourceItem.jsx";

export function EvidenceGroupList({ evidence }) {
  const groups = groupEvidenceBySource(evidence);

  if (groups.length === 0) {
    return (
      <ul className="source-list">
        <li className="source-item">
          <strong>暂无引用证据</strong>
          <span>后端未返回证据片段。</span>
        </li>
      </ul>
    );
  }

  return (
    <div className="evidence-groups">
      {groups.map((group) => (
        <section className="evidence-group" key={group.source}>
          <h4>{group.source}</h4>
          <ul className="source-list">
            {group.items.map((evidenceItem, index) => (
              <EvidenceSourceItem evidence={evidenceItem} key={`${group.source}-${evidenceItem.ref || index}`} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
```

Create `src/components/evidence/ContractTimeline.jsx`:

```jsx
import { normalizeTimelineItems } from "../../logic.js";

export function ContractTimeline({ timeline }) {
  const timelineItems = normalizeTimelineItems(timeline);
  const items = timelineItems.length > 0 ? timelineItems : [["筛选任务", "已完成"]];

  return (
    <div className="timeline">
      {items.map(([label, value]) => (
        <div className="timeline-item" key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
        </div>
      ))}
    </div>
  );
}
```

Create `src/components/evidence/EvidencePanel.jsx`:

```jsx
import { ChevronRightIcon } from "../../icons.jsx";
import { IconButton } from "../ui/IconButton.jsx";
import { ContractOverview } from "./ContractOverview.jsx";
import { ContractTimeline } from "./ContractTimeline.jsx";
import { EvidenceEmptyState } from "./EvidenceEmptyState.jsx";
import { EvidenceGroupList } from "./EvidenceGroupList.jsx";

export function EvidencePanel({ item, onClose }) {
  if (!item) {
    return (
      <div className="evidence-panel">
        <div className="evidence-header">
          <p className="meta">证据详情</p>
          <IconButton label="收起面板" onClick={onClose}>
            <ChevronRightIcon />
          </IconButton>
        </div>
        <div className="evidence-body">
          <EvidenceEmptyState />
        </div>
      </div>
    );
  }

  return (
    <div className="evidence-panel">
      <div className="evidence-header">
        <div>
          <p className="meta">证据详情</p>
          <h3>{item.title}</h3>
        </div>
        <IconButton label="收起面板" onClick={onClose}>
          <ChevronRightIcon />
        </IconButton>
      </div>
      <div className="evidence-body">
        <ContractOverview item={item} />

        <div className="detail-section">
          <p className="meta">命中解释</p>
          <p className="body-copy mt-2">{item.reason || "命中当前筛选条件。"}</p>
        </div>

        <div className="detail-section">
          <p className="meta">引用证据</p>
          <EvidenceGroupList evidence={item.evidence} />
        </div>

        <div className="detail-section">
          <p className="meta">关键节点</p>
          <ContractTimeline timeline={item.timeline} />
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Wire EvidencePanel in App**

In `src/App.jsx`, import:

```jsx
import { EvidencePanel } from "./components/evidence/EvidencePanel.jsx";
```

Delete the local `EvidencePanel` and `KeyValue` component definitions from `src/App.jsx`. Keep the existing JSX usage:

```jsx
<EvidencePanel item={evidenceItem} onClose={() => setEvidenceOpen(false)} />
```

Remove `ChevronRightIcon` and `normalizeTimelineItems` imports/usages from `App.jsx` if they are no longer needed there.

- [ ] **Step 5: Add grouped evidence CSS**

Append near the evidence section in `src/styles.css`:

```css
.evidence-groups {
  display: grid;
  gap: var(--space-3);
  margin-top: var(--space-3);
}
.evidence-group {
  display: grid;
  gap: var(--space-2);
}
.evidence-group h4 {
  margin: 0;
  color: var(--color-ink-black);
  font-size: var(--text-sm);
  font-weight: 500;
  line-height: 20px;
}
```

- [ ] **Step 6: Run tests**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/App.jsx src/layout.test.js src/styles.css src/components/evidence src/components/ui src/taskContext.js
git commit -m "refactor: split grouped evidence panel"
```

## Task 5: Extract Chat And Workspace Components

**Files:**
- Create: `src/components/chat/EmptyPrompt.jsx`
- Create: `src/components/chat/ScreeningProgress.jsx`
- Create: `src/components/chat/PromptComposer.jsx`
- Create: `src/components/chat/ChatBubble.jsx`
- Create: `src/components/chat/ChatView.jsx`
- Create: `src/components/workspace/TaskHistoryItem.jsx`
- Create: `src/components/workspace/TaskSidebar.jsx`
- Create: `src/components/workspace/TaskContextBar.jsx`
- Create: `src/components/workspace/WorkspaceShell.jsx`
- Modify: `src/App.jsx`
- Modify: `src/styles.css`
- Modify: `src/layout.test.js`

- [ ] **Step 1: Add layout assertions for workspace and chat components**

Append to `src/layout.test.js`:

```js
test("workspace and chat rendering are split into P0 components", () => {
  const workspaceSource = readFileSync(new URL("./components/workspace/WorkspaceShell.jsx", import.meta.url), "utf8");
  const contextBarSource = readFileSync(new URL("./components/workspace/TaskContextBar.jsx", import.meta.url), "utf8");
  const chatViewSource = readFileSync(new URL("./components/chat/ChatView.jsx", import.meta.url), "utf8");
  const promptComposerSource = readFileSync(new URL("./components/chat/PromptComposer.jsx", import.meta.url), "utf8");

  assert.match(workspaceSource, /className=\{`workspace/, "WorkspaceShell should own workspace layout");
  assert.match(contextBarSource, /task-context-bar/, "TaskContextBar should render task context");
  assert.match(chatViewSource, /function ChatView/, "ChatView should own conversation layout");
  assert.match(promptComposerSource, /知识库/, "PromptComposer should keep knowledge base selection");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
npm test -- src/layout.test.js
```

Expected: FAIL because workspace and chat component files do not exist.

- [ ] **Step 3: Create chat components**

Create `src/components/chat/EmptyPrompt.jsx`:

```jsx
export function EmptyPrompt() {
  return (
    <div className="welcome-center">
      <div className="welcome-card">
        <h1 className="welcome-title">要筛选哪些合同？</h1>
      </div>
    </div>
  );
}
```

Create `src/components/chat/ScreeningProgress.jsx`:

```jsx
import { BrainIcon, CheckIcon, SearchIcon } from "../../icons.jsx";

export function ScreeningProgress({ displayStreaming, streamingPhases }) {
  if (!displayStreaming) {
    return null;
  }

  return (
    <div className="chat-bubble agent">
      <span className="bubble-label">Agent</span>
      <div className="bubble-content">
        {streamingPhases && streamingPhases.length > 0 ? (
          <div>
            {streamingPhases.map((phase) => (
              <div
                key={phase.key}
                className={`streaming-phase${phase.done ? " is-done" : ""}${!phase.done && phase === streamingPhases[streamingPhases.length - 1] ? " is-active" : ""}`}
              >
                <span className="phase-icon">
                  {phase.done ? <CheckIcon /> : phase === streamingPhases[streamingPhases.length - 1] ? <BrainIcon /> : <SearchIcon />}
                </span>
                <span>{phase.label}</span>
              </div>
            ))}
          </div>
        ) : (
          <span>正在处理...</span>
        )}
        <span className="streaming-cursor" style={{ marginLeft: "2px" }} />
      </div>
    </div>
  );
}
```

Create `src/components/chat/PromptComposer.jsx`:

```jsx
import { NewChatIcon, SendIcon } from "../../icons.jsx";
import { promptExamples } from "../../data.js";

export function PromptComposer({
  isStreaming,
  onSend,
  inputValue,
  setInputValue,
  knowledgeBases,
  selectedKnowledgeBaseId,
  onKnowledgeBaseChange,
  isKnowledgeBaseLoading,
  knowledgeBaseError
}) {
  function handleSend() {
    const trimmed = inputValue.trim();
    if (!trimmed || isStreaming || !selectedKnowledgeBaseId) return;
    onSend(trimmed);
    setInputValue("");
  }

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="chat-input-bar">
      <div className="kb-toolbar">
        <label className="kb-selector">
          <span>知识库</span>
          <select
            value={selectedKnowledgeBaseId || ""}
            onChange={(event) => onKnowledgeBaseChange(event.target.value)}
            disabled={isStreaming || isKnowledgeBaseLoading || knowledgeBases.length === 0}
          >
            <option value="">{isKnowledgeBaseLoading ? "正在加载知识库..." : "请选择知识库"}</option>
            {knowledgeBases.map((kb) => (
              <option key={kb.id} value={kb.id}>
                {kb.name} · {kb.document_count} 份文档
              </option>
            ))}
          </select>
        </label>
        <span className={`kb-state${knowledgeBaseError ? " is-error" : ""}`}>
          {knowledgeBaseError ? "请选择知识库" : selectedKnowledgeBaseId ? "已连接当前知识库" : "选择知识库后开始筛选"}
        </span>
      </div>
      <div className="chat-input-row">
        <button className="input-plus" type="button" aria-label="添加附件">
          <NewChatIcon />
        </button>
        <textarea
          className="chat-input"
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="描述你要找的合同，例如：筛出本季度到期的外包合同..."
          rows={1}
          disabled={isStreaming}
        />
        <button
          className="chat-send"
          type="button"
          onClick={handleSend}
          disabled={isStreaming || !inputValue.trim() || !selectedKnowledgeBaseId}
          aria-label="发送消息"
        >
          <SendIcon /> 发送
        </button>
      </div>
      <div className="chat-hints">
        {promptExamples.slice(0, 2).map((prompt) => (
          <button
            className="btn btn-secondary btn-small"
            key={prompt}
            type="button"
            onClick={() => setInputValue(prompt)}
            disabled={isStreaming || !selectedKnowledgeBaseId}
          >
            {prompt}
          </button>
        ))}
        <span className="muted" style={{ fontSize: "var(--text-xs)", display: "inline-flex", alignItems: "center", marginLeft: "auto" }}>
          Enter 发送 · Shift+Enter 换行
        </span>
      </div>
    </div>
  );
}
```

Create `src/components/chat/ChatBubble.jsx`:

```jsx
import { strategyToText } from "../../logic.js";
import { ResultSet } from "../results/ResultSet.jsx";

export function ChatBubble({ message, viewingItemId, onViewEvidence }) {
  const strategyLines = strategyToText(message.strategy).split("\n").filter(Boolean);
  const resultItems = Array.isArray(message.results) ? message.results : [];

  return (
    <div className={`chat-bubble ${message.role}`}>
      <span className="bubble-label">{message.role === "user" ? "你" : "Agent"}</span>
      <div className="bubble-content">
        {message.content && <p style={{ whiteSpace: "pre-wrap" }}>{message.content}</p>}
        {strategyLines.length > 0 && (
          <div className="bubble-strategy">
            <p className="strategy-title">检索策略</p>
            <ol style={{ margin: 0, paddingLeft: "16px", fontSize: "var(--text-sm)", color: "var(--fg-2)", display: "grid", gap: "var(--space-1)" }}>
              {strategyLines.map((line, index) => (
                <li key={index}>{line}</li>
              ))}
            </ol>
          </div>
        )}
        <ResultSet
          items={resultItems}
          taskId={message.taskId}
          viewingItemId={viewingItemId}
          onViewEvidence={onViewEvidence}
        />
      </div>
    </div>
  );
}
```

Create `src/components/chat/ChatView.jsx`:

```jsx
import { useEffect, useRef } from "react";
import { ChatBubble } from "./ChatBubble.jsx";
import { EmptyPrompt } from "./EmptyPrompt.jsx";
import { PromptComposer } from "./PromptComposer.jsx";
import { ScreeningProgress } from "./ScreeningProgress.jsx";

export function ChatView({
  messages,
  isStreaming,
  displayStreaming,
  streamingPhases,
  onSend,
  onViewEvidence,
  viewingItemId,
  inputValue,
  setInputValue,
  knowledgeBases,
  selectedKnowledgeBaseId,
  onKnowledgeBaseChange,
  isKnowledgeBaseLoading,
  knowledgeBaseError
}) {
  const bodyRef = useRef(null);

  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [messages, streamingPhases]);

  return (
    <div className="conversation">
      {messages.length === 0 ? (
        <EmptyPrompt />
      ) : (
        <div className="conversation-body" ref={bodyRef}>
          {messages.map((message) => (
            <ChatBubble
              key={message.id}
              message={message}
              viewingItemId={viewingItemId}
              onViewEvidence={onViewEvidence}
            />
          ))}
          <ScreeningProgress displayStreaming={displayStreaming} streamingPhases={streamingPhases} />
        </div>
      )}
      <PromptComposer
        messages={messages}
        isStreaming={isStreaming}
        onSend={onSend}
        inputValue={inputValue}
        setInputValue={setInputValue}
        knowledgeBases={knowledgeBases}
        selectedKnowledgeBaseId={selectedKnowledgeBaseId}
        onKnowledgeBaseChange={onKnowledgeBaseChange}
        isKnowledgeBaseLoading={isKnowledgeBaseLoading}
        knowledgeBaseError={knowledgeBaseError}
      />
    </div>
  );
}
```

- [ ] **Step 4: Create workspace components**

Create `src/components/workspace/TaskHistoryItem.jsx`:

```jsx
import { TrashIcon } from "../../icons.jsx";

export function TaskHistoryItem({ conversation, active, onSelect, onDelete }) {
  const countLabel = conversation.item_count ? `${conversation.item_count} 份` : "";

  return (
    <button
      className={`history-item${active ? " is-active" : ""}`}
      type="button"
      role="option"
      aria-selected={active}
      onClick={() => onSelect(conversation.id)}
    >
      {conversation.title}
      <span className="history-time">
        {conversation.time}
        {countLabel ? ` · ${countLabel}` : ""}
      </span>
      <span
        className="history-delete"
        title="删除会话"
        onClick={(event) => {
          event.stopPropagation();
          onDelete(conversation.id);
        }}
      >
        <TrashIcon />
      </span>
    </button>
  );
}
```

Create `src/components/workspace/TaskSidebar.jsx`:

```jsx
import { DocumentIcon, HistoryIcon, LogoutIcon, NewChatIcon, SearchIcon } from "../../icons.jsx";
import { TaskHistoryItem } from "./TaskHistoryItem.jsx";

export function TaskSidebar({ conversations, activeId, onSelect, onNew, onDelete, onLogout }) {
  return (
    <div className="history-panel">
      <div className="sidebar-brand">
        <button className="sidebar-menu" type="button" aria-label="展开或收起导航">
          <HistoryIcon />
        </button>
        <span>合同智能筛选</span>
      </div>
      <nav className="sidebar-nav" aria-label="工作台导航">
        <button className="sidebar-nav-item" type="button" onClick={onNew}>
          <NewChatIcon /> 新建筛选
        </button>
        <button className="sidebar-nav-item" type="button">
          <SearchIcon /> 搜索历史
        </button>
        <button className="sidebar-nav-item" type="button">
          <DocumentIcon /> 合同库
        </button>
      </nav>
      <div className="history-header">
        <div>
          <p className="meta">任务历史</p>
          <h3>筛选任务</h3>
        </div>
      </div>
      <div className="history-list" role="listbox" aria-label="历史会话列表">
        {conversations.length === 0 ? (
          <p className="history-empty">尚无历史会话，输入筛选目标开始。</p>
        ) : (
          conversations.map((conversation) => (
            <TaskHistoryItem
              key={conversation.id}
              conversation={conversation}
              active={conversation.id === activeId}
              onSelect={onSelect}
              onDelete={onDelete}
            />
          ))
        )}
      </div>
      <div className="sidebar-footer">
        <button className="btn btn-secondary btn-small" type="button" onClick={onLogout}>
          <LogoutIcon /> 注销
        </button>
      </div>
    </div>
  );
}
```

Create `src/components/workspace/TaskContextBar.jsx`:

```jsx
import { buildTaskContext } from "../../taskContext.js";

export function TaskContextBar({ knowledgeBaseName, taskStatus, resultCount, conditionCount, evidencePolicy }) {
  const context = buildTaskContext({
    knowledgeBaseName,
    taskStatus,
    resultCount,
    conditionCount,
    evidencePolicy
  });

  return (
    <div className="task-context-bar" aria-label="筛选任务上下文">
      <span>{context.knowledgeBaseName}</span>
      <span>{context.taskStatusLabel}</span>
      <span>{context.resultCountLabel}</span>
      <span>{context.conditionCountLabel}</span>
      <span>{context.evidencePolicyLabel}</span>
    </div>
  );
}
```

Create `src/components/workspace/WorkspaceShell.jsx`:

```jsx
import { EyeIcon, HistoryIcon } from "../../icons.jsx";
import { IconButton } from "../ui/IconButton.jsx";
import { TaskContextBar } from "./TaskContextBar.jsx";
import { TaskSidebar } from "./TaskSidebar.jsx";

export function WorkspaceShell({
  historyOpen,
  evidenceOpen,
  onToggleHistory,
  onToggleEvidence,
  conversations,
  activeConversationId,
  onSelectConversation,
  onNewConversation,
  onDeleteConversation,
  onLogout,
  taskContext,
  chat,
  evidence
}) {
  return (
    <main className={`workspace${historyOpen ? "" : " history-collapsed"}`} data-od-id="workspace">
      <div className={`chat-col${historyOpen ? "" : " collapsed"}`} aria-label="对话历史面板">
        <TaskSidebar
          conversations={conversations}
          activeId={activeConversationId}
          onSelect={onSelectConversation}
          onNew={onNewConversation}
          onDelete={onDeleteConversation}
          onLogout={onLogout}
        />
      </div>

      <div className="main-col">
        <div className="main-stage-header">
          <IconButton
            label={historyOpen ? "收起历史面板" : "展开历史面板"}
            pressed={historyOpen}
            onClick={onToggleHistory}
            title="对话历史"
          >
            <HistoryIcon />
          </IconButton>
          <TaskContextBar {...taskContext} />
          <div className="main-header-actions">
            <IconButton
              label={evidenceOpen ? "收起证据面板" : "展开证据面板"}
              pressed={evidenceOpen}
              onClick={onToggleEvidence}
              title="证据详情"
            >
              <EyeIcon />
            </IconButton>
          </div>
        </div>
        {chat}
      </div>

      <div className={`evidence-col${evidenceOpen ? "" : " collapsed"}`} aria-label="证据详情面板">
        {evidence}
      </div>
    </main>
  );
}
```

- [ ] **Step 5: Wire workspace and chat in App**

In `src/App.jsx`, import:

```jsx
import { ChatView } from "./components/chat/ChatView.jsx";
import { EvidencePanel } from "./components/evidence/EvidencePanel.jsx";
import { Toast } from "./components/ui/Toast.jsx";
import { WorkspaceShell } from "./components/workspace/WorkspaceShell.jsx";
```

Delete local `ConversationHistory`, `ChatView`, `ChatBubble`, and any now-unused local UI definitions from `src/App.jsx`.

Compute current task context before `return`:

```jsx
const selectedKnowledgeBase = knowledgeBases.find((kb) => kb.id === selectedKnowledgeBaseId);
const latestAgentMessage = [...messages].reverse().find((message) => message.role === "agent" && Array.isArray(message.results));
const latestResults = Array.isArray(latestAgentMessage?.results) ? latestAgentMessage.results : [];
const taskContext = {
  knowledgeBaseName: selectedKnowledgeBase?.name || (selectedKnowledgeBaseId ? "当前知识库" : "未选择知识库"),
  taskStatus: isStreaming ? "running" : activeConversation?.status || (latestAgentMessage ? "done" : ""),
  resultCount: latestResults.length,
  conditionCount: 0,
  evidencePolicy: null
};
```

Replace the current `<main className=...>` block with:

```jsx
<WorkspaceShell
  historyOpen={historyOpen}
  evidenceOpen={evidenceOpen}
  onToggleHistory={toggleHistory}
  onToggleEvidence={toggleEvidence}
  conversations={conversations}
  activeConversationId={activeConversationId}
  onSelectConversation={selectConversation}
  onNewConversation={newConversation}
  onDeleteConversation={deleteConversation}
  onLogout={handleLogout}
  taskContext={taskContext}
  chat={
    <ChatView
      messages={messages}
      isStreaming={isStreaming}
      displayStreaming={isStreaming && streamingConversationId === activeConversationId}
      streamingPhases={streamingPhases}
      onSend={handleSend}
      onViewEvidence={viewEvidence}
      viewingItemId={evidenceItem?.id}
      inputValue={inputValue}
      setInputValue={setInputValue}
      knowledgeBases={knowledgeBases}
      selectedKnowledgeBaseId={selectedKnowledgeBaseId}
      onKnowledgeBaseChange={handleKnowledgeBaseChange}
      isKnowledgeBaseLoading={knowledgeBaseLoading}
      knowledgeBaseError={knowledgeBaseError}
    />
  }
  evidence={<EvidencePanel item={evidenceItem} onClose={() => setEvidenceOpen(false)} />}
/>
<Toast message={toast.message} visible={toast.visible} />
```

- [ ] **Step 6: Add context bar CSS**

Append near `.main-stage-header` in `src/styles.css`:

```css
.task-context-bar {
  min-width: 0;
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  color: var(--color-ash);
  font-size: var(--text-xs);
  line-height: 20px;
}
.task-context-bar span {
  min-width: 0;
  overflow: hidden;
  border: 1px solid var(--color-fog);
  border-radius: var(--radius-sm);
  background: var(--color-snow);
  padding: 4px 8px;
  text-overflow: ellipsis;
  white-space: nowrap;
}
```

Append inside the `@media (max-width: 560px)` block:

```css
  .task-context-bar {
    justify-content: flex-start;
    overflow-x: auto;
  }
```

- [ ] **Step 7: Run tests**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/App.jsx src/layout.test.js src/styles.css src/components/chat src/components/workspace src/components/evidence src/components/results src/components/ui src/icons.jsx src/taskContext.js
git commit -m "refactor: split contract workbench layout"
```

## Task 6: Final Regression And Build Verification

**Files:**
- Modify only files needed to fix regressions found by tests or build.

- [ ] **Step 1: Run full unit test suite**

Run:

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 2: Run production build**

Run:

```bash
npm run build
```

Expected: Vite build completes successfully and writes `dist/`.

- [ ] **Step 3: Review final diff**

Run:

```bash
git diff --stat HEAD
```

Expected: only P0 implementation files are changed. No parent-directory untracked files are staged.

- [ ] **Step 4: Commit any final fixes**

If Step 1 or Step 2 required fixes, commit them:

```bash
git add src package.json docs/superpowers/plans/2026-06-30-contract-agent-p0-ia.md
git commit -m "fix: stabilize contract p0 workbench split"
```

If no fixes were required, skip this commit.

## Self-Review

Spec coverage:

- Three-column workbench: Task 5 `WorkspaceShell`.
- Minimal empty prompt: Task 5 `EmptyPrompt`.
- Task context bar: Task 5 `TaskContextBar`.
- Structured result area: Task 3 `ResultSet` and result components.
- Grouped evidence panel: Task 4 evidence components and Task 1 grouping helper.
- No backend changes: all tasks use existing `api.js` and mapped contract shape.
- No low-value exports, feedback, todo, or forced confirmation: preserved through existing tests and new source assertions.

Placeholder scan:

- No implementation step uses unresolved placeholder markers or unspecified edge handling.
- Each code-changing step includes exact file paths and concrete code.

Type and naming consistency:

- `buildTaskContext`, `resultCountLabel`, `evidencePolicyLabel`, and `groupEvidenceBySource` are defined in Task 1 before usage.
- `ResultSet` receives `items`, `taskId`, `viewingItemId`, and `onViewEvidence`; these props match `ChatBubble`.
- `EvidencePanel` receives `item` and `onClose`; this matches the current app usage.
- `WorkspaceShell` receives pre-rendered `chat` and `evidence` nodes to avoid coupling shell layout to chat/evidence internals.
