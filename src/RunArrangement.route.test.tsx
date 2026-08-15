import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { runApi } from './runApi';
import type { ArrangementResponse, RunSummary } from './types';

/**
 * 106-multi-agent-run-view, Phase 3 (US1), tasks.md T012.
 *
 * Renders the manifest's actual `/clarion-app/llm-client/runs/:id/arrangement`
 * route entry with the real component and no manually-supplied `runId`
 * prop, mirroring `RunDiagram.route.test.tsx` (070's own reconciliation-fix
 * precedent — a routed component receives no props, so its id must resolve
 * via `useParams()`; this feature never reproduces that defect class).
 */

vi.mock('./config', () => ({
  backend: {
    url: 'http://localhost:8000',
    token: 'test-token',
    user: { id: 'user-1', name: 'Test User', email: 'test@test.com' },
  },
  updateFrontend: () => {},
}));

let mockArrangementByRunId: Record<string, ArrangementResponse> = {};

vi.mock('@clarion-app/frontend-base', () => ({
  createBackendConfig: () => ({
    backend: { url: 'http://localhost:8000', user: { id: 'user-1', name: '', email: '' } },
    updateFrontend: () => {},
  }),
  createBaseQuery: () => async (args: any) => {
    const url = typeof args === 'string' ? args : (args?.url ?? '');
    const path = String(url).split('?')[0];

    const arrangementMatch = path.match(/^\/agent-runs\/([^/]+)\/arrangement$/);
    if (arrangementMatch) {
      const arrangement = mockArrangementByRunId[arrangementMatch[1]];
      if (!arrangement) {
        return { error: { status: 404, data: { error: 'Run not found', code: 'run_not_found' } } };
      }
      return { data: arrangement };
    }

    return { data: {} };
  },
  registerUserChannelHandler: () => {},
}));

const { RunArrangement } = await import('./RunArrangement');

function createTestStore() {
  return configureStore({
    reducer: {
      [runApi.reducerPath]: runApi.reducer,
    },
    middleware: (getDefault) => getDefault().concat(runApi.middleware),
  });
}

function renderManifestRoute(initialEntry: string) {
  const store = createTestStore();
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Provider store={store}>
        <Routes>
          <Route path="/clarion-app/llm-client/runs/:id/arrangement" element={<RunArrangement />} />
        </Routes>
      </Provider>
    </MemoryRouter>,
  );
}

function makeRun(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    id: 'run-from-route',
    kind: 'interactive',
    end_state: 'completed',
    end_reason: null,
    started_at: '2026-08-15T10:00:00.000000Z',
    ended_at: '2026-08-15T10:00:10.000000Z',
    duration_ms: 10000,
    step_count: 1,
    action_count: 1,
    conversation_id: null,
    ...overrides,
  };
}

describe('RunArrangement via its declared route', () => {
  it('renders the arrangement named by the :id route param when mounted with no props', async () => {
    mockArrangementByRunId = {
      'run-from-route': {
        root_run_id: 'run-from-route',
        has_delegations: true,
        truncated: false,
        runs: {
          'run-from-route': makeRun(),
          'helper-run-from-route': makeRun({ id: 'helper-run-from-route' }),
        },
        delegations: [
          {
            id: 'dlg-from-route',
            parent_run_id: 'run-from-route',
            parent_action_id: 'action-1',
            helper_run_id: 'helper-run-from-route',
            helper_agent_id: 'agt-1',
            helper_agent_name: 'Route Helper',
            depth: 1,
            status: 'completed',
            batch_id: null,
            started_at: '2026-08-15T10:00:01.000000Z',
            completed_at: '2026-08-15T10:00:04.000000Z',
          },
        ],
      },
    };

    renderManifestRoute('/clarion-app/llm-client/runs/run-from-route/arrangement');

    await waitFor(() => {
      expect(screen.getByTestId('run-arrangement')).toBeInTheDocument();
    });

    // The arrangement resolved the id from the route, not from a prop: the
    // delegation for that specific run rendered, rather than the uniform
    // "not available" state a missing/unknown id produces.
    await waitFor(() => {
      expect(screen.getByTestId('run-arrangement-delegation-dlg-from-route')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('run-arrangement-not-available')).not.toBeInTheDocument();
  });

  it('renders the uniform not-available state for an unknown route id, with no props supplied', async () => {
    mockArrangementByRunId = {};

    renderManifestRoute('/clarion-app/llm-client/runs/unknown-run/arrangement');

    await waitFor(() => {
      expect(screen.getByTestId('run-arrangement-not-available')).toBeInTheDocument();
    });
  });
});
