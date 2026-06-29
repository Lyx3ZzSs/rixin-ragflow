import test from "node:test";
import assert from "node:assert/strict";
import {
  createScreeningTask,
  createScreeningExport,
  getKnowledgeBases,
  getScreeningExport,
  getScreeningResults,
  mapScreeningItemToContract,
  listScreeningTasks,
  parseScreeningPrompt,
  parseResponse
} from "./api.js";

test("mapScreeningItemToContract preserves existing frontend contract shape", () => {
  const item = {
    id: "CT-001",
    title: "既有合同",
    supplier: "华东供应商",
    owner: "采购部",
    status: "续签评估",
    risk: "高",
    amount: "120 万",
    expiry: "2026-12-31",
    score: 92,
    permissions: "仅法务",
    sourceTypes: ["合同正文", "供应商评级"],
    reason: "原有解释",
    evidence: [{ source: "合同正文", ref: "第 1 条", text: "证据文本", page: 1, chunk_id: "c1" }],
    actions: ["补充尽调"],
    timeline: ["2026-01-01 创建"]
  };

  assert.deepEqual(mapScreeningItemToContract(item), item);
});

test("mapScreeningItemToContract maps contract-first backend shape into frontend shape", () => {
  const result = mapScreeningItemToContract({
    contract_id: "CON-2026-7",
    name: "年度采购框架协议",
    meta: {
      supplier: "北方材料",
      owner: "供应链中心",
      risk: "中",
      amount: "80 万",
      expiry: "2026-09-30",
      permissions: "采购可见",
      confidence: "0.87"
    },
    overall_status: "matched",
    matched_conditions: [{ label: "即将到期", status: "matched" }],
    evidence: [
      { source: "合同正文", text: "合同将于九月到期。", page: 8, chunk_id: "chunk-8" },
      { source: "审批记录", ref: "审批 #2", text: "存在续签审批。", page: 2, chunk_id: "chunk-2" },
      { text: "缺省来源证据。" }
    ]
  });

  assert.deepEqual(result, {
    id: "CON-2026-7",
    title: "年度采购框架协议",
    supplier: "北方材料",
    owner: "供应链中心",
    status: "命中",
    risk: "中",
    amount: "80 万",
    expiry: "2026-09-30",
    score: 0.87,
    permissions: "采购可见",
    sourceTypes: ["合同正文", "审批记录"],
    reason: "即将到期: matched",
    evidence: [
      { source: "合同正文", ref: "第 8 页 / chunk-8", text: "合同将于九月到期。", page: 8, chunk_id: "chunk-8" },
      { source: "审批记录", ref: "审批 #2", text: "存在续签审批。", page: 2, chunk_id: "chunk-2" },
      { source: "合同正文", ref: "", text: "缺省来源证据。", page: undefined, chunk_id: undefined }
    ],
    actions: [],
    timeline: []
  });
});

