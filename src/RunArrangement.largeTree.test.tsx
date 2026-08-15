import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import { runApi } from './runApi';
import type { ArrangementDelegation, ArrangementResponse, RunSummary } from './types';

/**
 * 106-multi-agent-run-view, Phase 5 (US3), tasks.md T036.
 *
 * A many-contributor/deeply-nested arrangement must load collapsed by
 * default (spec.md US3 Acceptance Scenario 1), let the user expand one
 * branch without disturbing its siblings (Scenario 2), let them collapse it
 * again without losing their place elsewhere in the tree (Scenario 3), and
 * hint at a buried in-progress/failed descendant on a still-collapsed branch
 * (Scenario 4). `RunArrangement.tsx` (T037) implements this with a
 * `Set<string>` of expanded contributor run ids, a frontend-only
 * `AUTO_EXPAND_NODE_THRESHOLD` (15) below which the whole tree auto-expands,
 * and a `hasFailedDescendant`/`hasInProgressDescendant` reduction surfaced
 * as `run-arrangement-collapsed-hint-{runId}` on a collapsed branch
 * (research.md D8).
 *
 * Conventions this file assumes of the implementation (matching T037):
 *   - a node with its own further delegations renders a toggle button
 *     data-testid={`run-arrangement-toggle-${runId}`}, carrying
 *     data-expanded="true"/"false"
 *   - that node's children (the DelegationNode list) render only while
 *     expanded
 *   - a collapsed branch with a failed/in-progress descendant renders
 *     data-testid={`run-arrangement-collapsed-hint-${runId}`}, carrying
 *     data-has-failed / data-has-in-progress
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

function makeDelegation(overrides: Partial<ArrangementDelegation> & { id: string }): ArrangementDelegation {
  return {
    parent_run_id: null,
    parent_action_id: null,
    helper_run_id: null,
    helper_agent_id: 'agt-x',
    helper_agent_name: 'Helper',
    depth: 1,
    status: 'completed',
    batch_id: null,
    started_at: '2026-08-15T10:00:01.000000Z',
    completed_at: '2026-08-15T10:00:04.000000Z',
    ...overrides,
  };
}

/**
 * A wide-and-deep fixture, well over `AUTO_EXPAND_NODE_THRESHOLD` (15):
 *
 *   run-root
 *     -> run-a (branch A)          -> run-a1          -> run-a1-1 (FAILED)
 *     -> run-b (branch B)          -> run-b1 (IN_PROGRESS)
 *     -> run-c .. run-p (14 more single-hop, childless completed contributors)
 *
 * Total runs: root + a + a1 + a1-1 + b + b1 + 14 (c..p) = 21 nodes.
 */
function buildLargeFixture(): ArrangementResponse {
  const runs: Record<string, RunSummary> = {
    'run-root': makeRun({ id: 'run-root' }),
    'run-a': makeRun({ id: 'run-a' }),
    'run-a1': makeRun({ id: 'run-a1' }),
    'run-a1-1': makeRun({ id: 'run-a1-1', end_state: 'failed' }),
    'run-b': makeRun({ id: 'run-b' }),
    'run-b1': makeRun({ id: 'run-b1', end_state: 'in_progress', ended_at: null, duration_ms: null }),
  };

  const delegations: ArrangementDelegation[] = [
    makeDelegation({ id: 'dlg-a', parent_run_id: 'run-root', helper_run_id: 'run-a', helper_agent_name: 'Branch A' }),
    makeDelegation({ id: 'dlg-a1', parent_run_id: 'run-a', helper_run_id: 'run-a1', helper_agent_name: 'Branch A child' }),
    makeDelegation({
      id: 'dlg-a1-1',
      parent_run_id: 'run-a1',
      helper_run_id: 'run-a1-1',
      helper_agent_name: 'Branch A grandchild (failed)',
      status: 'failed',
    }),
    makeDelegation({ id: 'dlg-b', parent_run_id: 'run-root', helper_run_id: 'run-b', helper_agent_name: 'Branch B' }),
    makeDelegation({
      id: 'dlg-b1',
      parent_run_id: 'run-b',
      helper_run_id: 'run-b1',
      helper_agent_name: 'Branch B child (in progress)',
      status: 'in_progress',
      completed_at: null,
    }),
  ];

  const padCount = 14;
  for (let i = 0; i < padCount; i++) {
    const runId = `run-pad-${i}`;
    runs[runId] = makeRun({ id: runId });
    delegations.push(
      makeDelegation({
        id: `dlg-pad-${i}`,
        parent_run_id: 'run-root',
        helper_run_id: runId,
        helper_agent_name: `Padding Helper ${i}`,
      }),
    );
  }

  return {
    root_run_id: 'run-root',
    has_delegations: true,
    truncated: false,
    runs,
    delegations,
  };
}

