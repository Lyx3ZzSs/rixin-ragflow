const CONTRACT_SCREENING_BASE = "/api/v1/contract-screening/tasks";
const KNOWLEDGE_BASE_LIST = "/api/v1/datasets";

export async function parseResponse(response) {
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok || payload.code !== 0) {
    throw new Error(payload.message || `HTTP ${response.status}`);
  }

  return payload.data;
}

export async function createScreeningTask({ kbId, prompt, filters }) {
  const response = await fetch(CONTRACT_SCREENING_BASE, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ kb_id: kbId, prompt, filters })
  });

  return parseResponse(response);
}

export async function getScreeningTask(taskId) {
  const response = await fetch(`${CONTRACT_SCREENING_BASE}/${taskId}`, {
    credentials: "include"
  });

  return parseResponse(response);
}

export async function getScreeningResults(taskId) {
  const response = await fetch(`${CONTRACT_SCREENING_BASE}/${taskId}/results`, {
    credentials: "include"
  });
  const data = await parseResponse(response);

  return {
    ...data,
    items: Array.isArray(data.items) ? data.items.map(mapScreeningItemToContract) : []
  };
}

export async function getKnowledgeBases() {
  const response = await fetch(`${KNOWLEDGE_BASE_LIST}?page=1&page_size=100`, {
    credentials: "include"
  });
  const data = await parseResponse(response);
  const items = Array.isArray(data?.kbs)
    ? data.kbs
    : Array.isArray(data?.datasets)
      ? data.datasets
      : Array.isArray(data)
        ? data
        : [];

  return items
    .map((item) => ({
      id: item?.id || item?.kb_id,
      name: item?.name || item?.nickname || item?.title || "未命名知识库",
      document_count: item?.document_count ?? item?.doc_num ?? item?.chunk_num ?? 0
    }))
    .filter((item) => item.id);
}

export async function listScreeningTasks({ page = 1, pageSize = 20, kbId = "" } = {}) {
  const params = new URLSearchParams({
    page: String(page),
    page_size: String(pageSize)
  });
  if (kbId) {
    params.set("kb_id", kbId);
  }
  const response = await fetch(`${CONTRACT_SCREENING_BASE}?${params.toString()}`, {
    credentials: "include"
  });
  const data = await parseResponse(response);
  const items = Array.isArray(data?.items) ? data.items : [];

  return {
    total: Number(data?.total || 0),
    items: items.map(mapScreeningTaskToConversation)
  };
}

export function mapScreeningTaskToConversation(item) {
  const taskId = item?.task_id || item?.id;
  const prompt = item?.prompt || "历史筛选任务";

  return {
    id: taskId,
    task_id: taskId,
    title: prompt,
    prompt,
    status: item?.status || "",
    item_count: item?.item_count || 0,
    time: String(item?.created_at || item?.updated_at || ""),
    messages: []
  };
}

export function mapScreeningItemToContract(item) {
  if (isFrontendContract(item)) {
    return item;
  }

  const meta = item?.meta || {};
  const evidence = normalizeEvidence(item?.evidence);
  const sourceTypes = normalizeSourceTypes(item?.sourceTypes, item?.evidence);

  return {
    id: item?.id || item?.contract_id,
    title: item?.title || item?.name || "未命名合同",
    supplier: item?.supplier ?? meta.supplier,
    owner: item?.owner ?? meta.owner,
    status: item?.status || (item?.overall_status === "matched" ? "命中" : "未命中"),
    risk: item?.risk ?? meta.risk,
    amount: item?.amount ?? meta.amount,
    expiry: item?.expiry ?? meta.expiry,
    score: normalizeScore(item?.score ?? meta.score ?? meta.confidence),
    permissions: item?.permissions ?? meta.permissions,
    sourceTypes,
    reason: item?.reason || conditionReason(item?.matched_conditions) || "命中当前筛选条件。",
    evidence,
    actions: Array.isArray(item?.actions) ? item.actions : [],
    timeline: Array.isArray(item?.timeline) ? item.timeline : []
  };
}

function isFrontendContract(item) {
  return Boolean(
    item &&
      item.id &&
      item.title &&
      !item.contract_id &&
      !item.name &&
      !item.meta &&
      !item.overall_status &&
      !item.matched_conditions
  );
}

function normalizeScore(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function normalizeEvidence(evidence) {
  if (!Array.isArray(evidence)) {
    return [];
  }

  return evidence.map((item) => ({
    source: item?.source || "合同正文",
    ref: item?.ref || evidenceRef(item),
    text: item?.text || "",
    page: item?.page,
    chunk_id: item?.chunk_id
  }));
}

function evidenceRef(item) {
  const parts = [];

  if (item?.page !== undefined && item.page !== null && item.page !== "") {
    parts.push(`第 ${item.page} 页`);
  }
  if (item?.chunk_id) {
    parts.push(item.chunk_id);
  }

  return parts.join(" / ");
}

function normalizeSourceTypes(sourceTypes, evidence) {
  if (Array.isArray(sourceTypes) && sourceTypes.length > 0) {
    return sourceTypes;
  }

  const sources = Array.isArray(evidence) ? evidence.map((item) => item?.source).filter(Boolean) : [];
  const uniqueSources = [...new Set(sources)];
  return uniqueSources.length > 0 ? uniqueSources : ["合同正文"];
}

function conditionReason(conditions) {
  if (!Array.isArray(conditions) || conditions.length === 0) {
    return "";
  }

  const first = conditions[0];
  if (!first?.label) {
    return "";
  }

  return first.status ? `${first.label}: ${first.status}` : first.label;
}
