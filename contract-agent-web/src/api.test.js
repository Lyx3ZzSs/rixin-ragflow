import test from "node:test";
import assert from "node:assert/strict";
import {
  createScreeningTask,
  getScreeningResults,
  mapScreeningItemToContract,
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
