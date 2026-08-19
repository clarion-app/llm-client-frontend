import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import { workspaceApi } from './workspaceApi';
import type { CodingWorkspaceChangeType } from './types';

/**
 * WorkspaceChangeHistory.tsx does not exist yet -- this file is written
 * first, per TDD, and is expected to fail at collection time because the
 * dynamic import below cannot resolve `./WorkspaceChangeHistory`.
 * Implementing the component (T052) is what turns these cases green.
 *
 * Conventions this test pins for the eventual implementation (none are
 * fixed by the design docs):
 *   - root container:        data-testid="workspace-change-history"
 *   - empty state:            data-testid="workspace-change-history-empty"
 *   - a change row:            data-testid={`workspace-change-row-${change.id}`}
 *   - a row's file path:       data-testid={`workspace-change-path-${change.id}`}
 *   - a row's timestamp:       data-testid={`workspace-change-timestamp-${change.id}`}
 *   - a row's operation:       data-testid={`workspace-change-operation-${change.id}`}
 *   - a row's attribution:     data-testid={`workspace-change-attribution-${change.id}`}
 *   - "Load more" affordance: data-testid="workspace-change-history-load-more"
 */

vi.mock('./config', () => ({
  backend: {
    url: 'http://localhost:8000',
    token: 'test-token',
    user: { id: 'user-1', name: 'Test User', email: 'test@test.com' },
  },
  updateFrontend: () => {},
}));

let mockChangesByWorkspace: Record<string, CodingWorkspaceChangeType[]> = {};
let mockTotalOverride: number | null = null;
let mockPageTwoExtra: CodingWorkspaceChangeType[] = [];

vi.mock('@clarion-app/frontend-base', () => ({
  createBackendConfig: () => ({
    backend: { url: 'http://localhost:8000', user: { id: 'user-1', name: '', email: '' } },
    updateFrontend: () => {},
  }),
  createBaseQuery: () => async (args: any) => {
    const url = typeof args === 'string' ? args : (args?.url ?? '');
    const [path, queryString] = String(url).split('?');

    const match = path.match(/^\/coding-project\/([^/]+)\/changes$/);
    if (match) {
      const workspaceId = match[1];
      const page = queryString ? Number(new URLSearchParams(queryString).get('page') ?? '1') : 1;
      const firstPage = mockChangesByWorkspace[workspaceId] ?? [];

      if (page > 1) {
        return {
          data: {
            data: mockPageTwoExtra,
            total: mockTotalOverride ?? firstPage.length + mockPageTwoExtra.length,
            page,
            per_page: 50,
          },
        };
      }

      return {
        data: {
          data: firstPage,
          total: mockTotalOverride ?? firstPage.length,
          page: 1,
          per_page: 50,
        },
      };
    }

    return { error: { status: 404, data: { error: 'Coding project not found', code: 'coding_project_not_found' } } };
  },
  registerUserChannelHandler: () => {},
}));

// Dynamic import so mocks are in place before module evaluation. This is
// expected to fail (module not found) before T052 lands.
const { WorkspaceChangeHistory } = await import('./WorkspaceChangeHistory');

function createTestStore() {
  return configureStore({
    reducer: {
      [workspaceApi.reducerPath]: workspaceApi.reducer,
    },
    middleware: (getDefault) => getDefault().concat(workspaceApi.middleware),
  });
}

function renderHistory(id: string) {
  const store = createTestStore();
  return render(
    <MemoryRouter>
      <Provider store={store}>
        <WorkspaceChangeHistory id={id} />
      </Provider>
    </MemoryRouter>,
  );
}

function makeChange(overrides: Partial<CodingWorkspaceChangeType> = {}): CodingWorkspaceChangeType {
  return {
    id: 'change-1',
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
    ...overrides,
  };
}

describe('WorkspaceChangeHistory — zero-required-props contract', () => {
  it('accepts zero required arguments (function arity 0), matching the manifest contract (mirrors RunDiagram)', () => {
    expect(WorkspaceChangeHistory.length).toBe(0);
  });
});

