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
