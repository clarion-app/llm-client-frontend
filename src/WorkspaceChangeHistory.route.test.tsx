import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

/**
 * contracts/frontend-manifest-wiring.md — the no-props-via-route guard,
 * mirroring `WorkspaceBrowser.route.test.tsx`/`McpServerManagement.route.
 * test.tsx`/`RunDiagram.route.test.tsx` exactly: renders
 * `<WorkspaceChangeHistory />` through the actual manifest-declared route
 * (`/clarion-app/llm-client/workspaces/:id/changes`) rather than directly
 * with a hand-passed `id` prop, and asserts real seeded change rows render
 * with the workspace id taken from the URL param alone. The class of test
 * that would have caught spec 070's `RunDiagram`/`runId` defect (a required
 * prop the host never supplies).
 */

vi.mock('./config', () => ({
  backend: {
    url: 'http://localhost:8000',
    token: 'test-token',
    user: { id: 'user-1', name: 'Test User', email: 'test@test.com' },
  },
  updateFrontend: () => {},
}));

let mockChangesByWorkspace: Record<
  string,
  Array<{
    id: string;
    path: string;
    operation: string;
    old_content: string | null;
    old_content_truncated: boolean;
    old_binary: boolean;
    old_size: number | null;
    new_content: string | null;
    new_content_truncated: boolean;
    new_binary: boolean;
    new_size: number | null;
    agent_id: string | null;
    agent_name: string | null;
    conversation_id: string | null;
    created_at: string;
  }>
> = {};

vi.mock('@clarion-app/frontend-base', () => ({
  createBackendConfig: () => ({
    backend: { url: 'http://localhost:8000', user: { id: 'user-1', name: '', email: '' } },
    updateFrontend: () => {},
  }),
  createBaseQuery: () => async (args: any) => {
    const url = typeof args === 'string' ? args : (args?.url ?? '');
    const path = String(url).split('?')[0];

    const match = path.match(/^\/coding-project\/([^/]+)\/changes$/);
    if (match) {
      const rows = mockChangesByWorkspace[match[1]] ?? [];
      return { data: { data: rows, total: rows.length, page: 1, per_page: 50 } };
    }

    return { error: { status: 404, data: { error: 'Coding project not found', code: 'coding_project_not_found' } } };
  },
  registerUserChannelHandler: () => {},
}));

const { workspaceApi } = await import('./workspaceApi');
const { WorkspaceChangeHistory } = await import('./WorkspaceChangeHistory');

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
          <Route path="/clarion-app/llm-client/workspaces/:id/changes" element={<WorkspaceChangeHistory />} />
        </Routes>
      </Provider>
    </MemoryRouter>,
  );
}

describe('WorkspaceChangeHistory — zero-required-props contract', () => {
  it('accepts zero required arguments (function arity 0), matching the manifest contract', () => {
    expect(WorkspaceChangeHistory.length).toBe(0);
  });
});

describe('WorkspaceChangeHistory via its declared route', () => {
  beforeEach(() => {
    mockChangesByWorkspace = {};
  });

  it('renders real seeded change rows for the workspace id taken from the URL param alone', async () => {
    mockChangesByWorkspace['ws-from-route'] = [
      {
        id: 'change-from-route',
        path: 'src/index.ts',
        operation: 'modified',
        old_content: 'export const x = 1;\n',
        old_content_truncated: false,
        old_binary: false,
        old_size: 21,
        new_content: 'export const x = 2;\n',
        new_content_truncated: false,
        new_binary: false,
        new_size: 21,
        agent_id: 'agent-1',
        agent_name: 'Refactor Bot',
        conversation_id: 'conversation-1',
        created_at: '2026-08-18T13:05:00.000000Z',
      },
    ];

    renderManifestRoute('/clarion-app/llm-client/workspaces/ws-from-route/changes');

    await waitFor(() => {
      expect(screen.getByTestId('workspace-change-row-change-from-route')).toBeInTheDocument();
    });

    expect(screen.getByTestId('workspace-change-row-change-from-route').textContent ?? '').toMatch(/src\/index\.ts/);
    expect(screen.queryByTestId('workspace-change-history-not-available')).not.toBeInTheDocument();
  });

  it('renders the empty state via the real manifest route when the workspace has no recorded changes', async () => {
    mockChangesByWorkspace['ws-empty'] = [];

    renderManifestRoute('/clarion-app/llm-client/workspaces/ws-empty/changes');

    await waitFor(() => {
      expect(screen.getByTestId('workspace-change-history-empty')).toBeInTheDocument();
    });
  });
});
