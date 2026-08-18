import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

/**
 * contracts/frontend-manifest-wiring.md — the no-props-via-route guard,
 * mirroring `AgentBrowser.route.test.tsx`/`RunDiagram.route.test.tsx`
 * exactly (tasks.md Grounding note 9): renders `<McpServerManagement />`
 * through the actual manifest-declared route
 * (`/clarion-app/llm-client/mcp-servers`) rather than directly with
 * hand-passed props/store, and asserts real seeded server rows render.
 * The class of test that would have caught spec 070's
 * `RunDiagram`/`runId` defect (a required prop the host never supplies).
 */

vi.mock('./config', () => ({
  backend: {
    url: 'http://localhost:8000',
    token: 'test-token',
    user: { id: 'user-1', name: 'Test User', email: 'test@test.com' },
  },
  updateFrontend: () => {},
}));

let mockServers: Array<{ id: string; name: string; transport: string; scope: string; connection_status: string; last_reachable_at: string | null; tool_count: number }> = [];

vi.mock('@clarion-app/frontend-base', () => ({
  createBackendConfig: () => ({
    backend: { url: 'http://localhost:8000', user: { id: 'user-1', name: '', email: '' } },
    updateFrontend: () => {},
  }),
  createBaseQuery: () => async (args: any) => {
    const url = typeof args === 'string' ? args : (args?.url ?? '');
    const path = String(url).split('?')[0];

    if (/^\/mcp-client-server$/.test(path)) {
      return { data: mockServers };
    }

    return { data: {} };
  },
  registerUserChannelHandler: () => {},
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

/** The manifest's one route, wired exactly as `customFields.clarion.routes` declares it. */
function renderManifestRoute(initialEntry: string) {
  const store = createTestStore();
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Provider store={store}>
        <Routes>
          <Route path="/clarion-app/llm-client/mcp-servers" element={<McpServerManagement />} />
        </Routes>
      </Provider>
    </MemoryRouter>,
  );
}

describe('McpServerManagement — zero-required-props contract (mutation-checklist row 6)', () => {
  it('accepts zero required arguments (function arity 0), matching the manifest contract — a required prop with no default would raise this to 1, invisible to every other check in this pipeline since vitest does not type-check and tsc excludes *.test.* files from the build', () => {
    expect(McpServerManagement.length).toBe(0);
  });
});

describe('McpServerManagement via its declared route', () => {
  beforeEach(() => {
    mockServers = [];
  });

  it('renders real seeded server rows when mounted with zero hand-passed props, via the manifest route', async () => {
    mockServers = [
      { id: 'srv-from-route', name: 'Routed MCP server', transport: 'streamable_http', scope: 'personal', connection_status: 'reachable', last_reachable_at: '2026-08-18T10:00:00Z', tool_count: 5 },
    ];

    renderManifestRoute('/clarion-app/llm-client/mcp-servers');

    await waitFor(() => {
      expect(screen.getByTestId('mcp-server-card-srv-from-route')).toBeInTheDocument();
    });

    expect(screen.getByTestId('mcp-server-card-srv-from-route').textContent ?? '').toMatch(/Routed MCP server/);
    expect(screen.queryByTestId('mcp-server-management-empty-state')).not.toBeInTheDocument();
  });

  it('renders the MCP-specific empty state via the real manifest route when zero servers are configured', async () => {
    mockServers = [];

    renderManifestRoute('/clarion-app/llm-client/mcp-servers');

    await waitFor(() => {
      expect(screen.getByTestId('mcp-server-management-empty-state')).toBeInTheDocument();
    });
  });
});
