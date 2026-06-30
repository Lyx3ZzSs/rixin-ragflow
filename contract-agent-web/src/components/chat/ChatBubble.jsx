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
