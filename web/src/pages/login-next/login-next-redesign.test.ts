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

  it('does not render the legacy RAGFlow logo block in the brand area', () => {
    expect(indexSource).not.toContain('logo-with-text-white');
    expect(indexSource).not.toContain('login-next-logo-row');
    expect(lessSource).not.toContain('.login-next-logo-row');
  });

  it('uses a light blueprint background instead of the old dark RAG hero', () => {
    expect(bgSource).toContain('BlueprintBg');
    expect(lessSource).toContain('blueprint-flow');
    expect(lessSource).toContain('prefers-reduced-motion');
    expect(indexSource).not.toContain('A leading RAG engine for LLM context');
  });

  it('styles the form as a warm paper panel with restrained animation', () => {
    expect(lessSource).toContain('--login-paper');
    expect(lessSource).toContain('.login-next-form-card');
    expect(lessSource).toContain('@keyframes blueprint-flow');
    expect(lessSource).toContain('@media (max-width: 900px)');
  });
});
