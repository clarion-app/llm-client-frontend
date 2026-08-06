import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import { runApi } from './runApi';
import type { RunSummary, StepSummary, ActionSummary } from './types';

/**
 * Phase 3 (T017), User Story 1 — RunDiagram.tsx does not exist yet (Phase 2
 * only created the empty runApi.ts base slice and the wire-shape types).
 * This file is written first, per TDD, and is expected to fail at
 * collection time because `./RunDiagram` cannot be resolved — the dynamic
 * import below throws before any test body runs. That failure is correct
 * and expected for this phase; Phase 3's implementation tasks (T025-T029)
 * are what create the module and turn these tests green.
 *
 * Conventions assumed below (none are pinned by the design docs, so these
 * are this test's own contract for the eventual implementation):
 *   - root container: data-testid="run-diagram"
 *   - empty state:     data-testid="run-diagram-empty"
 *   - a step node:      data-testid={`run-step-${step.id}`}
 *   - a step's duration bar: data-testid={`run-step-duration-${step.id}`}, an
 *     element whose inline `style.width` is a percentage string proportional
 *     to the step's duration relative to its siblings.
 *   - an action node:   data-testid={`run-action-${action.id}`}
 *   - the run's own status badge: data-testid="run-status-badge"
 *   - an action/step still in progress or overlapping is discoverable via
 *     its node's text content (e.g. /running/i) or a `data-overlap`
 *     attribute — asserted via text content where possible to stay
 *     implementation-agnostic.
 */

vi.mock('./config', () => ({
  backend: {
    url: 'http://localhost:8000',
    token: 'test-token',
    user: { id: 'user-1', name: 'Test User', email: 'test@test.com' },
  },
  updateFrontend: () => {},
}));

let mockRun: RunSummary | null = null;
let mockSteps: StepSummary[] = [];
let mockActionsByStep: Record<string, ActionSummary[]> = {};
let mockChildrenByAction: Record<string, ActionSummary[]> = {};

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

    if (/^\/agent-runs\/[^/]+\/steps$/.test(path)) {
      return { data: paginate(mockSteps) };
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

// Dynamic import so mocks are in place before module evaluation. `./RunDiagram`
// does not exist at this phase — this import is expected to fail, which is
// what makes this test suite fail cleanly for the right reason (TDD).
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
    ended_at: '2026-08-06T10:00:10.000000Z',
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
    target: 'search_operations',
    outcome: 'success',
    failure_reason: null,
    started_at: '2026-08-06T10:00:01.000000Z',
    ended_at: '2026-08-06T10:00:02.000000Z',
    duration_ms: 1000,
    has_children: false,
    ...overrides,
  };
}

