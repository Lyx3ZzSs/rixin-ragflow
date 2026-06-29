# Login Page Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the `/login` page into a light “contract intelligence blueprint” experience with a restrained animated background, business-specific copy, and a cleaner form panel.

**Architecture:** Keep the existing login behavior, hooks, validation, and route unchanged. Replace only the presentational shell in `web/src/pages/login-next/`, using React markup plus LESS/CSS animations so the page stays lightweight and easy to verify.

**Tech Stack:** React 18, TypeScript, react-hook-form, existing UI primitives, LESS, Jest static tests, Vite build.

---

## File Structure

- Modify: `web/src/pages/login-next/index.tsx`
  - Add a business-branded login shell and keep the existing `LoginFormContent` behavior.
  - Add semantic classes for the new layout: `login-next-page`, `login-next-brand`, `login-next-panel`, `login-next-form-card`.
- Modify: `web/src/pages/login-next/bg.tsx`
  - Replace the dark animated circuit background with `BlueprintBg`, a light SVG line system with contract/evidence nodes.
  - Keep `isPaused` and reduced-motion support.
- Modify: `web/src/pages/login-next/index.less`
  - Define the new color system, responsive grid, animated blueprint lines, form panel, focus states, and mobile layout.
- Create: `web/src/pages/login-next/login-next-redesign.test.ts`
  - Add source/CSS regression checks for the new layout markers, background animation classes, Chinese business copy, and removal of the old deep-blue login hero language.

---

### Task 1: Add Redesign Regression Tests

**Files:**
- Create: `web/src/pages/login-next/login-next-redesign.test.ts`

- [ ] **Step 1: Add the failing static tests**

Create `web/src/pages/login-next/login-next-redesign.test.ts`:

```ts
import fs from 'node:fs';
import path from 'node:path';

const loginDir = path.resolve(__dirname);
const indexSource = fs.readFileSync(path.join(loginDir, 'index.tsx'), 'utf8');
const bgSource = fs.readFileSync(path.join(loginDir, 'bg.tsx'), 'utf8');
const lessSource = fs.readFileSync(path.join(loginDir, 'index.less'), 'utf8');

describe('login next redesign', () => {
  it('uses the contract-intelligence login shell copy and classes', () => {
    expect(indexSource).toContain('login-next-page');
    expect(indexSource).toContain('合同智能筛选平台');
    expect(indexSource).toContain('用可追溯证据完成合同风险筛选');
    expect(indexSource).toContain('SECURE ACCESS');
  });

  it('uses a light blueprint background instead of the old dark RAG hero', () => {
    expect(bgSource).toContain('BlueprintBg');
    expect(bgSource).toContain('blueprint-flow');
    expect(bgSource).toContain('prefers-reduced-motion');
    expect(indexSource).not.toContain('A leading RAG engine for LLM context');
  });

  it('styles the form as a warm paper panel with restrained animation', () => {
    expect(lessSource).toContain('--login-paper');
    expect(lessSource).toContain('.login-next-form-card');
    expect(lessSource).toContain('@keyframes blueprint-flow');
    expect(lessSource).toContain('@media (max-width: 900px)');
  });
});
```

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```bash
cd web
npm run test -- login-next-redesign.test.ts --runInBand
```

Expected: FAIL because `login-next-page`, `BlueprintBg`, and `--login-paper` do not exist yet.

- [ ] **Step 3: Commit the failing test**

```bash
git add web/src/pages/login-next/login-next-redesign.test.ts
git commit -m "test: cover login page redesign contract"
```

---

### Task 2: Replace the Background With a Light Animated Blueprint

**Files:**
- Modify: `web/src/pages/login-next/bg.tsx`

- [ ] **Step 1: Replace `BgSvg` internals and export `BlueprintBg`**

Update `web/src/pages/login-next/bg.tsx` to keep `BgSvg` as a compatibility export while implementing the new component:

