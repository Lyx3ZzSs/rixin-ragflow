# Contract Agent P0 Information Architecture Design

Date: 2026-06-30
Status: Approved for implementation planning

## Goal

Upgrade the contract screening prototype from a chat-centered demo into a compact contract screening workbench. P0 keeps the current three-column product model, improves scan efficiency, and makes evidence review clearer without expanding backend scope.

The change must preserve these current constraints:

- Keep the minimal empty prompt state: "要筛选哪些合同？"
- Keep the desktop workspace as a fixed left sidebar plus central workbench.
- Keep the evidence panel as a right-side drawer.
- Keep original file download on result items.
- Do not reintroduce low-value result exports, feedback buttons, fake todo actions, or mandatory condition confirmation.

## Target Users

The primary users are contract managers, procurement staff, legal reviewers, and operations owners who need to screen many contracts, understand why each contract was returned, and decide whether the result is worth opening or downloading.

Their main question sequence is:

1. Which knowledge base and screening task am I looking at?
2. How many contracts matched?
3. Which results are highest risk or highest priority?
4. Why did this contract match?
5. Which evidence source supports the match?

## Recommended Approach

Use the existing three-column workbench and improve each column:

- Left column becomes a task navigation sidebar.
- Middle column becomes a screening workbench with structured result sets inside the conversation stream.
- Right column becomes a grouped evidence detail panel.

This approach avoids a full redesign, keeps the existing mental model, and gives the biggest P0 benefit with low implementation risk.

## Page Information Architecture

```text
Contract Screening Workspace
├─ Task Sidebar
│  ├─ Product identity
│  ├─ New screening task
│  ├─ Search history
│  ├─ Contract library entry
│  └─ Screening task history
│     ├─ Task title
│     ├─ Created or updated time
│     ├─ Task status
│     └─ Matched contract count
│
├─ Main Workbench
│  ├─ Task Context Bar
│  │  ├─ Current knowledge base
│  │  ├─ Current task status
│  │  ├─ Matched contract count
│  │  ├─ Parsed condition count
│  │  └─ Evidence policy summary
│  │
│  ├─ Conversation Stream
│  │  ├─ User screening prompt
│  │  ├─ Agent parsing and retrieval progress
│  │  ├─ Retrieval strategy summary
│  │  └─ Result Set
│  │     ├─ Result summary
│  │     ├─ Sort explanation
│  │     └─ Contract result list
│  │        ├─ Title and contract id
│  │        ├─ Risk, status, and owner
│  │        ├─ Supplier, amount, and expiry
│  │        ├─ Score and evidence count
│  │        ├─ Match explanation
│  │        └─ View evidence and download original file
│  │
│  └─ Prompt Composer
│     ├─ Knowledge base selector
│     ├─ Natural-language input
│     ├─ Send action
│     └─ Prompt examples
│
└─ Evidence Panel
   ├─ Evidence header
   │  ├─ Contract title
   │  ├─ Contract id
   │  └─ Collapse action
   │
   ├─ Contract overview
   │  ├─ Supplier
   │  ├─ Amount
   │  ├─ Expiry
   │  ├─ Permission scope
   │  └─ Match score
   │
   ├─ Match explanation
   ├─ Evidence groups
   │  ├─ Contract text
   │  ├─ Approval record
   │  ├─ Performance record
   │  └─ Supplier rating
   │
   └─ Key timeline
      ├─ Expiry
      ├─ Renewal window
      └─ Approval, attachment, or performance status
```

## Visual Direction

The interface should feel like a professional audit and review tool, not a marketing surface. The current restrained monochrome direction can remain, but information hierarchy should be sharper:

- Use dense but readable rows for result scanning.
- Use status badges only for meaningful contract state: risk, lifecycle status, task status.
- Use subtle dividers and section headers in the evidence panel.
- Avoid decorative cards, oversized hero content, and explanatory feature copy.
- Keep button count low and reserve actions for real workflow value.

## Component Split

```text
src/
├─ App.jsx
├─ components/
│  ├─ workspace/
│  │  ├─ WorkspaceShell.jsx
│  │  ├─ TaskSidebar.jsx
│  │  ├─ TaskHistoryItem.jsx
│  │  └─ TaskContextBar.jsx
│  │
│  ├─ chat/
│  │  ├─ ChatView.jsx
│  │  ├─ EmptyPrompt.jsx
│  │  ├─ ChatBubble.jsx
│  │  ├─ ScreeningProgress.jsx
│  │  └─ PromptComposer.jsx
│  │
│  ├─ results/
│  │  ├─ ResultSet.jsx
│  │  ├─ ResultSummary.jsx
│  │  ├─ ContractResultCard.jsx
│  │  ├─ ResultMetaRow.jsx
│  │  └─ EvidenceActionRow.jsx
│  │
│  ├─ evidence/
│  │  ├─ EvidencePanel.jsx
│  │  ├─ EvidenceEmptyState.jsx
│  │  ├─ ContractOverview.jsx
│  │  ├─ EvidenceGroupList.jsx
│  │  ├─ EvidenceSourceItem.jsx
│  │  └─ ContractTimeline.jsx
│  │
│  └─ ui/
│     ├─ IconButton.jsx
│     ├─ StatusBadge.jsx
│     ├─ KeyValue.jsx
│     └─ Toast.jsx
│
├─ hooks/
│  ├─ useKnowledgeBases.js
│  ├─ useScreeningTasks.js
│  └─ usePollingTask.js
│
├─ logic.js
├─ api.js
├─ conditions.js
└─ styles.css
```

