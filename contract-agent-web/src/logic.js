export function riskRank(value) {
  return value === "高" ? 3 : value === "中" ? 2 : 1;
}

export function statusClass(risk) {
  if (risk === "高") return "status-danger";
  if (risk === "中") return "status-warn";
  return "status-ok";
}

export function buildConversationTitle(prompt) {
  const title = String(prompt || "").trim();
  if (!title) {
    return "新的筛选任务";
  }

  return title.length > 18 ? `${title.slice(0, 18)}...` : title;
}

export function taskPhaseToLabel(phase) {
  const labels = {
    parse_prompt: "解析筛选意图",
    retrieve_candidates: "检索候选合同证据",
    review_evidence: "复核合同证据",
    rank_contracts: "排序合同结果",
    generate_summary: "生成筛选结果"
  };

  return labels[phase] || "正在处理";
}

export function normalizeTimelineItems(timeline) {
  if (!Array.isArray(timeline)) {
    return [];
  }

  return timeline.map((item) => {
    if (Array.isArray(item) && item.length >= 2) {
      return [item[0], item[1]];
    }

    return ["节点", String(item)];
  });
}

export function resolvePollingConfig(env = {}) {
  return {
    maxAttempts: positiveInteger(env.VITE_CONTRACT_AGENT_POLL_MAX_ATTEMPTS, 600),
    intervalMs: positiveInteger(env.VITE_CONTRACT_AGENT_POLL_INTERVAL_MS, 2000)
  };
}

export function filterContracts(contracts, filters) {
  return contracts
    .filter((item) => filters.risk === "全部" || item.risk === filters.risk)
    .filter((item) => filters.status === "全部" || item.status === filters.status)
    .filter((item) => filters.source === "全部" || item.sourceTypes.includes(filters.source))
    .sort((a, b) => riskRank(b.risk) - riskRank(a.risk) || b.score - a.score);
}

export function buildAuditText({ query, filters, item }) {
  const evidenceItems = Array.isArray(item.evidence) ? item.evidence : [];

  return [
    "合同智能筛选审计包",
    `任务: ${query.trim()}`,
    `筛选: 风险=${filters.risk}; 状态=${filters.status}; 证据=${filters.source}`,
    `合同: ${item.id} ${item.title}`,
    `命中解释: ${item.reason}`,
    "证据:",
    ...evidenceItems.map((ev) => `- ${ev.source} ${ev.ref}: ${ev.text}`)
  ].join("\n");
}

export function strategyToText(strategy) {
  if (!strategy) {
    return "";
  }

  if (Array.isArray(strategy)) {
    return strategy
      .map((item) => {
        if (Array.isArray(item)) {
          const [label, text] = item;
          return `${label}: ${text}`;
        }
        return String(item);
      })
      .join("\n");
  }

  const targetEntities = normalizeTargetEntities(strategy.intent);
  const contractTypes = normalizeContractTypes(strategy.intent);
  const conditionLabels = Array.isArray(strategy.conditions)
    ? strategy.conditions.map(conditionToText).filter(Boolean)
    : [];
  const maxEvidence = strategy.evidence_policy?.max_evidence_per_contract;
  const lines = [];
  if (targetEntities.length > 0) {
    lines.push(`识别目标: ${targetEntities.join("、")}`);
  } else if (strategy.query) {
    lines.push(`识别目标: ${strategy.query}`);
  }
  if (contractTypes.length > 0) {
    lines.push(`合同类型: ${contractTypes.join("、")}`);
  }
  lines.push("检索范围: 合同标题、合同正文、审批记录、履约记录");
  if (conditionLabels.length > 0) {
    lines.push(`匹配规则: 优先匹配${conditionLabels.join("、")}`);
  } else {
    lines.push("匹配规则: 优先匹配用户描述中的合同主体、项目名称和关键条款");
  }
  if (maxEvidence !== undefined && maxEvidence !== null) {
    lines.push(`证据规则: 每份合同最多展示 ${valueToText(maxEvidence)} 条引用证据`);
  }
  return lines.join("\n");
}

function normalizeTargetEntities(intent) {
  const entities = Array.isArray(intent?.target_entities) ? intent.target_entities : [];
  return entities
    .map((entity) => {
      if (typeof entity === "string") return entity.trim();
      return String(entity?.name || "").trim();
    })
    .filter(Boolean);
}

function normalizeContractTypes(intent) {
  const contractTypes = Array.isArray(intent?.contract_types) ? intent.contract_types : [];
  return contractTypes.map((item) => String(item || "").trim()).filter(Boolean);
}

function conditionToText(condition) {
  if (typeof condition === "string") {
    return condition;
  }
  if (!condition?.label) {
    return "";
  }

  return condition.status ? `${condition.label} (${condition.status})` : condition.label;
}

function objectToText(value) {
  return Object.entries(value)
    .map(([key, item]) => `${key}=${valueToText(item)}`)
    .join("; ");
}

function valueToText(value) {
  if (Array.isArray(value)) {
    return value.map(valueToText).join(", ");
  }
  if (value && typeof value === "object") {
    return objectToText(value);
  }

  return String(value);
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
