const DEFAULT_EVIDENCE_POLICY = {
  group_by: "document",
  max_evidence_per_contract: 5
};

export function normalizeParsedConditions(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      id: String(item.id || "contract_terms"),
      label: String(item.label || "合同筛选条件"),
      keywords: normalizeKeywords(item.keywords),
      operator: String(item.operator || "exists"),
      value: String(item.value || ""),
      enabled: Boolean(item.enabled ?? true)
    }));
}

export function normalizeEvidencePolicy(value) {
  const incoming = value && typeof value === "object" ? value : {};
  const rawMax = Number(incoming.max_evidence_per_contract ?? DEFAULT_EVIDENCE_POLICY.max_evidence_per_contract);
  const maxEvidence = Number.isFinite(rawMax) ? Math.max(1, Math.min(20, Math.round(rawMax))) : DEFAULT_EVIDENCE_POLICY.max_evidence_per_contract;

  return {
    group_by: String(incoming.group_by || DEFAULT_EVIDENCE_POLICY.group_by),
    max_evidence_per_contract: maxEvidence
  };
}

export function conditionToEditor(condition) {
  return {
    ...condition,
    keywordsText: normalizeKeywords(condition.keywords).join(", ")
  };
}

export function buildConditionTaskPayload({ conditions, evidencePolicy }) {
  return {
    conditions: normalizeEditorConditions(conditions),
    evidence_policy: normalizeEvidencePolicy(evidencePolicy)
  };
}

function normalizeEditorConditions(conditions) {
  if (!Array.isArray(conditions)) {
    return [];
  }

  return conditions
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      id: String(item.id || "contract_terms"),
      label: String(item.label || "合同筛选条件"),
      keywords: normalizeKeywordsText(item.keywordsText ?? item.keywords),
      operator: String(item.operator || "exists"),
      value: String(item.value || ""),
      enabled: Boolean(item.enabled ?? true)
    }));
}

function normalizeKeywords(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((keyword) => String(keyword).trim()).filter(Boolean);
}

function normalizeKeywordsText(value) {
  if (Array.isArray(value)) {
    return normalizeKeywords(value);
  }
  return String(value || "")
    .split(/[,，]/)
    .map((keyword) => keyword.trim())
    .filter(Boolean);
}
