import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

/**
 * McpServerManagement — US1 orchestration (119-mcp-server-management-ui).
 * Confirmed FAILING: neither McpServerManagement.tsx nor McpServerList.tsx
 * exist yet (T019/T020 make this green).
 *
 * Mirrors ModelSetup.test.tsx's own pattern: mock the child list component
 * so this file tests orchestration (which branch renders, not list-item
 * internals — McpServerCard/McpServerList get their own dedicated tests).
 */

vi.mock('.', () => ({
  backend: {
    url: 'http://localhost:8000',
    token: 'test-token',
    user: { id: 'user-1', name: 'Test User', email: 'test@test.com' },
  },
}));

vi.mock('./McpServerList', () => ({
  McpServerList: vi.fn(({ servers }: { servers: Array<{ id: string; name: string }> }) =>
    React.createElement(
      'div',
      { 'data-testid': 'mcp-server-list' },
      servers.map((s) => React.createElement('div', { key: s.id, 'data-testid': `mcp-server-list-item-${s.id}` }, s.name)),
    ),
  ),
}));

let mockServers: Array<{ id: string; name: string; transport: string; scope: string; connection_status: string; last_reachable_at: string | null; tool_count: number }> = [];

vi.mock('@clarion-app/frontend-base', () => ({
  createBackendConfig: () => ({
    backend: { url: 'http://localhost:8000', user: { id: '', name: '', email: '' } },
    updateFrontend: () => {},
  }),
  createBaseQuery: () => async (args: any) => {
    const url = typeof args === 'string' ? args : (args?.url ?? '');
    if (String(url).includes('/mcp-client-server')) {
      return { data: mockServers };
    }
    return { data: {} };
  },
}));

const { mcpClientServerApi } = await import('./mcpClientServerApi');
const { McpServerManagement } = await import('./McpServerManagement');

function createTestStore() {
  return configureStore({
    reducer: {
      [mcpClientServerApi.reducerPath]: mcpClientServerApi.reducer,
    },
    middleware: (getDefault) => getDefault().concat(mcpClientServerApi.middleware),
  });
}

function renderManagement() {
  const store = createTestStore();
  return render(
    <Provider store={store}>
      <McpServerManagement />
    </Provider>,
  );
}

describe('McpServerManagement — zero-required-props contract', () => {
  it('accepts zero required arguments (arity 0), mirrors ModelSetup/RunDiagram\'s own zero-prop routed-screen contract', () => {
    expect(McpServerManagement.length).toBe(0);
  });
});

describe('McpServerManagement — orchestration', () => {
  beforeEach(() => {
    mockServers = [];
  });

  it('renders one card per configured server, each independently marked (Acceptance Scenario 1)', async () => {
    mockServers = [
      { id: 'srv-1', name: 'Reachable server', transport: 'streamable_http', scope: 'personal', connection_status: 'reachable', last_reachable_at: '2026-08-18T10:00:00Z', tool_count: 3 },
      { id: 'srv-2', name: 'Unreachable server', transport: 'stdio', scope: 'personal', connection_status: 'unreachable', last_reachable_at: null, tool_count: 0 },
    ];

    renderManagement();

    await waitFor(() => {
      expect(screen.getByTestId('mcp-server-list')).toBeInTheDocument();
    });

    expect(screen.getByTestId('mcp-server-list-item-srv-1')).toHaveTextContent('Reachable server');
    expect(screen.getByTestId('mcp-server-list-item-srv-2')).toHaveTextContent('Unreachable server');
  });

  it('renders an inline, MCP-specific empty state when zero servers are configured (Acceptance Scenario 4) — not the generic model-setup EmptyState', async () => {
    mockServers = [];

    renderManagement();

    const emptyState = await waitFor(() => screen.getByTestId('mcp-server-management-empty-state'));
    expect(screen.queryByTestId('mcp-server-list')).not.toBeInTheDocument();
    expect(emptyState).toBeInTheDocument();
    // MCP-specific copy, distinct from EmptyState.tsx's OpenAI-compatible-API
    // copy (Grounding note 9 — that component's text does not apply here).
    expect(emptyState.textContent ?? '').toMatch(/server/i);
    expect(emptyState.textContent ?? '').not.toMatch(/OpenAI-compatible/i);
  });
});
