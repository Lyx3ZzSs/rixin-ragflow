import test from "node:test";
import assert from "node:assert/strict";
import {
  buildTaskContext,
  evidencePolicyLabel,
  groupEvidenceBySource,
  resultCountLabel
} from "./taskContext.js";

test("resultCountLabel summarizes result counts", () => {
  assert.equal(resultCountLabel(0), "未命中合同");
  assert.equal(resultCountLabel(1), "命中 1 份合同");
  assert.equal(resultCountLabel(12), "命中 12 份合同");
});

test("evidencePolicyLabel summarizes max evidence policy", () => {
  assert.equal(evidencePolicyLabel({ max_evidence_per_contract: 5 }), "最多 5 条证据/合同");
  assert.equal(evidencePolicyLabel({ max_evidence_per_contract: "3" }), "最多 3 条证据/合同");
  assert.equal(evidencePolicyLabel(null), "按默认证据策略");
  assert.equal(evidencePolicyLabel({}), "按默认证据策略");
});

test("buildTaskContext handles idle and completed task states", () => {
  assert.deepEqual(
    buildTaskContext({
      knowledgeBaseName: "合同知识库",
      taskStatus: "",
      resultCount: 0,
      conditionCount: 0,
      evidencePolicy: null
    }),
    {
      knowledgeBaseName: "合同知识库",
      taskStatusLabel: "准备筛选",
      resultCountLabel: "未命中合同",
      conditionCountLabel: "未解析条件",
      evidencePolicyLabel: "按默认证据策略"
    }
  );

  assert.deepEqual(
    buildTaskContext({
      knowledgeBaseName: "采购合同",
      taskStatus: "done",
      resultCount: 7,
      conditionCount: 2,
      evidencePolicy: { max_evidence_per_contract: 5 }
    }),
    {
      knowledgeBaseName: "采购合同",
      taskStatusLabel: "筛选完成",
      resultCountLabel: "命中 7 份合同",
      conditionCountLabel: "2 个条件",
      evidencePolicyLabel: "最多 5 条证据/合同"
    }
  );
});

test("groupEvidenceBySource groups evidence and preserves order", () => {
  const groups = groupEvidenceBySource([
    { source: "合同正文", ref: "第 1 页", text: "正文证据" },
    { source: "审批单", ref: "FA-1", text: "审批证据" },
    { source: "合同正文", ref: "第 2 页", text: "正文证据 2" },
    { ref: "未知", text: "未知来源证据" }
  ]);

  assert.deepEqual(groups, [
    {
      source: "合同正文",
      items: [
        { source: "合同正文", ref: "第 1 页", text: "正文证据" },
        { source: "合同正文", ref: "第 2 页", text: "正文证据 2" }
      ]
    },
    {
      source: "审批单",
      items: [{ source: "审批单", ref: "FA-1", text: "审批证据" }]
    },
    {
      source: "未标注来源",
      items: [{ ref: "未知", text: "未知来源证据" }]
    }
  ]);
});

test("groupEvidenceBySource returns an empty list for non-arrays", () => {
  assert.deepEqual(groupEvidenceBySource(null), []);
  assert.deepEqual(groupEvidenceBySource({}), []);
});