describe('RunDiagram', () => {
  beforeEach(() => {
    mockRun = null;
    mockSteps = [];
    mockActionsByStep = {};
    mockChildrenByAction = {};
  });

  it('renders steps in position order', async () => {
    mockRun = makeRun({ step_count: 2, action_count: 0 });
    mockSteps = [
      makeStep({ id: 'step-1', position: 1 }),
      makeStep({ id: 'step-2', position: 2 }),
    ];

    renderDiagram('run-1');

    await waitFor(() => {
      expect(screen.getByTestId('run-step-step-1')).toBeInTheDocument();
      expect(screen.getByTestId('run-step-step-2')).toBeInTheDocument();
    });

    const first = screen.getByTestId('run-step-step-1');
    const second = screen.getByTestId('run-step-step-2');
    expect(first.compareDocumentPosition(second) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
  });

  it('renders nested actions, including an action nested under another action', async () => {
    // Well under the 50-element auto-expand threshold (research.md D5), so
    // the diagram fetches actions/children without requiring a simulated click.
    mockRun = makeRun({ step_count: 1, action_count: 3 });
    mockSteps = [makeStep({ id: 'step-1', position: 1, action_count: 2 })];
    mockActionsByStep['step-1'] = [
      makeAction({ id: 'action-a', step_id: 'step-1', target: 'a', has_children: true }),
      makeAction({ id: 'action-b', step_id: 'step-1', target: 'b', has_children: false }),
    ];
    mockChildrenByAction['action-a'] = [
      makeAction({
        id: 'action-c',
        step_id: 'step-1',
        parent_action_id: 'action-a',
        target: 'c',
        action_type: 'llm_request',
      }),
    ];

    renderDiagram('run-1');

    await waitFor(() => {
      expect(screen.getByTestId('run-action-action-a')).toBeInTheDocument();
      expect(screen.getByTestId('run-action-action-b')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByTestId('run-action-action-c')).toBeInTheDocument();
    });

    // The nested action must render inside its parent's subtree, not as a sibling.
    const parent = screen.getByTestId('run-action-action-a');
    const child = screen.getByTestId('run-action-action-c');
    expect(parent.contains(child)).toBe(true);
  });

  it('visually distinguishes a failed step and a failed action without opening any detail', async () => {
    mockRun = makeRun({ step_count: 2, action_count: 1 });
    mockSteps = [
      makeStep({ id: 'step-ok', position: 1, end_state: 'completed' }),
      makeStep({ id: 'step-fail', position: 2, end_state: 'failed', end_reason: 'boom', action_count: 1 }),
    ];
    mockActionsByStep['step-fail'] = [
      makeAction({
        id: 'action-fail',
        step_id: 'step-fail',
        outcome: 'failure',
        failure_reason: 'Operation timed out after 30s',
      }),
    ];

    renderDiagram('run-1');

    await waitFor(() => {
      expect(screen.getByTestId('run-step-step-fail')).toBeInTheDocument();
    });

    const failedStep = screen.getByTestId('run-step-step-fail');
    expect(failedStep.textContent ?? '').toMatch(/fail/i);

    await waitFor(() => {
      const failedAction = screen.getByTestId('run-action-action-fail');
      expect(failedAction.textContent ?? '').toMatch(/fail/i);
    });

    // No click/interaction happened above — the distinction must be visible at a glance.
  });

  it('sizes each step\'s duration bar relative to the other steps\' durations', async () => {
    mockRun = makeRun({ step_count: 2, action_count: 0 });
    mockSteps = [
      makeStep({ id: 'step-short', position: 1, duration_ms: 1000 }),
      makeStep({ id: 'step-long', position: 2, duration_ms: 9000 }),
    ];

    renderDiagram('run-1');

    await waitFor(() => {
      expect(screen.getByTestId('run-step-duration-step-short')).toBeInTheDocument();
      expect(screen.getByTestId('run-step-duration-step-long')).toBeInTheDocument();
    });

    const shortWidth = parseFloat(
      (screen.getByTestId('run-step-duration-step-short') as HTMLElement).style.width || '0',
    );
    const longWidth = parseFloat(
      (screen.getByTestId('run-step-duration-step-long') as HTMLElement).style.width || '0',
    );

    expect(longWidth).toBeGreaterThan(shortWidth);
  });

  it('shows a running/elapsed indicator instead of a fixed duration for a step or action with no ended_at (FR-004)', async () => {
    mockRun = makeRun({ end_state: 'in_progress', ended_at: null, duration_ms: null, step_count: 1, action_count: 1 });
    mockSteps = [
      makeStep({
        id: 'step-running',
        position: 1,
        end_state: 'in_progress',
        ended_at: null,
        duration_ms: null,
        action_count: 1,
      }),
    ];
    mockActionsByStep['step-running'] = [
      makeAction({
        id: 'action-running',
        step_id: 'step-running',
        outcome: 'in_progress',
        ended_at: null,
        duration_ms: null,
      }),
    ];

    renderDiagram('run-1');

    await waitFor(() => {
      const stepNode = screen.getByTestId('run-step-step-running');
      expect(stepNode.textContent ?? '').toMatch(/running|in.?progress|elapsed/i);
    });

    await waitFor(() => {
      const actionNode = screen.getByTestId('run-action-action-running');
      expect(actionNode.textContent ?? '').toMatch(/running|in.?progress|elapsed/i);
    });
  });

  it('renders a single-step run without error (FR-017)', async () => {
    mockRun = makeRun({ step_count: 1, action_count: 0 });
    mockSteps = [makeStep({ id: 'only-step', position: 1 })];

    renderDiagram('run-1');

    await waitFor(() => {
      expect(screen.getByTestId('run-diagram')).toBeInTheDocument();
      expect(screen.getByTestId('run-step-only-step')).toBeInTheDocument();
    });
  });

  it('renders the explicit empty state for a zero-step run (FR-018)', async () => {
    mockRun = makeRun({ step_count: 0, action_count: 0 });
    mockSteps = [];

    renderDiagram('run-1');

    await waitFor(() => {
      expect(screen.getByTestId('run-diagram-empty')).toBeInTheDocument();
    });

    expect(screen.queryByTestId(/^run-step-/)).not.toBeInTheDocument();
  });

  it('renders two overlapping-timing actions under the same step as visibly overlapping, not sequential (FR-019)', async () => {
    mockRun = makeRun({ step_count: 1, action_count: 2 });
    mockSteps = [makeStep({ id: 'step-1', position: 1, action_count: 2 })];
    mockActionsByStep['step-1'] = [
      makeAction({
        id: 'action-q',
        step_id: 'step-1',
        started_at: '2026-08-06T10:00:01.000000Z',
        ended_at: '2026-08-06T10:00:05.000000Z',
      }),
      makeAction({
        id: 'action-r',
        step_id: 'step-1',
        started_at: '2026-08-06T10:00:03.000000Z',
        ended_at: '2026-08-06T10:00:07.000000Z',
      }),
    ];

    renderDiagram('run-1');

    await waitFor(() => {
      expect(screen.getByTestId('run-action-action-q')).toBeInTheDocument();
      expect(screen.getByTestId('run-action-action-r')).toBeInTheDocument();
    });

    const q = screen.getByTestId('run-action-action-q');
    const r = screen.getByTestId('run-action-action-r');

    // Overlap must be visible in the layout, not merely inferable from data —
    // an implementation might mark this via a data attribute or CSS
    // positioning; a data attribute is the least brittle thing to assert on.
    expect(q.getAttribute('data-overlap')).toBe('true');
    expect(r.getAttribute('data-overlap')).toBe('true');
  });

  it('renders an abandoned run with a visibly distinct indicator, never as completed or in-progress (FR-016, SC-007)', async () => {
    mockRun = makeRun({ end_state: 'abandoned', end_reason: 'no activity within timeout', step_count: 1, action_count: 0 });
    mockSteps = [makeStep({ id: 'step-1', position: 1 })];

    renderDiagram('run-1');

    await waitFor(() => {
      expect(screen.getByTestId('run-status-badge')).toBeInTheDocument();
    });

    const badge = screen.getByTestId('run-status-badge');
    expect(badge.textContent ?? '').toMatch(/abandoned/i);
    expect(badge.textContent ?? '').not.toMatch(/^completed$/i);
    expect(badge.textContent ?? '').not.toMatch(/^in.?progress$/i);
  });

  it('reflects the current recorded state on remount, not a stale cached snapshot (FR-020, US3 Scenario 4, SC-009)', async () => {
    const store = createTestStore();

    mockRun = makeRun({ end_state: 'in_progress', ended_at: null, duration_ms: null, step_count: 1, action_count: 0 });
    mockSteps = [makeStep({ id: 'step-1', position: 1, end_state: 'in_progress', ended_at: null, duration_ms: null })];

    const { unmount } = render(
      <MemoryRouter>
        <Provider store={store}>
          <RunDiagram runId="run-1" />
        </Provider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('run-status-badge').textContent ?? '').toMatch(/in.?progress/i);
    });

    unmount();

    // The run finished while the diagram was closed.
    mockRun = makeRun({ end_state: 'completed', step_count: 1, action_count: 0 });
    mockSteps = [makeStep({ id: 'step-1', position: 1, end_state: 'completed' })];

    render(
      <MemoryRouter>
        <Provider store={store}>
          <RunDiagram runId="run-1" />
        </Provider>
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('run-status-badge').textContent ?? '').toMatch(/completed/i);
    });
  });

  it('renders a generic "not available" state for a 404, never a partially-rendered diagram', async () => {
    mockRun = null; // baseQuery mock returns a 404 error response for a null run.
    mockSteps = [];

    renderDiagram('nonexistent-run');

    await waitFor(() => {
      expect(screen.getByTestId('run-diagram-not-available')).toBeInTheDocument();
    });

    expect(screen.queryByTestId(/^run-step-/)).not.toBeInTheDocument();
  });
});
