import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { runApi } from './runApi';
import type { RunSummary, StepSummary, ActionSummary, Delegation } from './types';

/**
 * 098-delegation-protocol, Phase 4 (US3), tasks.md T027.
 *
 * contracts/delegation-protocol-api.md §4 (also data-model.md §7): a
 * `RunDiagram` action row whose `action_type === 'delegation'` renders a
 * drill-down link into the helper's own run it produced, when (and only
 * when) a `Delegation` row naming this exact action as its
 * `parent_action_id` has already been recorded with a `helper_run_id`.
 * `RunDiagram` is described as fetching `useGetDelegationsForRunQuery(runId)`
 * itself (contracts §4) — mocked here at the module level, matching this
 * package's own established `vi.mock('./config', ...)`-style convention,
 * rather than reached through a live store slice (`delegationApi.ts` does
 * not exist yet, Phase 4's own T031/T032).
 *
 * Written before `delegationApi.ts` exists and before `RunDiagram.tsx`/
 * `RunActionNode.tsx` render any such link at all (T033 is Phase 4's
 * implementation task) — every scenario below is expected to FAIL red:
 * `run-action-delegation-link-*` never appears in the DOM regardless of
 * fixture, since nothing in the current tree renders it, and the
 * `./delegationApi` mock below is currently inert (nothing imports that
 * module yet).
 *
 * Conventions assumed below (none are pinned by the design docs beyond the
 * literal `data-testid` contracts §4/T027 name, so these are this test's
 * own contract for the eventual implementation, mirroring
 * RunDiagram.test.tsx's own "conventions assumed" precedent):
 *   - `delegationApi.ts` exports `useGetDelegationsForRunQuery(runId)`,
 *     returning `{ data: Delegation[] | undefined, isLoading: boolean }` —
 *     the same RTK Query hook shape every other `runApi` hook in this file
 *     already has.
 *   - the link's href/navigation target is the existing, already-routed
 *     `/clarion-app/llm-client/runs/:id` path (`RunDiagram.route.test.tsx`'s
 *     own established route), pointed at the `Delegation`'s own
 *     `helper_run_id` — activating it re-mounts the same `RunDiagram`
 *     route at the new id, exactly like `RunDiagram.tsx`'s own existing
 *     `useParams()`-driven `runId` resolution.
 */

vi.mock('./config', () => ({
  backend: {
    url: 'http://localhost:8000',
    token: 'test-token',
    user: { id: 'user-1', name: 'Test User', email: 'test@test.com' },
  },
  updateFrontend: () => {},
}));

let mockRunsById: Record<string, RunSummary> = {};
let mockStepsByRun: Record<string, StepSummary[]> = {};
let mockActionsByStep: Record<string, ActionSummary[]> = {};
let mockChildrenByAction: Record<string, ActionSummary[]> = {};
let mockDelegationsByRun: Record<string, Delegation[]> = {};

function paginate<T>(items: T[], page = 1, perPage = 100) {
  return {
    data: items,
    meta: { current_page: page, per_page: perPage, total: items.length, last_page: 1 },
  };
}

vi.mock('@clarion-app/frontend-base', () => ({
  createBackendConfig: () => ({
    backend: { url: 'http://localhost:8000', user: { id: 'user-1', name: '', email: '' } },
    updateFrontend: () => {},
  }),
  createBaseQuery: () => async (args: any) => {
    const url = typeof args === 'string' ? args : (args?.url ?? '');
    const path = String(url).split('?')[0];

    const stepActionsMatch = path.match(/^\/agent-runs\/[^/]+\/steps\/([^/]+)\/actions$/);
    if (stepActionsMatch) {
      return { data: paginate(mockActionsByStep[stepActionsMatch[1]] ?? []) };
    }

    const childrenMatch = path.match(/^\/agent-runs\/[^/]+\/actions\/([^/]+)\/children$/);
    if (childrenMatch) {
      return { data: paginate(mockChildrenByAction[childrenMatch[1]] ?? []) };
    }

    // contracts/delegation-protocol-api.md §1 -- present in case the
    // eventual delegationApi.ts slice itself routes through this same
    // createBaseQuery (matching every other slice in this package), rather
    // than the module-level ./delegationApi mock below.
    const delegationsMatch = path.match(/^\/agent-runs\/([^/]+)\/delegations$/);
    if (delegationsMatch) {
      return { data: mockDelegationsByRun[delegationsMatch[1]] ?? [] };
    }

    const stepsMatch = path.match(/^\/agent-runs\/([^/]+)\/steps$/);
    if (stepsMatch) {
      return { data: paginate(mockStepsByRun[stepsMatch[1]] ?? []) };
    }

    const runMatch = path.match(/^\/agent-runs\/([^/]+)$/);
    if (runMatch) {
      const run = mockRunsById[runMatch[1]];
      if (!run) {
        return { error: { status: 404, data: { error: 'Run not found', code: 'run_not_found' } } };
      }
      return { data: run };
    }

    return { data: {} };
  },
  registerUserChannelHandler: () => {},
}));

