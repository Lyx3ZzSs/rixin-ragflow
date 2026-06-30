import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
const appSource = readFileSync(new URL("./App.jsx", import.meta.url), "utf8");
const apiSource = readFileSync(new URL("./api.js", import.meta.url), "utf8");
const indexHtml = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const viteConfig = readFileSync(new URL("../vite.config.js", import.meta.url), "utf8");
const ragflowViteConfig = readFileSync(new URL("../../web/vite.config.ts", import.meta.url), "utf8");

function rule(selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`, "m"));
  assert.ok(match, `Missing CSS rule for ${selector}`);
  return match[1];
}

function assertDeclaration(selector, declaration) {
  assert.match(
    rule(selector),
    new RegExp(declaration.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    `${selector} should include ${declaration}`,
  );
}

test("workspace layout keeps sidebar and input in fixed viewport tracks", () => {
  assertDeclaration(".workspace", "min-height: 100vh;");
  assertDeclaration(".workspace", "display: grid;");
  assertDeclaration(".workspace", "grid-template-columns: 260px minmax(0, 1fr);");
  assertDeclaration(".main-col", "height: 100vh;");
  assertDeclaration(".main-col", "grid-template-rows: 64px minmax(0, 1fr);");
  assertDeclaration(".conversation", "grid-template-rows: minmax(0, 1fr) auto;");
  assertDeclaration(".chat-input-bar", "margin-inline: auto;");
});

test("responsive overlay breakpoint stays below normal desktop widths", () => {
  assert.ok(!css.includes("@media (max-width: 1260px)"), "1260px breakpoint collapses desktop workspaces too early");
  assert.match(css, /@media \(max-width: 900px\)/);
});

test("empty state is a minimal prompt-first chat surface", () => {
  assert.match(appSource, /className="welcome-center"/, "empty state should render the minimal prompt surface");
  assert.match(appSource, /要筛选哪些合同？/, "empty state should ask for the screening goal");
  assert.ok(!appSource.includes("welcome-lead"), "empty state should not include marketing helper copy");
  assert.ok(!appSource.includes("welcome-icon"), "empty state should not include decorative icons");
});

test("empty prompt surface stays visually sparse", () => {
  assertDeclaration(".welcome-center", "display: grid;");
  assertDeclaration(".welcome-center", "place-items: center;");
  assertDeclaration(".welcome-title", "font-size: 24px;");
  assert.ok(!css.includes(".welcome-lead"), "legacy explanatory welcome copy CSS should be removed");
  assert.ok(!css.includes(".welcome-prompts"), "legacy prompt-chip grid CSS should be removed");
});

test("result messages do not expose low-value Excel or Word exports", () => {
  assert.ok(!appSource.includes("导出 Excel"), "Excel export button should not be shown in the chat result");
  assert.ok(!appSource.includes("导出 Word"), "Word export button should not be shown in the chat result");
  assert.ok(!appSource.includes("createScreeningExport"), "App should not call the export API from result cards");
  assert.ok(!appSource.includes("result-export-bar"), "result cards should not reserve an export action bar");
  assert.ok(!css.includes(".result-export-bar"), "unused export action bar styling should be removed");
  assert.ok(!appSource.includes("onCreateExport"), "result cards should not receive export handlers");
  assert.ok(!appSource.includes("handleCreateExport"), "App should not keep a result export handler");
  assert.ok(!appSource.includes("onExportReport"), "legacy report export handler should not be wired into result cards");
  assert.ok(!appSource.includes("handleExportReport"), "legacy report export handler should be removed");
  assert.match(apiSource, /createScreeningExport/, "export API adapter should remain available for backend compatibility");
  assert.ok(!apiSource.includes("/export?format="), "report export endpoint should not be called from the frontend");
});

test("send starts screening directly after parsing conditions", () => {
  const handleSendMatch = appSource.match(/async function handleSend\(text\) \{([\s\S]*?)\n  \}/);
  assert.ok(handleSendMatch, "handleSend should be present");
  const handleSendBody = handleSendMatch[1];

  assert.ok(!handleSendBody.includes("setPendingConditionReview"), "send should not open a condition review step");
  assert.match(handleSendBody, /runScreeningWithConditions\(/, "send should start screening with parsed conditions");
  assert.ok(!handleSendBody.includes("请确认后开始筛选"), "send should not ask for condition confirmation");
});

test("result cards expose original file downloads without opening evidence", () => {
  const evidenceActionSource = readFileSync(new URL("./components/results/EvidenceActionRow.jsx", import.meta.url), "utf8");

  assert.match(evidenceActionSource, /下载原文件/, "result cards should expose an original file download action");
  assert.match(evidenceActionSource, /downloadUrl &&/, "download action should require a mapped download URL");
  assert.match(evidenceActionSource, /event\.stopPropagation\(\)/, "download clicks should not trigger evidence viewing");
  assert.match(evidenceActionSource, /className="btn btn-secondary btn-small download-file-button"/, "download action should use compact button styling");
});

test("result rendering is split into focused P0 components", () => {
  const resultSetSource = readFileSync(new URL("./components/results/ResultSet.jsx", import.meta.url), "utf8");
  const resultCardSource = readFileSync(new URL("./components/results/ContractResultCard.jsx", import.meta.url), "utf8");
  const evidenceActionSource = readFileSync(new URL("./components/results/EvidenceActionRow.jsx", import.meta.url), "utf8");

  assert.match(resultSetSource, /function ResultSet/, "ResultSet should own result collection rendering");
  assert.match(resultCardSource, /function ContractResultCard/, "ContractResultCard should render one contract result");
  assert.match(evidenceActionSource, /event\.stopPropagation\(\)/, "download clicks should still avoid opening evidence");
  assert.match(evidenceActionSource, /下载原文件/, "original file download should remain available");
});

test("evidence panel does not show placeholder review actions", () => {
  assert.ok(!appSource.includes("下一步动作"), "evidence panel should not show action suggestions");
  assert.ok(!appSource.includes("待人工复核"), "evidence panel should not invent a manual review fallback");
  assert.ok(!appSource.includes("加入待办"), "evidence panel should not expose a fake todo queue");
  assert.ok(!appSource.includes("已加入待办队列"), "todo queue toast should be removed with the action");
});

test("evidence panel does not expose low-value feedback actions", () => {
  assert.ok(!appSource.includes("复制证据"), "evidence panel should not show a copy evidence button");
  assert.ok(!appSource.includes("结果有用"), "evidence panel should not show useful feedback");
  assert.ok(!appSource.includes("证据不足"), "evidence panel should not show missing evidence feedback");
  assert.ok(!appSource.includes("不相关"), "evidence panel should not show not relevant feedback");
  assert.ok(!appSource.includes("submitScreeningFeedback"), "App should not call the feedback API from evidence details");
});

test("evidence panel uses grouped evidence components without low-value actions", () => {
  const evidencePanelSource = readFileSync(new URL("./components/evidence/EvidencePanel.jsx", import.meta.url), "utf8");
  const evidenceGroupSource = readFileSync(new URL("./components/evidence/EvidenceGroupList.jsx", import.meta.url), "utf8");

  assert.match(evidencePanelSource, /function EvidencePanel/, "EvidencePanel should own evidence detail rendering");
  assert.match(evidenceGroupSource, /groupEvidenceBySource/, "evidence should be grouped by source");
  assert.ok(!evidencePanelSource.includes("复制证据"), "copy evidence action should not be added");
  assert.ok(!evidencePanelSource.includes("加入待办"), "fake todo action should not be added");
  assert.ok(!evidencePanelSource.includes("结果有用"), "feedback action should not be added");
});

test("favicon uses the Vite base URL for the /contract-agent mount", () => {
  assert.match(
    indexHtml,
    /<link rel="icon" type="image\/svg\+xml" href="\/logo\.svg" \/>/,
    "Vite should rewrite the favicon to the configured base path",
  );
});

test("entry script uses a relative URL so proxied /contract-agent loads contract code", () => {
  assert.match(
    indexHtml,
    /<script type="module" src="\.\/src\/main\.jsx"><\/script>/,
    "entry script should resolve under /contract-agent/ when accessed through the RAGFlow dev proxy",
  );
});

test("contract agent defaults to the /contract-agent deployment base", () => {
  assert.match(
    viteConfig,
    /base:\s*process\.env\.CONTRACT_AGENT_BASE\s*\|\|\s*"\/contract-agent\/"/,
    "default Vite base should match the RAGFlow login redirect and dev proxy path",
  );
});

test("ragflow dev proxy preserves /contract-agent before forwarding", () => {
  assert.ok(
    !ragflowViteConfig.includes("rewrite: (path) => path.replace(/^\\/contract-agent/, '') || '/',"),
    "the contract dev server needs the /contract-agent prefix to apply its Vite base",
  );
});
