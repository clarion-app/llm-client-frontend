import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import { runApi } from './runApi';
import { delegationApi } from './delegationApi';
import { RunActionNode } from './RunActionNode';
import type { RunSummary, StepSummary, ActionSummary } from './types';

/**
 * A run paused on a question to its user is shown as waiting for the user,
 * and the `ask_user` action as waiting for an answer.
 *
 * The run summary's `awaiting_user` flag (true exactly while a question is
 * pending for the run) shows a "Waiting for you" badge in the diagram's
 * header, data-testid="run-awaiting-user-badge"; it is absent when the flag
 * is false or missing. An `ask_user` action still `awaiting_confirmation` is
 * labelled "Waiting for your answer"; every other action keeps its existing
 * "Awaiting confirmation" label.
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

    if (/^\/agent-runs\/[^/]+\/delegations$/.test(path)) {
      return { data: [] };
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

// Dynamic import so mocks are in place before module evaluation.
const { RunDiagram } = await import('./RunDiagram');

function createTestStore() {
  return configureStore({
    reducer: {
      [runApi.reducerPath]: runApi.reducer,
      [delegationApi.reducerPath]: delegationApi.reducer,
    },
    middleware: (getDefault) => getDefault().concat(runApi.middleware, delegationApi.middleware),
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

type RunSummaryWithFlag = RunSummary & { awaiting_user?: boolean };

function withAwaitingUser(run: RunSummary, awaitingUser: boolean | undefined): RunSummaryWithFlag {
  const flagged: RunSummaryWithFlag = { ...run };
  if (awaitingUser !== undefined) flagged.awaiting_user = awaitingUser;
  return flagged;
}

function renderNode(action: ActionSummary) {
  return render(
    <RunActionNode action={action} maxDurationMs={1000} overlap={false} isExpanded={false} onToggleExpand={() => {}} />,
  );
}

const waitingAsk = () =>
  makeAction({
    id: 'action-ask',
    target: 'ask_user',
    outcome: 'awaiting_confirmation',
    ended_at: null,
    duration_ms: null,
  });

describe('RunActionNode — a question waiting on the user', () => {
  it('labels a waiting ask_user action "Waiting for your answer"', () => {
    renderNode(waitingAsk());

    const node = screen.getByTestId('run-action-action-ask');
    expect(node.textContent ?? '').toContain('Waiting for your answer');
    expect(node.textContent ?? '').not.toContain('Awaiting confirmation');
  });

  it('keeps "Awaiting confirmation" for any other action awaiting confirmation', () => {
    renderNode(
      makeAction({
        id: 'action-confirm',
        target: 'execute_operation',
        outcome: 'awaiting_confirmation',
        ended_at: null,
        duration_ms: null,
      }),
    );

    const node = screen.getByTestId('run-action-action-confirm');
    expect(node.textContent ?? '').toContain('Awaiting confirmation');
    expect(node.textContent ?? '').not.toContain('Waiting for your answer');
  });

  it('shows a resolved ask_user action with its ordinary outcome label', () => {
    renderNode(
      makeAction({
        id: 'action-expired',
        target: 'ask_user',
        outcome: 'failure',
        failure_reason: 'question expired',
      }),
    );

    const node = screen.getByTestId('run-action-action-expired');
    expect(node.textContent ?? '').toContain('Failed');
    expect(node.textContent ?? '').toContain('question expired');
    expect(node.textContent ?? '').not.toContain('Waiting for your answer');
  });
});

describe('RunDiagram — a run waiting on its user', () => {
  beforeEach(() => {
    mockRun = null;
    mockSteps = [];
    mockActionsByStep = {};
    mockChildrenByAction = {};
  });

  function seedWaitingRun(awaitingUser: boolean | undefined) {
    mockRun = withAwaitingUser(
      makeRun({ end_state: 'in_progress', ended_at: null, duration_ms: null, step_count: 1, action_count: 1 }),
      awaitingUser,
    );
    mockSteps = [makeStep({ id: 'step-1', end_state: 'in_progress', ended_at: null, duration_ms: null, action_count: 1 })];
    mockActionsByStep['step-1'] = [waitingAsk()];
  }

  it('shows a "Waiting for you" badge when the run is awaiting its user', async () => {
    seedWaitingRun(true);

    renderDiagram('run-1');

    const badge = await screen.findByTestId('run-awaiting-user-badge');
    expect(badge.textContent ?? '').toContain('Waiting for you');
    expect(screen.getByTestId('run-status-badge').textContent ?? '').not.toMatch(/fail|abandon|stall/i);

    await waitFor(() => {
      expect(screen.getByTestId('run-action-action-ask').textContent ?? '').toContain('Waiting for your answer');
    });
  });

  it('shows no "Waiting for you" badge when the run is not awaiting its user', async () => {
    seedWaitingRun(false);

    renderDiagram('run-1');

    await screen.findByTestId('run-status-badge');
    expect(screen.queryByTestId('run-awaiting-user-badge')).toBeNull();
    expect(screen.queryByText(/Waiting for you\b/)).toBeNull();
  });

  it('shows no "Waiting for you" badge when the flag is absent', async () => {
    seedWaitingRun(undefined);

    renderDiagram('run-1');

    await screen.findByTestId('run-status-badge');
    expect(screen.queryByTestId('run-awaiting-user-badge')).toBeNull();
  });
});
