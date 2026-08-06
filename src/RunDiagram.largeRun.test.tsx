import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import { runApi } from './runApi';
import type { RunSummary, StepSummary, ActionSummary } from './types';

/**
 * Phase 7 (T072), User Story 4 — large-run UX (research.md D5): a run whose
 * combined step+action count exceeds AUTO_EXPAND_THRESHOLD (50) must open
 * collapsed, fetching a step's actions only on that step's explicit
 * expansion (never pre-fetching every step's actions up front); a run at or
 * under the threshold auto-expands every step's top-level actions on load,
 * with no user interaction, so the "at a glance" experience (SC-001) holds
 * for the common, small case.
 *
 * This file asserts against actual network-call counts (via an instrumented
 * createBaseQuery mock, tracked in `requestLog`), not just rendered DOM,
 * since "collapsed by default" and "auto-expands" are fundamentally claims
 * about which HTTP requests are or are not issued (FR-011/SC-004's
 * incremental-retrieval guarantee) — rendered DOM alone can't distinguish
 * "never fetched" from "fetched but happens to render collapsed."
 *
 * Conventions reused from RunDiagram.test.tsx (Phase 3, T017): root
 * data-testid="run-diagram", a step node data-testid={`run-step-${id}`}, an
 * action node data-testid={`run-action-${id}`}, and a step/action node's
 * clickable header is the single `[role="button"]` element inside it
 * (RunStepNode.tsx / RunActionNode.tsx `activate()` handler, which toggles
 * expansion and opens the detail panel together).
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
let requestLog: Array<{ kind: 'run' | 'steps' | 'stepActions' | 'children' | 'other'; id?: string }> = [];

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
      requestLog.push({ kind: 'stepActions', id: stepActionsMatch[1] });
      return { data: paginate(mockActionsByStep[stepActionsMatch[1]] ?? []) };
    }

    const childrenMatch = path.match(/^\/agent-runs\/[^/]+\/actions\/([^/]+)\/children$/);
    if (childrenMatch) {
      requestLog.push({ kind: 'children', id: childrenMatch[1] });
      return { data: paginate([]) };
    }

    if (/^\/agent-runs\/[^/]+\/steps$/.test(path)) {
      requestLog.push({ kind: 'steps' });
      return { data: paginate(mockSteps) };
    }

    if (/^\/agent-runs\/[^/]+$/.test(path)) {
      requestLog.push({ kind: 'run' });
      if (mockRun === null) {
        return { error: { status: 404, data: { error: 'Run not found', code: 'run_not_found' } } };
      }
      return { data: mockRun };
    }

    requestLog.push({ kind: 'other' });
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

/**
 * Builds `stepCount` steps, each with `actionsPerStep` top-level actions,
 * and the matching mock action-fetch fixture keyed by step id.
 */
function buildFixture(stepCount: number, actionsPerStep: number) {
  const steps: StepSummary[] = [];
  const actionsByStep: Record<string, ActionSummary[]> = {};

  for (let i = 0; i < stepCount; i++) {
    const stepId = `step-${i}`;
    steps.push(
      makeStep({
        id: stepId,
        position: i + 1,
        action_count: actionsPerStep,
      }),
    );
    actionsByStep[stepId] = Array.from({ length: actionsPerStep }, (_, j) =>
      makeAction({
        id: `action-${i}-${j}`,
        step_id: stepId,
        target: `op-${i}-${j}`,
      }),
    );
  }

  return { steps, actionsByStep };
}

describe('RunDiagram — large-run UX (T072, US4, research.md D5)', () => {
  beforeEach(() => {
    mockRun = null;
    mockSteps = [];
    mockActionsByStep = {};
    requestLog = [];
  });

  it("renders a 500+-element run collapsed by default: no step's actions are pre-fetched", async () => {
    // 100 steps x 5 actions = 500 actions, +100 steps = 600 combined
    // elements — well over AUTO_EXPAND_THRESHOLD (50), so every step must
    // start collapsed and no action list may be fetched up front.
    const { steps, actionsByStep } = buildFixture(100, 5);
    mockActionsByStep = actionsByStep;
    mockRun = makeRun({ step_count: steps.length, action_count: steps.length * 5 });
    mockSteps = steps;

    renderDiagram('run-1');

    await waitFor(() => {
      expect(screen.getByTestId('run-step-step-0')).toBeInTheDocument();
      expect(screen.getByTestId(`run-step-step-${steps.length - 1}`)).toBeInTheDocument();
    });

    // No action node anywhere — nothing was fetched, so nothing to render.
    expect(screen.queryByTestId(/^run-action-/)).not.toBeInTheDocument();
    expect(requestLog.filter((r) => r.kind === 'stepActions')).toHaveLength(0);
  });

  it('expanding one step in a large run issues exactly one paginated actions request, for that step only', async () => {
    const { steps, actionsByStep } = buildFixture(100, 5);
    mockActionsByStep = actionsByStep;
    mockRun = makeRun({ step_count: steps.length, action_count: steps.length * 5 });
    mockSteps = steps;

    renderDiagram('run-1');

    await waitFor(() => {
      expect(screen.getByTestId('run-step-step-7')).toBeInTheDocument();
    });

    expect(requestLog.filter((r) => r.kind === 'stepActions')).toHaveLength(0);

    const header = screen.getByTestId('run-step-step-7').querySelector('[role="button"]');
    expect(header).not.toBeNull();
    fireEvent.click(header as Element);

    await waitFor(() => {
      expect(screen.getByTestId('run-action-action-7-0')).toBeInTheDocument();
    });

    const stepActionRequests = requestLog.filter((r) => r.kind === 'stepActions');
    expect(stepActionRequests).toHaveLength(1);
    expect(stepActionRequests[0].id).toBe('step-7');

    // No other step's actions were fetched, and no other step's action
    // nodes rendered.
    expect(screen.queryByTestId(/^run-action-action-(?!7-)/)).not.toBeInTheDocument();
  });

  it("auto-expands every step's top-level actions on load for a sub-50-element run, with no user interaction", async () => {
    // 10 steps x 2 actions = 20 actions, +10 steps = 30 combined elements —
    // under the 50-element AUTO_EXPAND_THRESHOLD (research.md D5).
    const { steps, actionsByStep } = buildFixture(10, 2);
    mockActionsByStep = actionsByStep;
    mockRun = makeRun({ step_count: steps.length, action_count: steps.length * 2 });
    mockSteps = steps;

    renderDiagram('run-1');

    await waitFor(() => {
      // Every step's top-level actions rendered without any click.
      for (let i = 0; i < steps.length; i++) {
        expect(screen.getByTestId(`run-action-action-${i}-0`)).toBeInTheDocument();
        expect(screen.getByTestId(`run-action-action-${i}-1`)).toBeInTheDocument();
      }
    });

    const stepActionRequests = requestLog.filter((r) => r.kind === 'stepActions');
    expect(stepActionRequests).toHaveLength(steps.length);
  });
});
