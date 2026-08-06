import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import { runApi } from './runApi';
import type { RunSummary, StepSummary, ActionSummary } from './types';

/**
 * Reconciliation fix (FR-012, User Story 4 Acceptance Scenario 4) — the
 * backend's `GET /agent-runs/{runId}/steps`,
 * `.../steps/{stepId}/actions`, and `.../actions/{actionId}/children` all
 * support `page`/`per_page` (contracts/run-read-api.md), but prior to this
 * fix runApi.ts's query definitions never accepted or forwarded a `page`
 * argument — the diagram only ever fetched page 1 of any list. For a run
 * with more steps (or a step/action with more children) than fit on one
 * page, everything beyond page 1 was permanently unreachable in the UI even
 * though the backend already held and served it.
 *
 * This file proves the fix at two of the three list levels — the top-level
 * step list and a step's top-level action list (the third, an action's
 * nested-children list, shares the exact same `useAccumulatedPages`
 * mechanism in RunDiagram.tsx, so it is not separately re-verified here).
 *
 * The mock `createBaseQuery` below, unlike RunDiagram.test.tsx's and
 * RunDiagram.largeRun.test.tsx's (which always return the full fixture as
 * a single "page"), actually slices its fixture by the `page` query
 * parameter — so a "Load more" click's resulting request must be answered
 * with genuinely different data for this test to be meaningful.
 */

vi.mock('./config', () => ({
  backend: {
    url: 'http://localhost:8000',
    token: 'test-token',
    user: { id: 'user-1', name: 'Test User', email: 'test@test.com' },
  },
  updateFrontend: () => {},
}));

const STEPS_PER_PAGE = 3;
const STEP_ACTIONS_PER_PAGE = 3;

let mockRun: RunSummary | null = null;
let mockSteps: StepSummary[] = [];
let mockActionsByStep: Record<string, ActionSummary[]> = {};

/** Slices `items` by `page`/`perPage`, matching the backend's paginated envelope shape (data-model.md §1.5). */
function paginateSlice<T>(items: T[], page: number, perPage: number) {
  const start = (page - 1) * perPage;
  const data = items.slice(start, start + perPage);
  return {
    data,
    meta: {
      current_page: page,
      per_page: perPage,
      total: items.length,
      last_page: Math.max(1, Math.ceil(items.length / perPage)),
    },
  };
}

function pageFromUrl(url: string): number {
  const queryString = url.split('?')[1];
  if (!queryString) return 1;
  const params = new URLSearchParams(queryString);
  const page = Number(params.get('page'));
  return Number.isFinite(page) && page > 0 ? page : 1;
}

vi.mock('@clarion-app/frontend-base', () => ({
  createBackendConfig: () => ({
    backend: { url: 'http://localhost:8000', user: { id: 'user-1', name: '', email: '' } },
    updateFrontend: () => {},
  }),
  createBaseQuery: () => async (args: any) => {
    const url = typeof args === 'string' ? args : (args?.url ?? '');
    const path = String(url).split('?')[0];
    const page = pageFromUrl(String(url));

    const stepActionsMatch = path.match(/^\/agent-runs\/[^/]+\/steps\/([^/]+)\/actions$/);
    if (stepActionsMatch) {
      const stepId = stepActionsMatch[1];
      return { data: paginateSlice(mockActionsByStep[stepId] ?? [], page, STEP_ACTIONS_PER_PAGE) };
    }

    const childrenMatch = path.match(/^\/agent-runs\/[^/]+\/actions\/([^/]+)\/children$/);
    if (childrenMatch) {
      return { data: paginateSlice([], page, 50) };
    }

    if (/^\/agent-runs\/[^/]+\/steps$/.test(path)) {
      return { data: paginateSlice(mockSteps, page, STEPS_PER_PAGE) };
    }

    if (/^\/agent-runs\/[^/]+$/.test(path)) {
      if (mockRun === null) {
        return { error: { status: 404, data: { error: 'Run not found', code: 'run_not_found' } } };
      }
      return { data: mockRun };
    }

    return { data: {} };
  },
  registerUserChannelHandler: () => {},
}));

// Dynamic import so mocks are in place before module evaluation (matches
// RunDiagram.test.tsx's pattern).
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

function makeRun(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    id: 'run-1',
    kind: 'interactive',
    end_state: 'completed',
    end_reason: null,
    started_at: '2026-08-06T10:00:00.000000Z',
    ended_at: '2026-08-06T10:10:00.000000Z',
    duration_ms: 600000,
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
    started_at: '2026-08-06T10:00:00.000000Z',
    ended_at: '2026-08-06T10:00:05.000000Z',
    duration_ms: 5000,
    wait_ms: null,
    attempt_count: 1,
    action_count: 0,
    ...overrides,
  };
}

