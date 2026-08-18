import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

/**
 * contracts/frontend-manifest-wiring.md — the no-props-via-route guard,
 * mirroring `McpServerManagement.route.test.tsx`/`RunDiagram.route.test.tsx`
 * exactly: renders `<WorkspaceBrowser />` through the actual manifest-
 * declared route (`/clarion-app/llm-client/workspaces`) rather than
 * directly with hand-passed props/store, and asserts real seeded workspace
 * rows render. The class of test that would have caught spec 070's
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

let mockWorkspaces: Array<{
  id: string;
  user_id: string;
  name: string;
  root_path: string;
  test_command: string | null;
  confirmation_relaxed: boolean;
  reachable: boolean;
  created_at: string;
  updated_at: string;
}> = [];

vi.mock('@clarion-app/frontend-base', () => ({
  createBackendConfig: () => ({
    backend: { url: 'http://localhost:8000', user: { id: 'user-1', name: '', email: '' } },
    updateFrontend: () => {},
  }),
  createBaseQuery: () => async (args: any) => {
    const url = typeof args === 'string' ? args : (args?.url ?? '');
    const path = String(url).split('?')[0];

    if (path === '/coding-project') {
      return { data: { data: mockWorkspaces, total: mockWorkspaces.length, page: 1, per_page: 50 } };
    }

    return { data: {} };
  },
  registerUserChannelHandler: () => {},
}));

const { workspaceApi } = await import('./workspaceApi');
const { WorkspaceBrowser } = await import('./WorkspaceBrowser');

function createTestStore() {
  return configureStore({
    reducer: {
      [workspaceApi.reducerPath]: workspaceApi.reducer,
    },
    middleware: (getDefault) => getDefault().concat(workspaceApi.middleware),
  });
}

/** The manifest's route, wired exactly as `customFields.clarion.routes` declares it. */
function renderManifestRoute(initialEntry: string) {
  const store = createTestStore();
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Provider store={store}>
        <Routes>
          <Route path="/clarion-app/llm-client/workspaces" element={<WorkspaceBrowser />} />
        </Routes>
      </Provider>
    </MemoryRouter>,
  );
}

describe('WorkspaceBrowser — zero-required-props contract', () => {
  it('accepts zero required arguments (function arity 0), matching the manifest contract', () => {
    expect(WorkspaceBrowser.length).toBe(0);
  });
});

describe('WorkspaceBrowser via its declared route', () => {
  beforeEach(() => {
    mockWorkspaces = [];
  });

  it('renders real seeded workspace rows when mounted with zero hand-passed props, via the manifest route', async () => {
    mockWorkspaces = [
      {
        id: 'ws-from-route',
        user_id: 'user-1',
        name: 'Routed Workspace',
        root_path: '/srv/projects/routed-workspace',
        test_command: null,
        confirmation_relaxed: false,
        reachable: true,
        created_at: '2026-08-18T10:00:00Z',
        updated_at: '2026-08-18T10:00:00Z',
      },
    ];

    renderManifestRoute('/clarion-app/llm-client/workspaces');

    await waitFor(() => {
      expect(screen.getByTestId('workspace-row-ws-from-route')).toBeInTheDocument();
    });

    expect(screen.getByTestId('workspace-row-ws-from-route').textContent ?? '').toMatch(/\/srv\/projects\/routed-workspace/);
    expect(screen.queryByTestId('workspace-browser-empty-state')).not.toBeInTheDocument();
  });

  it('renders the empty state via the real manifest route when zero workspaces are registered', async () => {
    mockWorkspaces = [];

    renderManifestRoute('/clarion-app/llm-client/workspaces');

    await waitFor(() => {
      expect(screen.getByTestId('workspace-browser-empty-state')).toBeInTheDocument();
    });
  });
});
