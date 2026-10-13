import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import { runApi } from './runApi';
import type { RunSummary, PaginatedEnvelope } from './types';

/**
 * Each row of the runs list carries the same task budget badge as the run
 * diagram, data-testid="run-task-budget-badge": "Paused at budget ceiling"
 * (paused, awaiting a decision), "Stopped at budget ceiling" (paused and
 * stopped, or halted), "Concluded at budget ceiling" (concluded); none for
 * any other state or a run with no task budget. The budget badge takes the
 * place of the row's generic "Stopped — waiting for your answer" badge.
 */

let mockRunsResponse: PaginatedEnvelope<RunSummary>;

vi.mock('./config', () => ({
  backend: {
    url: 'http://localhost:8000',
    token: 'test-token',
    user: { id: 'user-1', name: 'Test User', email: 'test@test.com' },
  },
  updateFrontend: () => {},
}));

vi.mock('@clarion-app/frontend-base', () => ({
  createBackendConfig: () => ({
    backend: { url: 'http://localhost:8000', user: { id: 'user-1', name: '', email: '' } },
    updateFrontend: () => {},
  }),
  createBaseQuery: () => async (args: any) => {
    const url = typeof args === 'string' ? args : (args?.url ?? '');
    if (/^\/agent-runs$/.test(String(url).split('?')[0])) {
      return { data: mockRunsResponse };
    }
    return { data: {} };
  },
  registerUserChannelHandler: () => {},
}));

const { RunsList } = await import('./RunsList');

function budget(state: string, subState: string | null = null) {
  return {
    state,
    sub_state: subState,
    steps_used: 20,
    max_steps: 20,
    spend_used: '0.4120000000',
    max_spend: '1.0000000000',
    currency: 'USD',
    approximate: false,
    incomplete: false,
  };
}

function run(id: string, overrides: Record<string, any> = {}): RunSummary {
  return {
    id,
    kind: 'interactive',
    end_state: 'in_progress',
    end_reason: null,
    started_at: '2026-10-12T09:00:00.000000Z',
    ended_at: null,
    duration_ms: null,
    step_count: 1,
    action_count: 1,
    conversation_id: 'conv-1',
    ...overrides,
  } as RunSummary;
}

function renderList(runs: RunSummary[]) {
  mockRunsResponse = { data: runs, meta: { current_page: 1, per_page: 20, total: runs.length, last_page: 1 } };
  const store = configureStore({
    reducer: { [runApi.reducerPath]: runApi.reducer },
    middleware: (getDefault) => getDefault().concat(runApi.middleware),
  });
  return render(
    <MemoryRouter>
      <Provider store={store}>
        <RunsList />
      </Provider>
    </MemoryRouter>,
  );
}

describe('RunsList — task budget badges', () => {
  beforeEach(() => {
    cleanup();
  });

  it('shows each row\'s task budget badge', async () => {
    renderList([
      run('paused', { task_budget: budget('paused', 'awaiting_decision'), awaiting_user: true }),
      run('stopped', { task_budget: budget('paused', 'stopped'), awaiting_user: true, question_stopped: true }),
      run('halted', { task_budget: budget('halted'), end_state: 'stopped_early' }),
      run('concluded', { task_budget: budget('concluded'), end_state: 'completed' }),
      run('running', { task_budget: budget('running') }),
      run('completed', { task_budget: budget('completed'), end_state: 'completed' }),
      run('ended', { task_budget: budget('ended'), end_state: 'failed' }),
      run('none', { task_budget: null, end_state: 'completed' }),
      run('older-server', { end_state: 'completed' }),
    ]);

    const badgeOf = async (id: string) => within(await screen.findByTestId(`run-row-${id}`)).queryByTestId('run-task-budget-badge');

    expect(await badgeOf('paused')).toHaveTextContent('Paused at budget ceiling');
    expect(await badgeOf('stopped')).toHaveTextContent('Stopped at budget ceiling');
    expect(await badgeOf('halted')).toHaveTextContent('Stopped at budget ceiling');
    expect(await badgeOf('concluded')).toHaveTextContent('Concluded at budget ceiling');
    for (const id of ['running', 'completed', 'ended', 'none', 'older-server']) {
      expect(await badgeOf(id), `${id}: no badge`).toBeNull();
    }
  });

  it('the budget badge takes the place of the generic stopped badge', async () => {
    renderList([run('stopped', { task_budget: budget('paused', 'stopped'), awaiting_user: true, question_stopped: true })]);

    const row = await screen.findByTestId('run-row-stopped');
    expect(within(row).getByTestId('run-task-budget-badge')).toHaveTextContent('Stopped at budget ceiling');
    expect(within(row).queryByTestId('run-question-stopped-badge')).toBeNull();
  });

  it('an agent question that stopped still shows the generic badge', async () => {
    renderList([run('asked', { task_budget: budget('running'), awaiting_user: true, question_stopped: true })]);

    const row = await screen.findByTestId('run-row-asked');
    expect(within(row).getByTestId('run-question-stopped-badge')).toBeInTheDocument();
    expect(within(row).queryByTestId('run-task-budget-badge')).toBeNull();
  });
});