function makeAction(overrides: Partial<ActionSummary> = {}): ActionSummary {
  return {
    id: 'action-1',
    run_id: 'run-1',
    step_id: 'step-1',
    parent_action_id: null,
    action_type: 'tool_invocation',
    target: 'op',
    outcome: 'success',
    failure_reason: null,
    started_at: '2026-08-06T10:00:01.000000Z',
    ended_at: '2026-08-06T10:00:02.000000Z',
    duration_ms: 1000,
    has_children: false,
    ...overrides,
  };
}

describe('RunDiagram — pagination (FR-012, US4 Acceptance Scenario 4)', () => {
  beforeEach(() => {
    mockRun = null;
    mockSteps = [];
    mockActionsByStep = {};
  });

  it('shows a "Load more" affordance for the step list when more steps exist beyond page 1, and reveals them on click', async () => {
    // 5 steps, 3 per page (mock's STEPS_PER_PAGE) — page 1 holds steps 0-2,
    // step-3 and step-4 are on page 2 and start out unreachable.
    const steps = Array.from({ length: 5 }, (_, i) =>
      makeStep({ id: `step-${i}`, position: i + 1 }),
    );
    mockSteps = steps;
    mockRun = makeRun({ step_count: steps.length, action_count: 0 });

    renderDiagram('run-1');

    await waitFor(() => {
      expect(screen.getByTestId('run-step-step-0')).toBeInTheDocument();
      expect(screen.getByTestId('run-step-step-2')).toBeInTheDocument();
    });

    // Page 2's steps are not yet reachable.
    expect(screen.queryByTestId('run-step-step-3')).not.toBeInTheDocument();
    expect(screen.queryByTestId('run-step-step-4')).not.toBeInTheDocument();

    const loadMore = screen.getByTestId('run-steps-load-more');
    expect(loadMore).toBeInTheDocument();

    fireEvent.click(loadMore);

    // Previously-hidden steps from page 2 become reachable.
    await waitFor(() => {
      expect(screen.getByTestId('run-step-step-3')).toBeInTheDocument();
      expect(screen.getByTestId('run-step-step-4')).toBeInTheDocument();
    });

    // All pages exhausted — the affordance disappears once nothing is left to load.
    await waitFor(() => {
      expect(screen.queryByTestId('run-steps-load-more')).not.toBeInTheDocument();
    });

    // Page-1 steps remain visible throughout — "Load more" appends, it does not replace.
    expect(screen.getByTestId('run-step-step-0')).toBeInTheDocument();
  });

  it('shows a "Load more" affordance for a step\'s action list when it has more actions than fit on one page, and reveals them on click', async () => {
    // A single small run (auto-expands, research.md D5) whose one step has
    // 5 actions, 3 per page (mock's STEP_ACTIONS_PER_PAGE) — action-3 and
    // action-4 are on page 2 and start out unreachable.
    const actions = Array.from({ length: 5 }, (_, i) =>
      makeAction({ id: `action-${i}`, step_id: 'step-1', target: `op-${i}` }),
    );
    mockActionsByStep['step-1'] = actions;
    mockSteps = [makeStep({ id: 'step-1', position: 1, action_count: actions.length })];
    mockRun = makeRun({ step_count: 1, action_count: actions.length });

    renderDiagram('run-1');

    await waitFor(() => {
      expect(screen.getByTestId('run-action-action-0')).toBeInTheDocument();
      expect(screen.getByTestId('run-action-action-2')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('run-action-action-3')).not.toBeInTheDocument();
    expect(screen.queryByTestId('run-action-action-4')).not.toBeInTheDocument();

    const loadMore = screen.getByTestId('run-step-actions-load-more-step-1');
    expect(loadMore).toBeInTheDocument();

    fireEvent.click(loadMore);

    await waitFor(() => {
      expect(screen.getByTestId('run-action-action-3')).toBeInTheDocument();
      expect(screen.getByTestId('run-action-action-4')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.queryByTestId(`run-step-actions-load-more-step-1`)).not.toBeInTheDocument();
    });

    expect(screen.getByTestId('run-action-action-0')).toBeInTheDocument();
  });

  it('does not show a "Load more" affordance when everything already fits on page 1', async () => {
    mockSteps = [makeStep({ id: 'step-only', position: 1 })];
    mockRun = makeRun({ step_count: 1, action_count: 0 });

    renderDiagram('run-1');

    await waitFor(() => {
      expect(screen.getByTestId('run-step-step-only')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('run-steps-load-more')).not.toBeInTheDocument();
  });
});
