import { buildTaskContext } from "../../taskContext.js";

export function TaskContextBar({ taskContext }) {
  const context = buildTaskContext(taskContext);

  return (
    <div className="task-context-bar" aria-label="当前筛选任务上下文">
      <span title={context.knowledgeBaseName}>{context.knowledgeBaseName}</span>
      <span>{context.taskStatusLabel}</span>
      <span>{context.resultCountLabel}</span>
      <span>{context.conditionCountLabel}</span>
      <span>{context.evidencePolicyLabel}</span>
    </div>
  );
}
