import test from "node:test";
import assert from "node:assert/strict";
import { contracts } from "./data.js";
import { buildAuditText, filterContracts, strategyToText } from "./logic.js";

test("filterContracts applies all filters and keeps highest-risk matches first", () => {
  const result = filterContracts(contracts, {
    risk: "高",
    status: "待补充",
    source: "供应商评级"
  });

  assert.deepEqual(result.map((item) => item.id), ["CT-2025-1207"]);
});

test("filterContracts falls back to score ordering within a risk tier", () => {
  const result = filterContracts(contracts, {
    risk: "全部",
    status: "全部",
    source: "全部"
  });

  assert.deepEqual(
    result.slice(0, 3).map((item) => item.id),
    ["CT-2026-0418", "CT-2025-1207", "CT-2026-0331"]
  );
});

test("buildAuditText includes task, filters, selected contract, and evidence lines", () => {
  const selected = contracts[0];
  const text = buildAuditText({
    query: "筛出高风险续签合同",
    filters: { risk: "高", status: "续签评估", source: "合同正文" },
    item: selected
  });

  assert.match(text, /任务: 筛出高风险续签合同/);
  assert.match(text, /筛选: 风险=高; 状态=续签评估; 证据=合同正文/);
  assert.match(text, new RegExp(`合同: ${selected.id} ${selected.title}`));
  assert.match(text, /- 合同正文 第 12\.3 条:/);
});

test("strategyToText serializes strategy labels for clipboard use", () => {
  assert.match(strategyToText([["字段过滤", "限定采购类合同。"]]), /^字段过滤: 限定采购类合同。$/);
});

test("strategyToText returns empty text for empty strategy", () => {
  assert.equal(strategyToText(null), "");
  assert.equal(strategyToText(undefined), "");
});

test("strategyToText serializes structured backend strategy", () => {
  const text = strategyToText({
    query: "筛选即将到期的高风险采购合同",
    conditions: [
      { id: "risk", label: "高风险", keywords: ["高风险", "续签"] },
      { id: "expiry", label: "90 天内到期", keywords: ["到期"] }
    ],
    filters: {
      risk: "全部",
      status: "全部",
      source: "全部"
    },
    evidence_policy: {
      group_by: "document",
      text_fields: ["content", "content_with_weight", "text"],
      max_evidence_per_contract: 5
    },
    limit_per_condition: 20
  });

  assert.match(text, /查询: 筛选即将到期的高风险采购合同/);
  assert.match(text, /条件: 高风险; 90 天内到期/);
  assert.match(text, /过滤: risk=全部; status=全部; source=全部/);
  assert.match(text, /证据策略: .*group_by=document/);
  assert.match(text, /证据策略: .*text_fields=content, content_with_weight, text/);
  assert.match(text, /证据策略: .*max_evidence_per_contract=5/);
  assert.doesNotMatch(text, /\[object Object\]/);
  assert.match(text, /每条件证据上限: 20/);
});
