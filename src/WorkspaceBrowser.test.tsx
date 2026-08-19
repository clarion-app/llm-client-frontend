import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';

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
    const method = typeof args === 'string' ? 'GET' : (args?.method ?? 'GET');
    const body = typeof args === 'string' ? undefined : args?.body;
    const path = String(url).split('?')[0];

    if (path === '/coding-project' && method === 'GET') {
      return { data: { data: mockWorkspaces, total: mockWorkspaces.length, page: 1, per_page: 50 } };
    }

    // POST /coding-project -- US2/AS3, reuses store() unmodified.
    if (path === '/coding-project' && method === 'POST') {
      const created: MockWorkspace = {
        id: `ws-created-${mockWorkspaces.length + 1}`,
        user_id: 'user-1',
        name: body?.name ?? '',
        root_path: body?.root_path ?? '',
        test_command: body?.test_command ?? null,
        confirmation_relaxed: false,
        reachable: true,
        created_at: '2026-08-18T12:00:00.000000Z',
        updated_at: '2026-08-18T12:00:00.000000Z',
      };
      mockWorkspaces = [...mockWorkspaces, created];
      return { data: created };
    }

    // PATCH /coding-project/{id}/confirmation-setting -- US2/AS1-2,
    // reuses updateConfirmationSetting() unmodified.
    const confirmationMatch = path.match(/^\/coding-project\/([^/]+)\/confirmation-setting$/);
    if (confirmationMatch && method === 'PATCH') {
      const id = confirmationMatch[1];
      mockWorkspaces = mockWorkspaces.map((w) => (w.id === id ? { ...w, confirmation_relaxed: Boolean(body?.relaxed) } : w));
      const updated = mockWorkspaces.find((w) => w.id === id);
      return { data: updated };
    }

    // DELETE /coding-project/{id} -- US2/AS3, reuses destroy() unmodified.
    const deleteMatch = path.match(/^\/coding-project\/([^/]+)$/);
    if (deleteMatch && method === 'DELETE') {
      const id = deleteMatch[1];
      mockWorkspaces = mockWorkspaces.filter((w) => w.id !== id);
      return { data: {} };
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
    <MemoryRouter>
      <Provider store={store}>
        <WorkspaceBrowser />
      </Provider>
    </MemoryRouter>,
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

  it('links each row to its own change history route (US3, contracts/frontend-manifest-wiring.md)', async () => {
    mockWorkspaces = [makeWorkspace({ id: 'ws-history', root_path: '/srv/projects/history' })];

    renderBrowser();

    await waitFor(() => {
      expect(screen.getByTestId('workspace-change-history-link-ws-history')).toBeInTheDocument();
    });

    expect(screen.getByTestId('workspace-change-history-link-ws-history').getAttribute('href')).toBe(
      '/clarion-app/llm-client/workspaces/ws-history/changes',
    );
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

/**
 * US2 (122-workspace-browser-ui, FR-004/FR-005, Acceptance Scenarios
 * 1-3). Confirmed FAILING before T025: WorkspaceBrowser.tsx has no
 * confirmation toggle, remove action, or add-workspace form yet.
 */
describe('WorkspaceBrowser — confirmation toggle (FR-004, US2)', () => {
  beforeEach(() => {
    mockWorkspaces = [];
  });

  it('toggling a row\'s confirmation requirement calls the PATCH mutation and reflects the new state immediately', async () => {
    const { fireEvent } = await import('@testing-library/react');

    mockWorkspaces = [makeWorkspace({ id: 'ws-toggle', confirmation_relaxed: false })];

    renderBrowser();

    await waitFor(() => {
      expect(screen.getByTestId('workspace-confirmation-state-ws-toggle').textContent ?? '').toMatch(/required/i);
    });

    fireEvent.click(screen.getByTestId('workspace-confirmation-toggle-ws-toggle'));

    await waitFor(() => {
      expect(screen.getByTestId('workspace-confirmation-state-ws-toggle').textContent ?? '').toMatch(/relaxed/i);
    });

    // Toggling again restores the default requirement.
    fireEvent.click(screen.getByTestId('workspace-confirmation-toggle-ws-toggle'));

    await waitFor(() => {
      expect(screen.getByTestId('workspace-confirmation-state-ws-toggle').textContent ?? '').toMatch(/required/i);
    });
  });
});

describe('WorkspaceBrowser — remove action behind ConfirmDialog (FR-005, US2/AS3)', () => {
  beforeEach(() => {
    mockWorkspaces = [];
  });

  it('clicking "Remove" shows a ConfirmDialog, not an immediate delete', async () => {
    const { fireEvent } = await import('@testing-library/react');

    mockWorkspaces = [makeWorkspace({ id: 'ws-remove-1' })];

    renderBrowser();

    await waitFor(() => {
      expect(screen.getByTestId('workspace-row-ws-remove-1')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId('workspace-remove-toggle-ws-remove-1'));

    expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    expect(screen.getByTestId('workspace-row-ws-remove-1')).toBeInTheDocument();
  });

  it('confirming removal calls the DELETE mutation and the row disappears from the list', async () => {
    const { fireEvent } = await import('@testing-library/react');

    mockWorkspaces = [makeWorkspace({ id: 'ws-remove-2' })];

    renderBrowser();

    await waitFor(() => {
      expect(screen.getByTestId('workspace-row-ws-remove-2')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('workspace-remove-toggle-ws-remove-2'));
    fireEvent.click(screen.getByTestId('confirm-dialog').querySelector('button:last-of-type') as HTMLElement);

    await waitFor(() => {
      expect(screen.queryByTestId('workspace-row-ws-remove-2')).not.toBeInTheDocument();
    });
    expect(mockWorkspaces.find((w) => w.id === 'ws-remove-2')).toBeUndefined();
  });

  it('canceling leaves the workspace untouched and still listed', async () => {
    const { fireEvent } = await import('@testing-library/react');

    mockWorkspaces = [makeWorkspace({ id: 'ws-remove-3' })];

    renderBrowser();

    await waitFor(() => {
      expect(screen.getByTestId('workspace-row-ws-remove-3')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('workspace-remove-toggle-ws-remove-3'));
    expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('confirm-dialog').querySelector('button:first-of-type') as HTMLElement);

    expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('workspace-row-ws-remove-3')).toBeInTheDocument();
    expect(mockWorkspaces.find((w) => w.id === 'ws-remove-3')).toBeDefined();
  });
});

describe('WorkspaceBrowser — add workspace form (US2/AS3)', () => {
  beforeEach(() => {
    mockWorkspaces = [];
  });

  it('submitting the add-workspace form calls the POST mutation and the new workspace appears without further action', async () => {
    const { fireEvent } = await import('@testing-library/react');

    renderBrowser();

    await waitFor(() => {
      expect(screen.getByTestId('workspace-browser-empty-state')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('workspace-add-toggle'));

    const form = screen.getByTestId('add-workspace-form');
    expect(form).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'New Workspace' } });
    fireEvent.change(screen.getByLabelText(/root path|path/i), { target: { value: '/srv/projects/new' } });
    fireEvent.submit(form.querySelector('form') as HTMLFormElement);

    await waitFor(() => {
      expect(screen.queryByTestId('workspace-browser-empty-state')).not.toBeInTheDocument();
    });
    expect(mockWorkspaces.some((w) => w.name === 'New Workspace')).toBe(true);
  });
});
