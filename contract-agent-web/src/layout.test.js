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

test("phase two export actions are exposed from completed screening results", () => {
  assert.match(appSource, /导出 Excel/, "Excel export button should be available");
  assert.match(appSource, /导出 Word/, "Word export button should be available");
  assert.match(appSource, /createScreeningExport/, "export API adapter should be wired");
  assert.match(appSource, /const canExport = message\.taskId && resultItems\.length > 0;/, "exports should require a task result");
  assert.ok(!appSource.includes("onExportReport"), "legacy report export handler should not be wired into result cards");
  assert.ok(!appSource.includes("handleExportReport"), "legacy report export handler should be removed");
  assert.ok(!apiSource.includes("exportScreeningReport"), "report export API adapter should be removed");
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

test("favicon uses the Vite base URL for the /contract-agent mount", () => {
  assert.match(
    indexHtml,
    /<link rel="icon" type="image\/x-icon" href="\/favicon\.ico" \/>/,
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