## Component Responsibilities

### App.jsx

Owns orchestration state only:

- Current task or conversation id.
- Knowledge base selection.
- Screening task lifecycle.
- Selected evidence item.
- Sidebar and evidence drawer visibility.
- Toast state.

It should stop directly rendering result cards, evidence sections, and prompt composer internals.

### WorkspaceShell

Owns the three-column layout:

- Left sidebar track.
- Central main track.
- Right evidence drawer.
- Responsive overlay behavior below the existing mobile breakpoint.

It should not know contract result details.

### TaskSidebar

Replaces the current conversation history panel as the left navigation surface:

- Product identity.
- New screening action.
- Search history and contract library entries.
- Task history list.
- Logout action.

The task history item should show task title, time, status, and matched count when available.

### TaskContextBar

New P0 component at the top of the main workbench. It summarizes current task context:

- Knowledge base name.
- Task status.
- Matched count.
- Parsed condition count when available.
- Evidence policy summary, such as "最多 5 条证据/合同".

When no task has run, it should show only knowledge base and readiness state.

### ChatView

Owns the conversation stream layout and delegates:

- Empty state to `EmptyPrompt`.
- Message rendering to `ChatBubble`.
- Progress rendering to `ScreeningProgress`.
- Result rendering to `ResultSet`.
- Input rendering to `PromptComposer`.

### ResultSet

Owns the structured result area for an agent message:

- Result count.
- Optional sorting or strategy summary.
- Contract result list.
- Empty result state.

This component is the boundary for future table, grouped list, or compact density changes.

### ContractResultCard

Renders a single contract result:

- Title and id.
- Supplier, amount, expiry.
- Risk, status, owner.
- Match score.
- Evidence count.
- Match explanation.
- View evidence state.
- Original file download when `downloadUrl` exists.

The whole card remains keyboard accessible and opens evidence details. The download action must stop propagation.

### EvidencePanel

Owns right-side evidence review:

- Empty state when no result is selected.
- Header.
- Contract overview.
- Match explanation.
- Evidence groups.
- Key timeline.

It should not expose feedback, todo, or copy-evidence actions in P0.

### EvidenceGroupList

Groups evidence items by source label:

- Contract text.
- Approval record.
- Performance record.
- Supplier rating.
- Other source labels returned by backend.

If source data is missing, use a stable fallback group named "未标注来源".

## Data Flow

1. User selects a knowledge base in `PromptComposer`.
2. User submits a prompt.
3. `App.jsx` appends the user message.
4. `parseScreeningPrompt` returns parsed conditions and evidence policy.
5. `createScreeningTask` starts the task.
6. `usePollingTask` or the existing polling logic tracks task status and phases.
7. `getScreeningResults` maps backend items into frontend contract objects.
8. `ResultSet` renders mapped contracts.
9. Selecting a result sets `evidenceItem`.
10. `EvidencePanel` groups and renders evidence for that result.

P0 can keep the existing API adapter and mapping shape. It should not require backend changes.

## Error And Empty States

- No knowledge base: composer is disabled and the context bar says a knowledge base is required.
- Knowledge base load failed: show a concise error in the selector area and keep the input disabled.
- No messages: show only the minimal empty prompt surface and composer.
- Task running: show current phase in the conversation stream and status in the context bar.
- Task failed: append an agent error message and set context status to failed.
- No results: show "筛选完成，没有命中合同" with no result cards.
- No evidence: show a grouped evidence empty state that says backend returned no evidence snippets.

## Testing And Verification

P0 implementation should preserve and extend tests around:

- Workspace fixed viewport layout.
- Mobile overlay breakpoint.
- Minimal empty prompt state.
- Result cards keeping original file download.
- No low-value exports or feedback actions in result cards or evidence panel.
- Direct screening after parsed conditions.

New tests should cover:

- `TaskContextBar` renders knowledge base, task status, result count, and condition count.
- `ResultSet` renders empty, loading, and populated states.
- `EvidenceGroupList` groups evidence by source and falls back for missing source.
- Contract result download click stops propagation.

## P0 Non-Goals

P0 explicitly excludes:

- PDF or Word original document preview.
- Complex spreadsheet-style result table.
- Audit package export UI.
- Result feedback UI.
- Todo or workflow assignment.
- Mandatory condition review before screening.
- New backend endpoints.

## Acceptance Criteria

P0 is complete when:

1. Desktop still presents a stable three-column workbench.
2. The empty state remains minimal and prompt-first.
3. After a screening task completes, users can identify result count, risk, amount, expiry, score, and evidence count without opening the evidence panel.
4. Selecting a contract opens a right panel that clearly answers why the contract matched and which evidence sources support it.
5. The UI does not add export, feedback, fake todo, or forced condition confirmation flows.
6. Existing tests pass and new component tests cover the P0 boundaries.
