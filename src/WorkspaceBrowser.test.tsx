import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

/**
 * WorkspaceBrowser — US1 (122-workspace-browser-ui, contracts/
 * workspace-list-api.md, contracts/frontend-manifest-wiring.md).
 * Confirmed FAILING: WorkspaceBrowser.tsx does not exist yet (T014 makes
 * this green).
 *
 * Mirrors McpServerManagement.test.tsx's own pattern -- mock
 * createBaseQuery to hand back the real flat `{data, total, page,
 * per_page}` envelope (T006) rather than a bare array.
 */

vi.mock('./config', () => ({
  backend: {
    url: 'http://localhost:8000',
    token: 'test-token',
    user: { id: 'user-1', name: 'Test User', email: 'test@test.com' },
  },
  updateFrontend: () => {},
}));

type MockWorkspace = {
  id: string;
  user_id: string;
  name: string;
  root_path: string;
  test_command: string | null;
  confirmation_relaxed: boolean;
  reachable: boolean;
  created_at: string;
  updated_at: string;
};

let mockWorkspaces: MockWorkspace[] = [];

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

function renderBrowser() {
  const store = createTestStore();
  return render(
    <Provider store={store}>
      <WorkspaceBrowser />
    </Provider>,
  );
}

function makeWorkspace(overrides: Partial<MockWorkspace>): MockWorkspace {
  return {
    id: 'ws-1',
    user_id: 'user-1',
    name: 'My Workspace',
    root_path: '/home/user/projects/my-workspace',
    test_command: null,
    confirmation_relaxed: false,
    reachable: true,
    created_at: '2026-08-18T12:00:00.000000Z',
    updated_at: '2026-08-18T12:00:00.000000Z',
    ...overrides,
  };
}

describe('WorkspaceBrowser — zero-required-props contract', () => {
  it('accepts zero required arguments (arity 0), matching the manifest\'s no-props route', () => {
    expect(WorkspaceBrowser.length).toBe(0);
  });
});

describe('WorkspaceBrowser — listing workspaces (Acceptance Scenarios 1-2)', () => {
  beforeEach(() => {
    mockWorkspaces = [];
  });

  it('renders one row per workspace, each showing its root_path and current confirmation_relaxed state', async () => {
    mockWorkspaces = [
      makeWorkspace({ id: 'ws-healthy', name: 'Healthy Workspace', root_path: '/srv/projects/healthy', confirmation_relaxed: false, reachable: true }),
      makeWorkspace({ id: 'ws-relaxed', name: 'Relaxed Workspace', root_path: '/srv/projects/relaxed', confirmation_relaxed: true, reachable: true }),
    ];

    renderBrowser();

    await waitFor(() => {
      expect(screen.getByTestId('workspace-row-ws-healthy')).toBeInTheDocument();
    });

    expect(screen.getByTestId('workspace-row-ws-healthy').textContent ?? '').toMatch(/\/srv\/projects\/healthy/);
    expect(screen.getByTestId('workspace-confirmation-state-ws-healthy').textContent ?? '').toMatch(/required/i);

    expect(screen.getByTestId('workspace-row-ws-relaxed').textContent ?? '').toMatch(/\/srv\/projects\/relaxed/);
    expect(screen.getByTestId('workspace-confirmation-state-ws-relaxed').textContent ?? '').toMatch(/relaxed/i);
  });

  it('visibly and distinctly flags an unreachable workspace as broken -- not blank, not styled like a healthy row', async () => {
    mockWorkspaces = [
      makeWorkspace({ id: 'ws-healthy', name: 'Healthy Workspace', reachable: true }),
      makeWorkspace({ id: 'ws-broken', name: 'Broken Workspace', root_path: '/srv/projects/gone', reachable: false }),
    ];

    renderBrowser();

    await waitFor(() => {
      expect(screen.getByTestId('workspace-row-ws-broken')).toBeInTheDocument();
    });

    // The broken row carries its own distinct marker...
    const brokenBadge = screen.getByTestId('workspace-broken-badge-ws-broken');
    expect(brokenBadge).toBeInTheDocument();
    expect(brokenBadge.textContent ?? '').toMatch(/broken|unreachable/i);

    // ...while the healthy row does not have that marker at all, and its
    // row is not blank either -- root_path is still present.
    expect(screen.queryByTestId('workspace-broken-badge-ws-healthy')).not.toBeInTheDocument();
    expect(screen.getByTestId('workspace-row-ws-healthy').textContent ?? '').not.toBe('');

    // The two rows must not render identically -- the broken row's own
    // container carries a visibly different marker (data-reachable) a
    // healthy row does not.
    expect(screen.getByTestId('workspace-row-ws-broken').getAttribute('data-reachable')).toBe('false');
    expect(screen.getByTestId('workspace-row-ws-healthy').getAttribute('data-reachable')).toBe('true');
  });
});

describe('WorkspaceBrowser — empty state (Acceptance Scenario 3)', () => {
  it('renders a clear, explicit empty state when zero workspaces are registered, not a blank or error screen', async () => {
    mockWorkspaces = [];

    renderBrowser();

    const emptyState = await waitFor(() => screen.getByTestId('workspace-browser-empty-state'));
    expect(emptyState).toBeInTheDocument();
    expect(emptyState.textContent ?? '').not.toBe('');
    expect(screen.queryByTestId('workspace-list')).not.toBeInTheDocument();
  });
});
