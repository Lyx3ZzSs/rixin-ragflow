export function riskRank(value) {
  return value === "高" ? 3 : value === "中" ? 2 : 1;
}

export function statusClass(risk) {
  if (risk === "高") return "status-danger";
  if (risk === "中") return "status-warn";
  return "status-ok";
}

export function filterContracts(contracts, filters) {
  return contracts
    .filter((item) => filters.risk === "全部" || item.risk === filters.risk)
    .filter((item) => filters.status === "全部" || item.status === filters.status)
    .filter((item) => filters.source === "全部" || item.sourceTypes.includes(filters.source))
    .sort((a, b) => riskRank(b.risk) - riskRank(a.risk) || b.score - a.score);
}

export function buildAuditText({ query, filters, item }) {
  return [
    "合同智能筛选审计包",
    `任务: ${query.trim()}`,
    `筛选: 风险=${filters.risk}; 状态=${filters.status}; 证据=${filters.source}`,
    `合同: ${item.id} ${item.title}`,
    `命中解释: ${item.reason}`,
    "证据:",
    ...item.evidence.map((ev) => `- ${ev.source} ${ev.ref}: ${ev.text}`)
  ].join("\n");
}

export function strategyToText(strategy) {
  return strategy.map(([label, text]) => `${label}: ${text}`).join("\n");
}
