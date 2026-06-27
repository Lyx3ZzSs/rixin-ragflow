import { preprocessLaTeX } from '../chat';

test('handles double-escaped inline LaTeX', () => {
  const result = preprocessLaTeX('\\\\(\\\\Delta = b^2\\\\)');
  expect(result).toBe('$\\Delta = b^2$');
});

test('handles double-escaped block LaTeX', () => {
  const result = preprocessLaTeX('\\\\[E = mc^2\\\\]');
  expect(result).toBe('$$E = mc^2$$');
});

test('decodes HTML entities', () => {
  const result = preprocessLaTeX('a &lt; b &amp; c &gt; d');
  expect(result).toBe('a < b & c > d');
});

test('handles mixed double-escaped delimiters with HTML entities', () => {
  const result = preprocessLaTeX('\\\\(x &lt; y\\\\)');
  expect(result).toBe('$x < y$');
});

test('passes through already correct single-escaped delimiters unchanged', () => {
  const result = preprocessLaTeX('\\(x = 1\\)');
  expect(result).toBe('$x = 1$');
});

describe('preprocessLaTeX legacy delimiters', () => {
  it('converts block \\[ \\] to $$ $$', () => {
    expect(preprocessLaTeX('\\[ x + y \\]')).toBe('$$x + y$$');
  });

  it('converts inline \\( \\) to $ $', () => {
    expect(preprocessLaTeX('\\( a \\)')).toBe('$a$');
  });

  it('does not cut block math at \\right] (Closes #13134)', () => {
    const content =
      '\\[ C_{seq}(y|x) = \\frac{1}{|y|} \\sum_{t=1}^{|y|} \\right] \\]';
    const result = preprocessLaTeX(content);
    expect(result).toContain('\\right]');
    expect(result).toContain('\\frac{1}{|y|}');
    expect(result).toBe(
      '$$ C_{seq}(y|x) = \\frac{1}{|y|} \\sum_{t=1}^{|y|} \\right] $$',
    );
  });

  it('does not cut inline math at \\big) or nested parens', () => {
    const content = '\\( f(x) + \\big) \\)';
    const result = preprocessLaTeX(content);
    expect(result).toContain('\\big)');
    expect(result).toBe('$ f(x) + \\big) $');
  });

  it('handles multiple block equations', () => {
    const content = 'First \\[ a \\] then \\[ b \\right] c \\]';
    const result = preprocessLaTeX(content);
    expect(result).toBe('First $$a$$ then $$ b \\right] c $$');
  });
});