```tsx
import './index.less';

type BlueprintBgProps = {
  isPaused?: boolean;
};

export const BlueprintBg = ({ isPaused = false }: BlueprintBgProps) => {
  const animationClass = isPaused ? 'is-paused' : '';

  return (
    <div className={`login-blueprint-bg ${animationClass}`} aria-hidden="true">
      <svg
        className="login-blueprint-bg__svg"
        viewBox="0 0 1440 900"
        preserveAspectRatio="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="blueprintLine" x1="0%" x2="100%" y1="0%" y2="0%">
            <stop offset="0%" stopColor="#0E7490" stopOpacity="0" />
            <stop offset="45%" stopColor="#0E7490" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#2563EB" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path className="blueprint-line" d="M-40 190H210C270 190 286 255 346 255H690C748 255 762 190 824 190H1480" />
        <path className="blueprint-line blueprint-line--slow" d="M-20 615H245C310 615 326 548 390 548H770C834 548 850 615 916 615H1460" />
        <path className="blueprint-line blueprint-line--faint" d="M150 40V230M150 670V870M1260 30V265M1260 620V880" />
        <rect className="blueprint-document" x="955" y="290" width="210" height="270" rx="18" />
        <path className="blueprint-document-detail" d="M1000 350H1125M1000 405H1110M1000 460H1138" />
        <circle className="blueprint-node blueprint-node--one" cx="346" cy="255" r="5" />
        <circle className="blueprint-node blueprint-node--two" cx="770" cy="548" r="5" />
        <circle className="blueprint-node blueprint-node--three" cx="955" cy="425" r="5" />
      </svg>
    </div>
  );
};

export const BgSvg = BlueprintBg;
```

- [ ] **Step 2: Run the redesign test**

```bash
cd web
npm run test -- login-next-redesign.test.ts --runInBand
```

Expected: still FAIL because `index.tsx` and `index.less` are not updated yet.

- [ ] **Step 3: Commit the background component**

```bash
git add web/src/pages/login-next/bg.tsx
git commit -m "feat: add login blueprint background"
```

---

### Task 3: Rebuild the Login Page Shell

**Files:**
- Modify: `web/src/pages/login-next/index.tsx`

- [ ] **Step 1: Change the background import**

Replace:

```ts
import { BgSvg } from './bg';
```

with:

```ts
import { BlueprintBg } from './bg';
```

- [ ] **Step 2: Update the form title block in `LoginFormContent`**

Replace the title wrapper in `LoginFormContent` with:

```tsx
      <div className="login-next-form-heading">
        <span className="login-next-eyebrow">SECURE ACCESS</span>
        <h2 className="login-next-form-title">
          {title === 'login' ? '登录合同智能筛选平台' : '创建合同筛选账号'}
        </h2>
        <p className="login-next-form-subtitle">
          {title === 'login'
            ? '继续处理合同库、筛选任务与证据结果'
            : '创建账号后开始沉淀合同筛选结果'}
        </p>
      </div>
```

- [ ] **Step 3: Update the form card class**

Replace the card wrapper class:

```tsx
      <div className=" w-full max-w-[540px] bg-bg-component backdrop-blur-sm rounded-2xl shadow-xl pt-14 pl-10 pr-10 pb-2 border border-border-button ">
```

with:

```tsx
      <div className="login-next-form-card">
```

- [ ] **Step 4: Update the submit button class**

Replace the `ButtonLoading` `className`:

```tsx
className="bg-metallic-gradient border-b-[#00BEB4] border-b-2 hover:bg-metallic-gradient hover:border-b-[#02bcdd] w-full my-8"
```

with:

```tsx
className="login-next-submit"
```

- [ ] **Step 5: Update the page shell markup**

In the main return of `Login`, use this structure around the existing flip card:

```tsx
    <section className="login-next-page">
      <BlueprintBg isPaused={loading || registerLoading} />
      <div className="login-next-content">
        <div className="login-next-brand">
          <div className="login-next-logo-row">
            <SvgIcon name="logo-with-text-white" width={132} height={32} />
          </div>
          <span className="login-next-kicker">CONTRACT INTELLIGENCE</span>
          <h1>合同智能筛选平台</h1>
          <p>用可追溯证据完成合同风险筛选，让合同库、筛选条件与审计结果形成统一工作流。</p>
          <div className="login-next-capabilities" aria-label="平台能力">
            <span>自然语言筛选</span>
            <span>合同证据追溯</span>
            <span>风险结果沉淀</span>
          </div>
        </div>
        <div className="login-next-panel">
          <FlipCard3D isLoginPage={isLoginPage}>
            <LoginFormContent
              isLoginPage={isLoginPage}
              title={title}
              form={form}
              loading={loading || registerLoading}
              onCheck={onCheck}
              changeTitle={changeTitle}
              registerEnabled={registerEnabled}
              channels={channels}
              handleLoginWithChannel={handleLoginWithChannel}
              t={t}
              disablePasswordLogin={disablePasswordLogin}
            />
          </FlipCard3D>
        </div>
      </div>
    </section>
```

