import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { McpServerCard } from './McpServerCard';
import { McpClientServerType, McpClientServerStatusCategory } from './types';

/**
 * McpServerCard — US1 (119-mcp-server-management-ui), FR-001/FR-010,
 * Acceptance Scenarios 1-3. Confirmed FAILING: neither McpServerCard.tsx
 * nor its import target exists yet (T019 makes this green).
 */

function makeServer(overrides: Partial<McpClientServerType> = {}): McpClientServerType {
  return {
    id: 'srv-1',
    name: 'Team web-search server',
    transport: 'streamable_http',
    scope: 'personal',
    connection_status: 'reachable',
    last_reachable_at: '2026-08-18T12:00:00.000000Z',
    tool_count: 3,
    ...overrides,
  };
}

describe('McpServerCard — status badges (FR-010, five distinguishable categories)', () => {
  const cases: Array<[McpClientServerStatusCategory, RegExp]> = [
    ['reachable', /connect|reachable/i],
    ['unreachable', /unreachable/i],
    ['auth_failed', /auth/i],
    ['protocol_error', /unexpected|protocol/i],
    ['unknown', /not.*check|unknown/i],
  ];

  it('renders a distinct, non-overlapping badge text for every one of the 5 connection_status categories', () => {
    const seenTexts = new Set<string>();

    for (const [category] of cases) {
      const server = makeServer({ connection_status: category });
      const { unmount } = render(<McpServerCard server={server} />);
      const badge = screen.getByTestId(`mcp-server-status-${server.id}`);
      const text = (badge.textContent ?? '').trim().toLowerCase();
      expect(text.length).toBeGreaterThan(0);
      expect(seenTexts.has(text)).toBe(false);
      seenTexts.add(text);
      unmount();
    }
  });

  it.each(cases)('category %s renders text matching %s', (category, pattern) => {
    const server = makeServer({ connection_status: category });
    render(<McpServerCard server={server} />);
    const badge = screen.getByTestId(`mcp-server-status-${server.id}`);
    expect(badge.textContent ?? '').toMatch(pattern);
  });

  it('protocol_error is never rendered with the same text as unreachable (the exact FR-010 ambiguity this feature closes)', () => {
    const { unmount } = render(<McpServerCard server={makeServer({ connection_status: 'protocol_error' })} />);
    const protocolText = (screen.getByTestId('mcp-server-status-srv-1').textContent ?? '').trim().toLowerCase();
    unmount();

    render(<McpServerCard server={makeServer({ connection_status: 'unreachable' })} />);
    const unreachableText = (screen.getByTestId('mcp-server-status-srv-1').textContent ?? '').trim().toLowerCase();

    expect(protocolText).not.toBe(unreachableText);
  });
});

describe('McpServerCard — last-successful-contact time (Acceptance Scenario 2)', () => {
  it('renders the last successful contact time distinctly labeled, not conflated with the current status badge', () => {
    const server = makeServer({ connection_status: 'unreachable', last_reachable_at: '2026-08-18T10:00:00.000000Z' });
    render(<McpServerCard server={server} />);

    const lastReachable = screen.getByTestId(`mcp-server-last-reachable-${server.id}`);
    expect(lastReachable.textContent ?? '').toMatch(/last.*(success|reach|contact)/i);

    const badge = screen.getByTestId(`mcp-server-status-${server.id}`);
    expect((badge.textContent ?? '').toLowerCase()).not.toContain((lastReachable.textContent ?? '').toLowerCase());
  });

  it('renders a clear "never" state when last_reachable_at is null, not a blank or crash', () => {
    const server = makeServer({ connection_status: 'unknown', last_reachable_at: null });
    render(<McpServerCard server={server} />);

    const lastReachable = screen.getByTestId(`mcp-server-last-reachable-${server.id}`);
    expect(lastReachable.textContent ?? '').toMatch(/never/i);
  });
});

describe('McpServerCard — approximate tool count (Acceptance Scenario 3)', () => {
  it('renders the server\'s current tool count', () => {
    const server = makeServer({ tool_count: 7 });
    render(<McpServerCard server={server} />);

    const toolCount = screen.getByTestId(`mcp-server-tool-count-${server.id}`);
    expect(toolCount.textContent ?? '').toMatch(/7/);
  });

  it('renders zero tools distinctly (not blank)', () => {
    const server = makeServer({ tool_count: 0 });
    render(<McpServerCard server={server} />);

    const toolCount = screen.getByTestId(`mcp-server-tool-count-${server.id}`);
    expect((toolCount.textContent ?? '').trim().length).toBeGreaterThan(0);
    expect(toolCount.textContent ?? '').toMatch(/0/);
  });
});

describe('McpServerCard — server identity', () => {
  it('renders the server name and transport', () => {
    const server = makeServer({ name: 'Filesystem tools', transport: 'stdio' });
    render(<McpServerCard server={server} />);

    expect(screen.getByText(/Filesystem tools/)).toBeInTheDocument();
  });
});
