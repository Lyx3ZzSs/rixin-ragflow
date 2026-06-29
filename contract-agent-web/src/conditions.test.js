import test from "node:test";
import assert from "node:assert/strict";
import {
  buildConditionTaskPayload,
  normalizeEvidencePolicy,
  normalizeParsedConditions
} from "./conditions.js";

test("normalizeParsedConditions returns an empty list for missing conditions", () => {
  assert.deepEqual(normalizeParsedConditions(undefined), []);
  assert.deepEqual(normalizeParsedConditions({}), []);
});

test("normalizeParsedConditions preserves disabled conditions and editable fields", () => {
  const conditions = normalizeParsedConditions([
    {
      id: "payment_terms",
      label: "付款周期超过60天",
      keywords: ["付款", "60天"],
      operator: "gt",
      value: "60天",
      enabled: false
    }
  ]);

  assert.deepEqual(conditions, [
    {
      id: "payment_terms",
      label: "付款周期超过60天",
      keywords: ["付款", "60天"],
      operator: "gt",
      value: "60天",
      enabled: false
    }
  ]);
});

test("normalizeEvidencePolicy clamps max evidence per contract", () => {
  assert.deepEqual(normalizeEvidencePolicy({ group_by: "document", max_evidence_per_contract: 0 }), {
    group_by: "document",
    max_evidence_per_contract: 1
  });
  assert.deepEqual(normalizeEvidencePolicy({ group_by: "document", max_evidence_per_contract: 99 }), {
    group_by: "document",
    max_evidence_per_contract: 20
  });
});

test("buildConditionTaskPayload preserves edited keywords and values", () => {
  const payload = buildConditionTaskPayload({
    conditions: [
      {
        id: "payment_terms",
        label: "付款账期",
        keywordsText: "付款, 账期, 90天",
        operator: "gt",
        value: "60天",
        enabled: true
      }
    ],
    evidencePolicy: { group_by: "document", max_evidence_per_contract: 3 }
  });

  assert.deepEqual(payload, {
    conditions: [
      {
        id: "payment_terms",
        label: "付款账期",
        keywords: ["付款", "账期", "90天"],
        operator: "gt",
        value: "60天",
        enabled: true
      }
    ],
    evidence_policy: { group_by: "document", max_evidence_per_contract: 3 }
  });
});