Keep all existing hook setup, `onCheck`, `changeTitle`, SSO, and redirect logic unchanged.

- [ ] **Step 6: Run the redesign test**

```bash
cd web
npm run test -- login-next-redesign.test.ts --runInBand
```

Expected: still FAIL until styles are added.

- [ ] **Step 7: Commit the shell markup**

```bash
git add web/src/pages/login-next/index.tsx
git commit -m "feat: redesign login shell"
```

---

### Task 4: Add the New Visual System and Responsive Styles

**Files:**
- Modify: `web/src/pages/login-next/index.less`

- [ ] **Step 1: Replace old deep-blue animation styles with the new login styles**

Append or replace the login-specific styles in `web/src/pages/login-next/index.less` with:

```less
:root {
  --login-paper: #f4f0e8;
  --login-paper-soft: #fbfaf6;
  --login-ink: #111111;
  --login-muted: #6f6a60;
  --login-border: rgba(17, 17, 17, 0.14);
  --login-energy: #0e7490;
  --login-electric: #2563eb;
}

.login-next-page {
  min-height: 100vh;
  position: relative;
  overflow: hidden;
  background:
    radial-gradient(circle at 15% 12%, rgba(14, 116, 144, 0.1), transparent 28rem),
    linear-gradient(135deg, var(--login-paper), #f9f6ee 54%, #ece7dc);
  color: var(--login-ink);
}

.login-next-content {
  position: relative;
  z-index: 1;
  min-height: 100vh;
  display: grid;
  grid-template-columns: minmax(0, 1.12fr) minmax(390px, 0.88fr);
  align-items: center;
  gap: clamp(48px, 7vw, 112px);
  padding: clamp(32px, 6vw, 80px);
}

.login-next-brand {
  max-width: 720px;
}

.login-next-logo-row {
  width: fit-content;
  padding: 10px 14px;
  border: 1px solid var(--login-border);
  border-radius: 14px;
  background: rgba(17, 17, 17, 0.88);
}

.login-next-kicker,
.login-next-eyebrow {
  display: inline-flex;
  margin-top: 28px;
  color: var(--login-energy);
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.14em;
}

.login-next-brand h1 {
  max-width: 680px;
  margin: 18px 0 0;
  color: var(--login-ink);
  font-size: clamp(48px, 7vw, 92px);
  font-weight: 650;
  letter-spacing: -0.04em;
  line-height: 0.95;
}

.login-next-brand p {
  max-width: 560px;
  margin-top: 24px;
  color: var(--login-muted);
  font-size: 18px;
  line-height: 1.7;
}

.login-next-capabilities {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 32px;
}

.login-next-capabilities span {
  border: 1px solid var(--login-border);
  border-radius: 999px;
  background: rgba(251, 250, 246, 0.72);
  padding: 8px 12px;
  color: var(--login-ink);
  font-size: 13px;
}

.login-next-panel {
  justify-self: end;
  width: min(100%, 460px);
}

.login-next-form-heading {
  margin-bottom: 22px;
}

.login-next-form-title {
  margin-top: 10px;
  color: var(--login-ink);
  font-size: 28px;
  font-weight: 650;
  letter-spacing: -0.02em;
}

.login-next-form-subtitle {
  margin-top: 8px;
  color: var(--login-muted);
  font-size: 14px;
  line-height: 1.6;
}

.login-next-form-card {
  width: 100%;
  border: 1px solid var(--login-border);
  border-radius: 18px;
  background: rgba(251, 250, 246, 0.88);
  box-shadow: 0 24px 70px rgba(17, 17, 17, 0.13);
  padding: 32px;
  backdrop-filter: blur(18px);
}

.login-next-form-card input {
  min-height: 44px;
  border-color: var(--login-border);
  background: rgba(255, 255, 255, 0.7);
  color: var(--login-ink);
}

.login-next-form-card input:focus-visible {
  border-color: var(--login-energy);
  box-shadow: 0 0 0 3px rgba(14, 116, 144, 0.14);
}

.login-next-submit {
  width: 100%;
  min-height: 46px;
  margin: 28px 0 8px;
  border: 0;
  border-bottom: 2px solid var(--login-energy);
  border-radius: 12px;
  background: var(--login-ink);
  color: #ffffff;
  transition:
    transform 160ms ease,
    background 160ms ease,
    border-color 160ms ease;
}

.login-next-submit:hover {
  transform: translateY(-1px);
  background: #1d1d1d;
  border-bottom-color: var(--login-electric);
}

.login-blueprint-bg {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.85;
}

.login-blueprint-bg__svg {
  width: 100%;
  height: 100%;
}

.blueprint-line,
.blueprint-document,
.blueprint-document-detail {
  fill: none;
  stroke: rgba(17, 17, 17, 0.14);
  stroke-width: 1;
}

.blueprint-line {
  stroke: url(#blueprintLine);
  stroke-dasharray: 90 520;
  animation: blueprint-flow 16s linear infinite;
}

.blueprint-line--slow {
  animation-duration: 22s;
}

.blueprint-line--faint {
  stroke: rgba(17, 17, 17, 0.08);
  stroke-dasharray: none;
  animation: none;
}

.blueprint-node {
  fill: var(--login-energy);
  opacity: 0.5;
  animation: blueprint-pulse 3.8s ease-in-out infinite;
}

.blueprint-node--two {
  animation-delay: 900ms;
}

.blueprint-node--three {
  animation-delay: 1600ms;
}

.is-paused .blueprint-line,
.is-paused .blueprint-node {
  animation-play-state: paused;
}

@keyframes blueprint-flow {
  from {
    stroke-dashoffset: 0;
  }
  to {
    stroke-dashoffset: -610;
  }
}

@keyframes blueprint-pulse {
  0%, 100% {
    opacity: 0.28;
    transform: scale(1);
  }
  50% {
    opacity: 0.75;
    transform: scale(1.28);
  }
}

@media (max-width: 900px) {
  .login-next-content {
    grid-template-columns: 1fr;
    gap: 32px;
    padding: 28px;
  }

  .login-next-brand h1 {
    font-size: clamp(38px, 12vw, 56px);
  }

  .login-next-panel {
    justify-self: stretch;
    width: 100%;
  }
}

@media (max-width: 560px) {
  .login-next-form-card {
    padding: 22px;
    border-radius: 14px;
  }

  .login-next-brand p {
    font-size: 15px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .blueprint-line,
  .blueprint-node {
    animation: none !important;
  }
}
```