describe('WorkspaceChangeHistory', () => {
  beforeEach(() => {
    mockChangesByWorkspace = {};
    mockTotalOverride = null;
    mockPageTwoExtra = [];
  });

  it('renders each change with its file path, timestamp, and operation', async () => {
    mockChangesByWorkspace['ws-1'] = [makeChange()];

    renderHistory('ws-1');

    await waitFor(() => {
      expect(screen.getByTestId('workspace-change-row-change-1')).toBeInTheDocument();
    });

    expect(screen.getByTestId('workspace-change-path-change-1').textContent).toMatch(/src\/index\.ts/);
    expect(screen.getByTestId('workspace-change-timestamp-change-1').textContent).toMatch(/2026-08-18T13:05:00/);
    expect(screen.getByTestId('workspace-change-operation-change-1').textContent ?? '').toMatch(/modified/i);
  });

  it('renders the responsible agent and conversation when attributed', async () => {
    mockChangesByWorkspace['ws-1'] = [
      makeChange({ agent_name: 'Refactor Bot', conversation_id: 'conversation-1' }),
    ];

    renderHistory('ws-1');

    await waitFor(() => {
      expect(screen.getByTestId('workspace-change-attribution-change-1')).toBeInTheDocument();
    });

    const attribution = screen.getByTestId('workspace-change-attribution-change-1').textContent ?? '';
    expect(attribution).toMatch(/Refactor Bot/);
    expect(attribution).toMatch(/conversation-1/);
    expect(attribution).not.toMatch(/unattributed/i);
  });

  it('shows an explicit "unattributed" state when agent and conversation are both null', async () => {
    mockChangesByWorkspace['ws-1'] = [
      makeChange({ id: 'change-unattributed', agent_id: null, agent_name: null, conversation_id: null }),
    ];

    renderHistory('ws-1');

    await waitFor(() => {
      expect(screen.getByTestId('workspace-change-attribution-change-unattributed')).toBeInTheDocument();
    });

    expect(screen.getByTestId('workspace-change-attribution-change-unattributed').textContent ?? '').toMatch(/unattributed/i);
  });

  it('shows enough before/after content to distinguish a created entry from merely "a file was touched"', async () => {
    mockChangesByWorkspace['ws-1'] = [
      makeChange({
        id: 'change-created',
        operation: 'created',
        old_content: null,
        old_size: null,
        new_content: 'brand new file\n',
        new_size: 15,
      }),
    ];

    renderHistory('ws-1');

    await waitFor(() => {
      expect(screen.getByTestId('workspace-change-row-change-created')).toBeInTheDocument();
    });

    const row = screen.getByTestId('workspace-change-row-change-created');
    expect(row.textContent ?? '').toMatch(/brand new file/);
    // A created entry has nothing "before" -- no prior content block should
    // claim to show one.
    expect(screen.queryByTestId('workspace-change-old-content-change-created')).not.toBeInTheDocument();
  });

  it('shows the pre-deletion content for a deleted entry', async () => {
    mockChangesByWorkspace['ws-1'] = [
      makeChange({
        id: 'change-deleted',
        operation: 'deleted',
        old_content: 'about to be gone\n',
        old_size: 17,
        new_content: null,
        new_size: null,
      }),
    ];

    renderHistory('ws-1');

    await waitFor(() => {
      expect(screen.getByTestId('workspace-change-row-change-deleted')).toBeInTheDocument();
    });

    const row = screen.getByTestId('workspace-change-row-change-deleted');
    expect(row.textContent ?? '').toMatch(/about to be gone/);
    expect(screen.queryByTestId('workspace-change-new-content-change-deleted')).not.toBeInTheDocument();
  });

  it('distinguishes modified from created/deleted by showing both before and after content', async () => {
    mockChangesByWorkspace['ws-1'] = [makeChange({ id: 'change-modified', operation: 'modified' })];

    renderHistory('ws-1');

    await waitFor(() => {
      expect(screen.getByTestId('workspace-change-old-content-change-modified')).toBeInTheDocument();
    });
    expect(screen.getByTestId('workspace-change-new-content-change-modified')).toBeInTheDocument();
  });

  it('preserves most-recent-first ordering exactly as the API returns it', async () => {
    mockChangesByWorkspace['ws-1'] = [
      makeChange({ id: 'change-newer', created_at: '2026-08-18T13:05:00.000000Z' }),
      makeChange({ id: 'change-older', created_at: '2026-08-17T08:00:00.000000Z' }),
    ];

    renderHistory('ws-1');

    await waitFor(() => {
      expect(screen.getByTestId('workspace-change-list')).toBeInTheDocument();
    });

    const rows = screen.getAllByTestId(/^workspace-change-row-/);
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual([
      'workspace-change-row-change-newer',
      'workspace-change-row-change-older',
    ]);
  });

  it('shows a clear empty state when the workspace has no recorded changes', async () => {
    mockChangesByWorkspace['ws-1'] = [];

    renderHistory('ws-1');

    await waitFor(() => {
      expect(screen.getByTestId('workspace-change-history-empty')).toBeInTheDocument();
    });
  });

  it('offers a "Load more" affordance and accumulates a second page against the flat envelope, not PaginatedEnvelope<T>', async () => {
    mockChangesByWorkspace['ws-1'] = [makeChange({ id: 'change-page-1' })];
    mockPageTwoExtra = [makeChange({ id: 'change-page-2', created_at: '2026-08-16T08:00:00.000000Z' })];
    mockTotalOverride = 2;

    renderHistory('ws-1');

    await waitFor(() => {
      expect(screen.getByTestId('workspace-change-history-load-more')).toBeInTheDocument();
    });

    screen.getByTestId('workspace-change-history-load-more').click();

    await waitFor(() => {
      expect(screen.getByTestId('workspace-change-row-change-page-2')).toBeInTheDocument();
    });

    // Both pages' rows are now present -- accumulated, not replaced.
    expect(screen.getByTestId('workspace-change-row-change-page-1')).toBeInTheDocument();
    // total (2) reached -- the affordance should no longer be offered.
    expect(screen.queryByTestId('workspace-change-history-load-more')).not.toBeInTheDocument();
  });
});
