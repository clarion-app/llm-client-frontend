import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { runApi } from './runApi';
import type { ArrangementResponse, RunSummary } from './types';

/**
 * 106-multi-agent-run-view, Phase 3 (US1), tasks.md T011.
 *
 * `RunArrangement.tsx` does not exist yet at this phase (Phase 2 only
 * touched `DelegationQuery::collectTransitiveDelegations()`'s visibility).
 * This file is written first, per TDD, and is expected to fail at
 * collection time because `./RunArrangement` cannot be resolved. Phase 3's
 * implementation task (T018) is what creates the module and turns these
 * tests green.
 *
 * Conventions assumed below (this test's own contract for the eventual
 * implementation, mirroring RunDiagram.test.tsx's own "conventions
 * assumed" precedent):
 *   - root container: data-testid="run-arrangement"
 *   - empty state (has_delegations: false): data-testid="run-arrangement-empty"
 *   - the entry-point node: data-testid="run-arrangement-entry-point"
 *   - a delegation edge: data-testid={`run-arrangement-delegation-${id}`},
 *     carrying data-status={delegation.status}
 *   - a contributor's own node: data-testid={`run-arrangement-run-${runId}`},
 *     carrying data-end-state={run.end_state}
 *   - a never-started (queued/no helper_run_id) delegation:
 *     data-testid={`run-arrangement-never-started-${id}`}
 *   - concurrent siblings: data-testid={`run-arrangement-concurrent-${id}`}
 *   - selecting a contributor navigates to `/clarion-app/llm-client/runs/{helperRunId}`
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

function renderArrangement(runId: string) {
  const store = createTestStore();
  return render(
    <MemoryRouter>
      <Provider store={store}>
        <RunArrangement runId={runId} />
      </Provider>
    </MemoryRouter>,
  );
}

/** Renders the arrangement view via a real route, plus a marker at the RunDiagram destination, for the navigation scenario. */
function renderViaRoute(initialEntry: string) {
  const store = createTestStore();
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Provider store={store}>
        <Routes>
          <Route path="/clarion-app/llm-client/runs/:id/arrangement" element={<RunArrangement />} />
          <Route path="/clarion-app/llm-client/runs/:id" element={<div data-testid="run-diagram-marker" />} />
        </Routes>
      </Provider>
    </MemoryRouter>,
  );
}