- [ ] **Step 2: Remove obsolete dark background dependencies**

Delete unused `.mask-path`, `.animate-glow`, `.animate-highlight`, `.paused`, and related keyframes only if no other login component still references them after Task 2.

- [ ] **Step 3: Run the redesign test**

```bash
cd web
npm run test -- login-next-redesign.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 4: Commit the styles**

```bash
git add web/src/pages/login-next/index.less
git commit -m "style: apply login page blueprint visual system"
```

---

### Task 5: Verify Integration, Build, and Browser Rendering

**Files:**
- Modify only if verification reveals small layout defects in:
  - `web/src/pages/login-next/index.tsx`
  - `web/src/pages/login-next/bg.tsx`
  - `web/src/pages/login-next/index.less`

- [ ] **Step 1: Run focused tests**

```bash
cd web
npm run test -- login-next-redesign.test.ts --runInBand
```

Expected: PASS.

- [ ] **Step 2: Run type check**

```bash
cd web
npm run type-check
```

Expected: exit 0.

- [ ] **Step 3: Run production build**

```bash
cd web
npm run build
```

Expected: Vite production build completes successfully.

- [ ] **Step 4: Browser-check `/login`**

Open `http://localhost:9222/login` and verify:

- The page no longer shows the old deep-blue background.
- The background has subtle animated blueprint lines.
- The hero title reads `合同智能筛选平台`.
- The form heading reads `登录合同智能筛选平台`.
- Email, password, remember-me, submit, register toggle, and SSO buttons remain usable.
- The layout does not overflow at desktop width around 1075x936.

- [ ] **Step 5: Browser-check mobile width**

Set viewport to approximately 390x844 and verify:

- The layout stacks vertically.
- The form remains fully visible without text overlap.
- The capability chips wrap cleanly.
- The animated background does not obscure form fields.

- [ ] **Step 6: Commit final fixes**

```bash
git add web/src/pages/login-next/index.tsx web/src/pages/login-next/bg.tsx web/src/pages/login-next/index.less
git commit -m "feat: redesign login page for contract intelligence"
```

---

## Self-Review

- Spec coverage: The plan covers the visual direction, background animation, login form redesign, responsive layout, copy changes, existing auth behavior preservation, and verification.
- Red-flag scan: All tasks contain concrete file paths, commands, and code snippets.
- Type consistency: `BlueprintBg`, `login-next-page`, `login-next-form-card`, and `blueprint-flow` are introduced before they are asserted by tests or referenced by styles.
