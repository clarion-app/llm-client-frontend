import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import { runApi } from './runApi';
import type { RunSummary, PaginatedEnvelope } from './types';

/**
 * Each row of the runs list shows a badge, data-testid "run-resume-badge",
 * for a task that is interrupted ("Interrupted"), resuming ("Resuming") or
 * waiting to retry the model provider ("Waiting to retry"); none for any
 * other state or for a run with no resume block. It sits beside the badges
 * the row already shows for a question and for a task budget.
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

function resume(state: string | null) {
  return { state, resume_count: 1, interrupted_at: '2026-10-12T10:12:00.000000Z', next_attempt_at: null, cancelled: false };
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

describe('RunsList — resume badges', () => {
  beforeEach(() => {
    cleanup();
  });

  it('badges a task that is interrupted, resuming or waiting to retry the provider', async () => {
    renderList([
      run('interrupted', { resume: resume('interrupted') }),
      run('resuming', { resume: resume('resuming') }),
      run('retry', { resume: { ...resume('waiting_provider_retry'), next_attempt_at: '2026-10-12T10:41:10.000000Z' } }),
    ]);

    const badgeOf = async (id: string) => within(await screen.findByTestId(`run-row-${id}`)).queryByTestId('run-resume-badge');

    expect(await badgeOf('interrupted')).toHaveTextContent(/interrupted/i);
    expect(await badgeOf('resuming')).toHaveTextContent(/resuming/i);
    expect(await badgeOf('retry')).toHaveTextContent(/waiting to retry/i);
  });

  it('shows no badge for a task that is working, paused, over, or has no resume block', async () => {
    renderList([
      run('working', { resume: resume('working') }),
      run('paused', { resume: resume('paused') }),
      run('over', { resume: resume(null), end_state: 'completed' }),
      run('cancelled', { resume: { ...resume(null), cancelled: true }, end_state: 'stopped_early' }),
      run('legacy', { resume: null }),
      run('older-server'),
    ]);

    const badgeOf = async (id: string) => within(await screen.findByTestId(`run-row-${id}`)).queryByTestId('run-resume-badge');

    for (const id of ['working', 'paused', 'over', 'cancelled', 'legacy', 'older-server']) {
      expect(await badgeOf(id), `${id}: no badge`).toBeNull();
    }
  });

  it('sits beside the badge of a question that stopped and does not replace it', async () => {
    renderList([run('asked', { resume: resume('interrupted'), awaiting_user: true, question_stopped: true })]);

    const row = await screen.findByTestId('run-row-asked');

    expect(within(row).getByTestId('run-resume-badge')).toHaveTextContent(/interrupted/i);
    expect(within(row).getByTestId('run-question-stopped-badge')).toBeInTheDocument();
  });

  it('sits beside the badge of a task budget and does not replace it', async () => {
    renderList([
      run('budget', {
        resume: resume('resuming'),
        task_budget: { state: 'paused', sub_state: 'awaiting_decision', steps_used: 20, max_steps: 20, spend_used: '0.4', max_spend: '1.0', currency: 'USD', approximate: false, incomplete: false },
      }),
    ]);

    const row = await screen.findByTestId('run-row-budget');

    expect(within(row).getByTestId('run-resume-badge')).toHaveTextContent(/resuming/i);
    expect(within(row).getByTestId('run-task-budget-badge')).toBeInTheDocument();
  });
});
