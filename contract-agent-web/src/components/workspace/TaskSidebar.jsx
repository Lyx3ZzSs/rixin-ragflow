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
          <h3 style={{ fontSize: "var(--text-base)", fontFamily: "var(--font-body)", fontWeight: 500, letterSpacing: "normal", marginTop: "4px" }}>
            筛选任务
          </h3>
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
              isActive={conversation.id === activeId}
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