// Module-level mock -- this file's own primary vehicle for feeding
// Delegation fixtures in, per T027. Returns whatever mockDelegationsByRun
// holds for the queried runId, mirroring a real RTK Query hook's shape
// closely enough that no test-specific branching is needed once
// RunDiagram.tsx actually imports and calls this hook (Phase 4 T033).
vi.mock('./delegationApi', () => ({
  useGetDelegationsForRunQuery: (runId: string) => ({
    data: mockDelegationsByRun[runId] ?? [],
    isLoading: false,
  }),
}));

const { RunDiagram } = await import('./RunDiagram');

function createTestStore() {
  return configureStore({
    reducer: {
      [runApi.reducerPath]: runApi.reducer,
    },
    middleware: (getDefault) => getDefault().concat(runApi.middleware),
  });
}

function renderDiagram(runId: string) {
  const store = createTestStore();
  return render(
    <MemoryRouter>
      <Provider store={store}>
        <RunDiagram runId={runId} />
      </Provider>
    </MemoryRouter>,
  );
}

/** The manifest's own routed path (RunDiagram.route.test.tsx's established pattern), for the click-navigates scenario. */
function renderViaRoute(initialEntry: string) {
  const store = createTestStore();
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Provider store={store}>
        <Routes>
          <Route path="/clarion-app/llm-client/runs/:id" element={<RunDiagram />} />
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
    started_at: '2026-08-14T10:00:00.000000Z',
    ended_at: '2026-08-14T10:00:10.000000Z',
    duration_ms: 10000,
    step_count: 1,
    action_count: 1,
    conversation_id: null,
    ...overrides,
  };
}

function makeStep(overrides: Partial<StepSummary> = {}): StepSummary {
  return {
    id: 'step-1',
    run_id: 'run-1',
    position: 1,
    end_state: 'completed',
    end_reason: null,
    started_at: '2026-08-14T10:00:00.000000Z',
    ended_at: '2026-08-14T10:00:05.000000Z',
    duration_ms: 5000,
    wait_ms: null,
    attempt_count: 1,
    action_count: 1,
    ...overrides,
  };
}

function makeAction(overrides: Partial<ActionSummary> = {}): ActionSummary {
  return {
    id: 'action-1',
    run_id: 'run-1',
    step_id: 'step-1',
    parent_action_id: null,
    action_type: 'delegation',
    target: 'Invoice Line-Item Extractor',
    outcome: 'success',
    failure_reason: null,
    started_at: '2026-08-14T10:00:01.000000Z',
    ended_at: '2026-08-14T10:00:04.000000Z',
    duration_ms: 3000,
    has_children: false,
    ...overrides,
  };
}

function makeDelegation(overrides: Partial<Delegation> = {}): Delegation {
  return {
    id: 'dlg-1',
    parent_conversation_id: 'cnv-1',
    helper_agent_id: 'agt-1',
    helper_agent_name: 'Invoice Line-Item Extractor',
    helper_conversation_id: 'cnv-2',
    depth: 1,
    status: 'completed',
    task: 'Extract line items from the attached invoice text.',
    context: 'Invoice text: ...',
    parent_run_id: 'run-1',
    parent_action_id: 'action-1',
    helper_run_id: 'helper-run-1',
    outcome_summary: 'Completed normally.',
    started_at: '2026-08-14T10:00:01.000000Z',
    completed_at: '2026-08-14T10:00:04.000000Z',
    batch_id: null,
    ...overrides,
  };
}

