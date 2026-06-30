import { TrashIcon } from "../../icons.jsx";

export function TaskHistoryItem({ conversation, isActive, onSelect, onDelete }) {
  return (
    <button
      className={`history-item${isActive ? " is-active" : ""}`}
      type="button"
      role="option"
      aria-selected={isActive}
      onClick={() => onSelect(conversation.id)}
    >
      {conversation.title}
      <span className="history-time">{conversation.time}</span>
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
