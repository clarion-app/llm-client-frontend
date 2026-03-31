import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import CodeBlock from './CodeBlock';

describe('CodeBlock', () => {
  it('strips <script> tags from highlighted code', () => {
    const malicious = '<script>alert("xss")</script>console.log("safe")';
    const { container } = render(<CodeBlock className="lang-javascript">{malicious}</CodeBlock>);
    expect(container.innerHTML).not.toContain('<script>');
    expect(container.innerHTML).not.toContain('alert("xss")');
  });

  it('strips <img onerror> payloads in fallback path', () => {
    const malicious = '<img src=x onerror=alert(1)>hello';
    const { container } = render(<CodeBlock className="lang-unknownlang99">{malicious}</CodeBlock>);
    const pre = container.querySelector('pre');
    expect(pre?.innerHTML).not.toContain('<img');
    expect(pre?.innerHTML).not.toContain('onerror');
  });

  it('strips event handler attributes in fallback path', () => {
    const malicious = '<div onclick="alert(1)">click me</div>';
    const { container } = render(<CodeBlock className="lang-unknownlang99">{malicious}</CodeBlock>);
    const pre = container.querySelector('pre');
    expect(pre?.innerHTML).not.toContain('onclick');
    expect(pre?.innerHTML).not.toContain('<div');
  });

  it('preserves Prism <span class="token ..."> elements', () => {
    const code = 'const x = 1;';
    const { container } = render(<CodeBlock className="lang-javascript">{code}</CodeBlock>);
    const tokens = container.querySelectorAll('span.token');
    expect(tokens.length).toBeGreaterThan(0);
  });

  it('sanitizes fallback path when language is unknown', () => {
    const malicious = '<script>alert("xss")</script>plain text';
    const { container } = render(<CodeBlock className="lang-unknownlang99">{malicious}</CodeBlock>);
    expect(container.innerHTML).not.toContain('<script>');
  });

  it('renders properly with no className', () => {
    const code = 'hello world';
    const { container } = render(<CodeBlock>{code}</CodeBlock>);
    expect(container.textContent).toContain('hello world');
  });
});
