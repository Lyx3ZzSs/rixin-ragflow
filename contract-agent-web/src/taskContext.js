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