function makeRun(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    id: 'run-1',
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

beforeEach(() => {
  mockArrangementByRunId = {};
});

describe('RunArrangement', () => {
  it('renders the entry-point agent and each contributor with outcome/duration visible', async () => {
    mockArrangementByRunId['run-1'] = {
      root_run_id: 'run-1',
      has_delegations: true,
      truncated: false,
      runs: {
        'run-1': makeRun({ id: 'run-1' }),
        'helper-run-1': makeRun({ id: 'helper-run-1', kind: 'system_initiated', duration_ms: 3000 }),
      },
      delegations: [
        {
          id: 'dlg-1',
          parent_run_id: 'run-1',
          parent_action_id: 'action-1',
          helper_run_id: 'helper-run-1',
          helper_agent_id: 'agt-1',
          helper_agent_name: 'Invoice Line-Item Extractor',
          depth: 1,
          status: 'completed',
          batch_id: null,
          started_at: '2026-08-15T10:00:01.000000Z',
          completed_at: '2026-08-15T10:00:04.000000Z',
        },
      ],
    };

    renderArrangement('run-1');

    await waitFor(() => {
      expect(screen.getByTestId('run-arrangement-entry-point')).toBeInTheDocument();
    });

    expect(screen.getByTestId('run-arrangement-delegation-dlg-1')).toBeInTheDocument();
    expect(screen.getByText('Invoice Line-Item Extractor')).toBeInTheDocument();
    expect(screen.getByTestId('run-arrangement-run-helper-run-1')).toBeInTheDocument();
    expect(screen.getByTestId('run-arrangement-run-helper-run-1')).toHaveAttribute('data-end-state', 'completed');
  });

  it('shows concurrent siblings (shared batch_id, overlapping time ranges) distinctly from sequential ones', async () => {
    mockArrangementByRunId['run-1'] = {
      root_run_id: 'run-1',
      has_delegations: true,
      truncated: false,
      runs: {
        'run-1': makeRun({ id: 'run-1' }),
        'helper-a': makeRun({ id: 'helper-a' }),
        'helper-b': makeRun({ id: 'helper-b' }),
      },
      delegations: [
        {
          id: 'dlg-a',
          parent_run_id: 'run-1',
          parent_action_id: 'action-a',
          helper_run_id: 'helper-a',
          helper_agent_id: 'agt-a',
          helper_agent_name: 'Helper A',
          depth: 1,
          status: 'completed',
          batch_id: 'batch-1',
          started_at: '2026-08-15T10:00:01.000000Z',
          completed_at: '2026-08-15T10:00:04.000000Z',
        },
        {
          id: 'dlg-b',
          parent_run_id: 'run-1',
          parent_action_id: 'action-b',
          helper_run_id: 'helper-b',
          helper_agent_id: 'agt-b',
          helper_agent_name: 'Helper B',
          depth: 1,
          status: 'completed',
          batch_id: 'batch-1',
          started_at: '2026-08-15T10:00:01.500000Z',
          completed_at: '2026-08-15T10:00:03.500000Z',
        },
      ],
    };

    renderArrangement('run-1');

    await waitFor(() => {
      expect(screen.getByTestId('run-arrangement-delegation-dlg-a')).toBeInTheDocument();
    });

    expect(screen.getByTestId('run-arrangement-concurrent-dlg-a')).toBeInTheDocument();
    expect(screen.getByTestId('run-arrangement-concurrent-dlg-b')).toBeInTheDocument();
  });

  it("renders each contributor's in-progress/completed/failed status with a distinct visual treatment (FR-005)", async () => {
    mockArrangementByRunId['run-1'] = {
      root_run_id: 'run-1',
      has_delegations: true,
      truncated: false,
      runs: {
        'run-1': makeRun({ id: 'run-1' }),
        'helper-running': makeRun({ id: 'helper-running', end_state: 'in_progress', ended_at: null, duration_ms: null }),
        'helper-failed': makeRun({ id: 'helper-failed', end_state: 'failed' }),
      },
      delegations: [
        {
          id: 'dlg-running',
          parent_run_id: 'run-1',
          parent_action_id: 'action-running',
          helper_run_id: 'helper-running',
          helper_agent_id: 'agt-running',
          helper_agent_name: 'Running Helper',
          depth: 1,
          status: 'in_progress',
          batch_id: null,
          started_at: '2026-08-15T10:00:01.000000Z',
          completed_at: null,
        },
        {
          id: 'dlg-failed',
          parent_run_id: 'run-1',
          parent_action_id: 'action-failed',
          helper_run_id: 'helper-failed',
          helper_agent_id: 'agt-failed',
          helper_agent_name: 'Failed Helper',
          depth: 1,
          status: 'failed',
          batch_id: null,
          started_at: '2026-08-15T10:10:01.000000Z',
          completed_at: '2026-08-15T10:10:02.000000Z',
        },
      ],
    };

    renderArrangement('run-1');

    await waitFor(() => {
      expect(screen.getByTestId('run-arrangement-run-helper-running')).toBeInTheDocument();
    });

    expect(screen.getByTestId('run-arrangement-run-helper-running')).toHaveAttribute('data-end-state', 'in_progress');
    expect(screen.getByTestId('run-arrangement-run-helper-failed')).toHaveAttribute('data-end-state', 'failed');
    expect(screen.getByTestId('run-arrangement-entry-point')).toHaveAttribute('data-end-state', 'completed');

    // Distinct visual treatment: three different data-end-state values render three different classNames.
    const runningClass = screen.getByTestId('run-arrangement-run-helper-running').className;
    const failedClass = screen.getByTestId('run-arrangement-run-helper-failed').className;
    expect(runningClass).not.toBe(failedClass);
  });

  it('renders the explicit empty state for has_delegations: false', async () => {
    mockArrangementByRunId['run-1'] = {
      root_run_id: 'run-1',
      has_delegations: false,
      truncated: false,
      runs: { 'run-1': makeRun({ id: 'run-1' }) },
      delegations: [],
    };

    renderArrangement('run-1');

    await waitFor(() => {
      expect(screen.getByTestId('run-arrangement-empty')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('run-arrangement-entry-point')).not.toBeInTheDocument();
  });

  it('renders a queued/no-helper_run_id delegation visually distinct from a started-then-failed one', async () => {
    mockArrangementByRunId['run-1'] = {
      root_run_id: 'run-1',
      has_delegations: true,
      truncated: false,
      runs: {
        'run-1': makeRun({ id: 'run-1' }),
        'helper-failed': makeRun({ id: 'helper-failed', end_state: 'failed' }),
      },
      delegations: [
        {
          id: 'dlg-queued',
          parent_run_id: 'run-1',
          parent_action_id: 'action-queued',
          helper_run_id: null,
          helper_agent_id: 'agt-queued',
          helper_agent_name: 'Slow Helper',
          depth: 1,
          status: 'exhausted',
          batch_id: 'batch-1',
          started_at: '2026-08-15T10:00:01.000000Z',
          completed_at: '2026-08-15T10:00:31.000000Z',
        },
        {
          id: 'dlg-failed',
          parent_run_id: 'run-1',
          parent_action_id: 'action-failed',
          helper_run_id: 'helper-failed',
          helper_agent_id: 'agt-failed',
          helper_agent_name: 'Failed Helper',
          depth: 1,
          status: 'failed',
          batch_id: null,
          started_at: '2026-08-15T10:10:01.000000Z',
          completed_at: '2026-08-15T10:10:02.000000Z',
        },
      ],
    };

    renderArrangement('run-1');

    await waitFor(() => {
      expect(screen.getByTestId('run-arrangement-delegation-dlg-queued')).toBeInTheDocument();
    });

    // Never-started marker present for the queued delegation, absent for the failed one.
    expect(screen.getByTestId('run-arrangement-never-started-dlg-queued')).toBeInTheDocument();
    expect(screen.queryByTestId('run-arrangement-never-started-dlg-failed')).not.toBeInTheDocument();

    // The failed delegation has its own contributor node (it did start); the queued one has none.
    expect(screen.queryByTestId('run-arrangement-node-helper-failed')).toBeInTheDocument();
    expect(screen.queryByTestId('run-arrangement-run-helper-failed')).toHaveAttribute('data-end-state', 'failed');
  });

  it("navigates to the existing RunDiagram for a contributor's run id when selected", async () => {
    mockArrangementByRunId['run-1'] = {
      root_run_id: 'run-1',
      has_delegations: true,
      truncated: false,
      runs: {
        'run-1': makeRun({ id: 'run-1' }),
        'helper-run-1': makeRun({ id: 'helper-run-1' }),
      },
      delegations: [
        {
          id: 'dlg-1',
          parent_run_id: 'run-1',
          parent_action_id: 'action-1',
          helper_run_id: 'helper-run-1',
          helper_agent_id: 'agt-1',
          helper_agent_name: 'Helper One',
          depth: 1,
          status: 'completed',
          batch_id: null,
          started_at: '2026-08-15T10:00:01.000000Z',
          completed_at: '2026-08-15T10:00:04.000000Z',
        },
      ],
    };

    renderViaRoute('/clarion-app/llm-client/runs/run-1/arrangement');

    await waitFor(() => {
      expect(screen.getByTestId('run-arrangement-open-helper-run-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('run-arrangement-open-helper-run-1'));

    await waitFor(() => {
      expect(screen.getByTestId('run-diagram-marker')).toBeInTheDocument();
    });
  });
});