beforeEach(() => {
  mockArrangementByRunId = {};
  sessionStorage.clear();
});

describe('RunArrangement — large/deeply-nested navigation (T036, US3, research.md D8/D8a)', () => {
  it('collapsed_by_default_above_threshold: a many-contributor/deeply-nested fixture renders collapsed by default', async () => {
    mockArrangementByRunId['run-root'] = buildLargeFixture();

    renderArrangement('run-root');

    await waitFor(() => {
      expect(screen.getByTestId('run-arrangement-entry-point')).toBeInTheDocument();
    });

    // The root's own toggle exists and reports collapsed.
    const rootToggle = screen.getByTestId('run-arrangement-toggle-run-root');
    expect(rootToggle).toHaveAttribute('data-expanded', 'false');

    // None of the root's direct delegation edges are rendered yet -- the
    // whole tree loads as a single entry-point row plus an affordance to
    // drill in, not a wall of detail (spec.md US3 Acceptance Scenario 1).
    expect(screen.queryByTestId('run-arrangement-delegation-dlg-a')).not.toBeInTheDocument();
    expect(screen.queryByTestId('run-arrangement-delegation-dlg-b')).not.toBeInTheDocument();
    expect(screen.queryByTestId('run-arrangement-run-run-a')).not.toBeInTheDocument();
  });

  it('expanding one branch leaves sibling branches untouched', async () => {
    mockArrangementByRunId['run-root'] = buildLargeFixture();

    renderArrangement('run-root');

    await waitFor(() => {
      expect(screen.getByTestId('run-arrangement-toggle-run-root')).toBeInTheDocument();
    });

    // Reveal the first tier.
    fireEvent.click(screen.getByTestId('run-arrangement-toggle-run-root'));

    await waitFor(() => {
      expect(screen.getByTestId('run-arrangement-delegation-dlg-a')).toBeInTheDocument();
    });

    // Branch A itself has further delegations, so it too starts collapsed.
    expect(screen.getByTestId('run-arrangement-toggle-run-a')).toHaveAttribute('data-expanded', 'false');
    expect(screen.getByTestId('run-arrangement-toggle-run-b')).toHaveAttribute('data-expanded', 'false');

    // Expand branch A only.
    fireEvent.click(screen.getByTestId('run-arrangement-toggle-run-a'));

    await waitFor(() => {
      expect(screen.getByTestId('run-arrangement-run-run-a1')).toBeInTheDocument();
    });

    // Branch B's own toggle and contents are untouched by branch A's expansion.
    expect(screen.getByTestId('run-arrangement-toggle-run-b')).toHaveAttribute('data-expanded', 'false');
    expect(screen.queryByTestId('run-arrangement-run-run-b1')).not.toBeInTheDocument();
  });

  it("collapsing an expanded branch preserves the user's position elsewhere in the tree", async () => {
    mockArrangementByRunId['run-root'] = buildLargeFixture();

    renderArrangement('run-root');

    await waitFor(() => {
      expect(screen.getByTestId('run-arrangement-toggle-run-root')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('run-arrangement-toggle-run-root'));

    await waitFor(() => {
      expect(screen.getByTestId('run-arrangement-toggle-run-a')).toBeInTheDocument();
    });

    // Expand both branch A and branch B.
    fireEvent.click(screen.getByTestId('run-arrangement-toggle-run-a'));
    fireEvent.click(screen.getByTestId('run-arrangement-toggle-run-b'));

    await waitFor(() => {
      expect(screen.getByTestId('run-arrangement-run-run-a1')).toBeInTheDocument();
      expect(screen.getByTestId('run-arrangement-run-run-b1')).toBeInTheDocument();
    });

    // Now collapse branch A again.
    fireEvent.click(screen.getByTestId('run-arrangement-toggle-run-a'));

    await waitFor(() => {
      expect(screen.queryByTestId('run-arrangement-run-run-a1')).not.toBeInTheDocument();
    });

    // Branch B's expanded position is preserved -- collapsing A had no effect on it.
    expect(screen.getByTestId('run-arrangement-toggle-run-b')).toHaveAttribute('data-expanded', 'true');
    expect(screen.getByTestId('run-arrangement-run-run-b1')).toBeInTheDocument();
  });

  it('a collapsed branch containing a failed or in-progress descendant visibly hints at it', async () => {
    mockArrangementByRunId['run-root'] = buildLargeFixture();

    renderArrangement('run-root');

    await waitFor(() => {
      expect(screen.getByTestId('run-arrangement-toggle-run-root')).toBeInTheDocument();
    });

    // Reveal the first tier; branch A (failed grandchild) and branch B
    // (in-progress child) both stay collapsed at this point.
    fireEvent.click(screen.getByTestId('run-arrangement-toggle-run-root'));

    await waitFor(() => {
      expect(screen.getByTestId('run-arrangement-toggle-run-a')).toBeInTheDocument();
    });

    expect(screen.getByTestId('run-arrangement-toggle-run-a')).toHaveAttribute('data-expanded', 'false');
    const hintA = screen.getByTestId('run-arrangement-collapsed-hint-run-a');
    expect(hintA).toHaveAttribute('data-has-failed', 'true');

    expect(screen.getByTestId('run-arrangement-toggle-run-b')).toHaveAttribute('data-expanded', 'false');
    const hintB = screen.getByTestId('run-arrangement-collapsed-hint-run-b');
    expect(hintB).toHaveAttribute('data-has-in-progress', 'true');

    // Once branch A is expanded, the hint on branch A's own row disappears
    // -- run-a1 is now directly visible instead.
    fireEvent.click(screen.getByTestId('run-arrangement-toggle-run-a'));

    await waitFor(() => {
      expect(screen.getByTestId('run-arrangement-run-run-a1')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('run-arrangement-collapsed-hint-run-a')).not.toBeInTheDocument();

    // run-a1 itself has its own further delegation (run-a1-1, failed), so it
    // is its own collapsed branch, carrying its own hint -- the failed
    // grandchild is not yet directly visible, but the branch above it still
    // surfaces that something inside failed.
    expect(screen.getByTestId('run-arrangement-toggle-run-a1')).toHaveAttribute('data-expanded', 'false');
    expect(screen.getByTestId('run-arrangement-collapsed-hint-run-a1')).toHaveAttribute('data-has-failed', 'true');
    expect(screen.queryByTestId('run-arrangement-run-run-a1-1')).not.toBeInTheDocument();

    // Expanding run-a1 finally reveals the failed leaf directly.
    fireEvent.click(screen.getByTestId('run-arrangement-toggle-run-a1'));

    await waitFor(() => {
      expect(screen.getByTestId('run-arrangement-run-run-a1-1')).toBeInTheDocument();
    });
    expect(screen.getByTestId('run-arrangement-run-run-a1-1')).toHaveAttribute('data-end-state', 'failed');
  });
});