describe('RunDiagram — delegation drill-down link (US3, contracts/delegation-protocol-api.md §4)', () => {
  beforeEach(() => {
    mockRunsById = {};
    mockStepsByRun = {};
    mockActionsByStep = {};
    mockChildrenByAction = {};
    mockDelegationsByRun = {};
  });

  it('renders a delegation link for a delegation-typed action with a matching, resolved Delegation row', async () => {
    mockRunsById['run-1'] = makeRun();
    mockStepsByRun['run-1'] = [makeStep()];
    mockActionsByStep['step-1'] = [makeAction({ id: 'action-1', action_type: 'delegation' })];
    mockDelegationsByRun['run-1'] = [makeDelegation({ parent_action_id: 'action-1', helper_run_id: 'helper-run-1' })];

    renderDiagram('run-1');

    await waitFor(() => {
      expect(screen.getByTestId('run-action-action-1')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByTestId('run-action-delegation-link-action-1')).toBeInTheDocument();
    });
  });

  it('renders no delegation link for a non-delegation action type', async () => {
    mockRunsById['run-1'] = makeRun();
    mockStepsByRun['run-1'] = [makeStep()];
    mockActionsByStep['step-1'] = [makeAction({ id: 'action-2', action_type: 'tool_invocation' })];
    // A Delegation row exists, but nothing about this non-delegation action
    // should ever surface it.
    mockDelegationsByRun['run-1'] = [makeDelegation({ parent_action_id: 'action-2', helper_run_id: 'helper-run-1' })];

    renderDiagram('run-1');

    await waitFor(() => {
      expect(screen.getByTestId('run-action-action-2')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('run-action-delegation-link-action-2')).not.toBeInTheDocument();
  });

  it('renders no delegation link for a delegation-typed action still in progress with no matching Delegation entry yet', async () => {
    mockRunsById['run-1'] = makeRun();
    mockStepsByRun['run-1'] = [makeStep()];
    mockActionsByStep['step-1'] = [
      makeAction({
        id: 'action-3',
        action_type: 'delegation',
        outcome: 'in_progress',
        ended_at: null,
        duration_ms: null,
      }),
    ];
    // No Delegation row for action-3 at all -- the delegate_to_helper call is
    // still mid-flight (DelegationService has not yet written the row's
    // terminal state, or the row's own helper_run_id is still null).
    mockDelegationsByRun['run-1'] = [];

    renderDiagram('run-1');

    await waitFor(() => {
      expect(screen.getByTestId('run-action-action-3')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('run-action-delegation-link-action-3')).not.toBeInTheDocument();
  });

  it('navigates the diagram to the linked helper_run_id when the delegation link is activated', async () => {
    mockRunsById['run-1'] = makeRun({ id: 'run-1' });
    mockRunsById['helper-run-1'] = makeRun({ id: 'helper-run-1', step_count: 0, action_count: 0 });
    mockStepsByRun['run-1'] = [makeStep()];
    mockStepsByRun['helper-run-1'] = [];
    mockActionsByStep['step-1'] = [makeAction({ id: 'action-1', action_type: 'delegation' })];
    mockDelegationsByRun['run-1'] = [makeDelegation({ parent_action_id: 'action-1', helper_run_id: 'helper-run-1' })];
    mockDelegationsByRun['helper-run-1'] = [];

    renderViaRoute('/clarion-app/llm-client/runs/run-1');

    await waitFor(() => {
      expect(screen.getByTestId('run-action-delegation-link-action-1')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('run-action-delegation-link-action-1'));

    await waitFor(() => {
      expect(screen.getByText(/Run helper-run-1/)).toBeInTheDocument();
    });
    // The helper run's own empty-steps state (mockStepsByRun['helper-run-1']
    // is []) is a second, independent signal that the diagram genuinely
    // re-mounted against the new run id rather than merely rendering a
    // second link inline.
    await waitFor(() => {
      expect(screen.getByTestId('run-diagram-empty')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('run-action-action-1')).not.toBeInTheDocument();
  });
});
