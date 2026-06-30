import { EyeIcon, HistoryIcon } from "../../icons.jsx";
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
          <button
            className="sidebar-toggle"
            type="button"
            aria-label={historyOpen ? "收起历史面板" : "展开历史面板"}
            aria-pressed={historyOpen}
            onClick={onToggleHistory}
            title="对话历史"
          >
            <HistoryIcon />
          </button>
          <TaskContextBar taskContext={taskContext} />
          <div className="main-header-actions">
            <button
              className="sidebar-toggle"
              type="button"
              aria-label={evidenceOpen ? "收起证据面板" : "展开证据面板"}
              aria-pressed={evidenceOpen}
              onClick={onToggleEvidence}
              title="证据详情"
            >
              <EyeIcon />
            </button>
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
