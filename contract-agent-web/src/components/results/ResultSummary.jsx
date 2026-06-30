import { resultCountLabel } from "../../taskContext.js";

export function ResultSummary({ count }) {
  return (
    <div className="result-summary">
      <strong>{resultCountLabel(count)}</strong>
      <span>按风险等级、到期紧迫度、匹配分综合排序</span>
    </div>
  );
}