test("getScreeningResults fetches task results and maps items", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "/api/v1/contract-screening/tasks/task-1/results");
    assert.deepEqual(options, { credentials: "include" });

    return {
      ok: true,
      status: 200,
      async json() {
        return {
          code: 0,
          data: {
            total: 1,
            items: [{ contract_id: "CON-1", name: "合同一", meta: { score: 75 }, overall_status: "unmatched" }]
          }
        };
      }
    };
  };

  try {
    const data = await getScreeningResults("task-1");

    assert.equal(data.total, 1);
    assert.deepEqual(data.items, [
      {
        id: "CON-1",
        title: "合同一",
        supplier: undefined,
        owner: undefined,
        status: "未命中",
        risk: undefined,
        amount: undefined,
        expiry: undefined,
        score: 75,
        permissions: undefined,
        sourceTypes: ["合同正文"],
        reason: "命中当前筛选条件。",
        evidence: [],
        actions: [],
        timeline: []
      }
    ]);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("parseResponse throws payload message when API code is non-zero", async () => {
  await assert.rejects(
    parseResponse({
      ok: true,
      status: 200,
      async json() {
        return { code: 400, message: "筛选任务创建失败" };
      }
    }),
    /筛选任务创建失败/
  );
});

test("parseResponse falls back to HTTP status when error response body is invalid JSON", async () => {
  await assert.rejects(
    parseResponse({
      ok: false,
      status: 503,
      async json() {
        throw new SyntaxError("Unexpected end of JSON input");
      }
    }),
    /HTTP 503/
  );
});

test("createScreeningTask posts JSON body and propagates HTTP errors", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "/api/v1/contract-screening/tasks");
    assert.equal(options.method, "POST");
    assert.deepEqual(options.headers, { "Content-Type": "application/json" });
    assert.equal(options.credentials, "include");
    assert.deepEqual(JSON.parse(options.body), {
      kb_id: "kb-1",
      prompt: "筛选高风险合同",
      filters: { risk: "高" }
    });

    return {
      ok: false,
      status: 503,
      async json() {
        return {};
      }
    };
  };

  try {
    await assert.rejects(
      createScreeningTask({ kbId: "kb-1", prompt: "筛选高风险合同", filters: { risk: "高" } }),
      /HTTP 503/
    );
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("createScreeningTask includes edited conditions and evidence policy", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "/api/v1/contract-screening/tasks");
    assert.deepEqual(JSON.parse(options.body), {
      kb_id: "kb-1",
      prompt: "筛选高风险合同",
      filters: { risk: "高" },
      conditions: [{ id: "risk", label: "风险", keywords: ["风险"], operator: "exists", value: "", enabled: true }],
      evidence_policy: { group_by: "document", max_evidence_per_contract: 3 }
    });

    return {
      ok: true,
      status: 200,
      async json() {
        return { code: 0, data: { task_id: "task-1" } };
      }
    };
  };

  try {
    const result = await createScreeningTask({
      kbId: "kb-1",
      prompt: "筛选高风险合同",
      filters: { risk: "高" },
      conditions: [{ id: "risk", label: "风险", keywords: ["风险"], operator: "exists", value: "", enabled: true }],
      evidencePolicy: { group_by: "document", max_evidence_per_contract: 3 }
    });

    assert.deepEqual(result, { task_id: "task-1" });
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("parseScreeningPrompt posts prompt for editable condition parsing", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "/api/v1/contract-screening/parse");
    assert.equal(options.method, "POST");
    assert.equal(options.credentials, "include");
    assert.deepEqual(JSON.parse(options.body), {
      kb_id: "kb-1",
      prompt: "筛选付款合同",
      filters: { risk: "全部" }
    });

    return {
      ok: true,
      status: 200,
      async json() {
        return {
          code: 0,
          data: {
            query: "筛选付款合同",
            conditions: [{ id: "payment_terms", label: "付款", keywords: ["付款"], operator: "exists", value: "", enabled: true }],
            evidence_policy: { group_by: "document", max_evidence_per_contract: 5 }
          }
        };
      }
    };
  };

  try {
    const result = await parseScreeningPrompt({
      kbId: "kb-1",
      prompt: "筛选付款合同",
      filters: { risk: "全部" }
    });

    assert.equal(result.query, "筛选付款合同");
    assert.equal(result.conditions[0].id, "payment_terms");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("createScreeningExport posts desired export format", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "/api/v1/contract-screening/tasks/task-1/exports");
    assert.equal(options.method, "POST");
    assert.deepEqual(JSON.parse(options.body), { format: "excel" });

    return {
      ok: true,
      status: 200,
      async json() {
        return { code: 0, data: { export_id: "export-1", status: "done" } };
      }
    };
  };

  try {
    assert.deepEqual(await createScreeningExport({ taskId: "task-1", format: "excel" }), {
      export_id: "export-1",
      status: "done"
    });
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("getScreeningExport fetches export metadata", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "/api/v1/contract-screening/exports/export-1");
    assert.deepEqual(options, { credentials: "include" });

    return {
      ok: true,
      status: 200,
      async json() {
        return { code: 0, data: { export_id: "export-1", file_name: "result.xlsx" } };
      }
    };
  };

  try {
    assert.deepEqual(await getScreeningExport("export-1"), {
      export_id: "export-1",
      file_name: "result.xlsx"
    });
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("getKnowledgeBases maps dataset list responses for the selector", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "/api/v1/datasets?page=1&page_size=100");
    assert.deepEqual(options, { credentials: "include" });

    return {
      ok: true,
      status: 200,
      async json() {
        return {
          code: 0,
          data: {
            kbs: [
              { id: "kb-1", name: "合同知识库", document_count: 12 },
              { kb_id: "kb-2", nickname: "历史合同", doc_num: 4 }
            ]
          }
        };
      }
    };
  };

  try {
    assert.deepEqual(await getKnowledgeBases(), [
      { id: "kb-1", name: "合同知识库", document_count: 12 },
      { id: "kb-2", name: "历史合同", document_count: 4 }
    ]);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("listScreeningTasks fetches paged task history", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.equal(url, "/api/v1/contract-screening/tasks?page=2&page_size=10&kb_id=kb-1");
    assert.deepEqual(options, { credentials: "include" });

    return {
      ok: true,
      status: 200,
      async json() {
        return {
          code: 0,
          data: {
            total: 1,
            items: [
              {
                task_id: "task-1",
                prompt: "筛选高风险合同",
                status: "done",
                item_count: 3,
                created_at: 1782720000
              }
            ]
          }
        };
      }
    };
  };

  try {
    const data = await listScreeningTasks({ page: 2, pageSize: 10, kbId: "kb-1" });

    assert.equal(data.total, 1);
    assert.deepEqual(data.items, [
      {
        id: "task-1",
        task_id: "task-1",
        title: "筛选高风险合同",
        prompt: "筛选高风险合同",
        status: "done",
        item_count: 3,
        time: "1782720000",
        messages: []
      }
    ]);
  } finally {
    globalThis.fetch = previousFetch;
  }
});
