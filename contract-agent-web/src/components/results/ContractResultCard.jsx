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
