import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { runApi } from './runApi';
import type { RunProgress } from './types';

/**
 * The progress panel at the top of a run's diagram, data-testid
 * "run-progress-panel": the task's state in plain words, what it is doing
 * now, how many steps are done, how far through its structure it is (or that
 * the remaining work is unknown), the allowance used, how long it has run,
 * when it last made progress and how often it was resumed. It never shows a
 * percentage.
 */

vi.mock('./config', () => ({
  backend: {
    url: 'http://localhost:8000',
    token: 'test-token',
    user: { id: 'user-1', name: 'Test User', email: 'test@test.com' },
  },
  updateFrontend: () => {},
}));

let mockProgress: RunProgress;

vi.mock('@clarion-app/frontend-base', () => ({
  createBackendConfig: () => ({
    backend: { url: 'http://localhost:8000', user: { id: 'user-1', name: '', email: '' } },
    updateFrontend: () => {},
  }),
  createBaseQuery: () => async (args: any) => {
    const url = typeof args === 'string' ? args : (args?.url ?? '');
    if (/^\/agent-runs\/[^/]+\/progress$/.test(String(url).split('?')[0])) {
      return { data: mockProgress };
    }
    return { data: {} };
  },
  registerUserChannelHandler: () => {},
}));

const { RunProgressPanel } = await import('./RunProgressPanel');

function progress(overrides: Partial<RunProgress> = {}): RunProgress {
  return {
    run_id: 'run-1',
    state: 'working',
    activity: { kind: 'running_tool', label: 'codingWorkspace.writeFile' },
    steps_completed: 37,
    structure: { kind: 'stages', completed: 2, total: 5, label: 'stage 3 of 5' },
    remaining: null,
    allowance: { steps_used: 38, max_steps: 200, label: 'allowance used' },
    started_at: '2026-10-12T10:00:00.000000Z',
    elapsed_ms: 1843000,
    last_progress_at: '2026-10-12T10:30:41.120000Z',
    resume_count: 1,
    interrupted_at: null,
    next_attempt_at: null,
    ...overrides,
  } as RunProgress;
}

function renderPanel(runId = 'run-1') {
  const store = configureStore({
    reducer: { [runApi.reducerPath]: runApi.reducer },
    middleware: (getDefault) => getDefault().concat(runApi.middleware),
  });
  return render(
    <Provider store={store}>
      <RunProgressPanel runId={runId} />
    </Provider>,
  );
}

async function panelText(): Promise<string> {
  const panel = await screen.findByTestId('run-progress-panel');
  await waitFor(() => expect(panel.textContent ?? '').toMatch(/steps completed/i));
  return panel.textContent ?? '';
}

/** The time of day as the panel may show it: the UTC and the local hour and minute. */
function timeOfDay(iso: string): RegExp {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  const utc = `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`;
  const local = `0?${date.getHours()}:${pad(date.getMinutes())}`;
  return new RegExp(`${utc}|${local}`);
}

describe('RunProgressPanel', () => {
  beforeEach(() => {
    cleanup();
    mockProgress = progress();
  });

  afterEach(() => {
    cleanup();
  });

  it('says what the task is doing, in words and never by a raw kind', async () => {
    renderPanel();

    const text = await panelText();

    expect(text).toContain('running codingWorkspace.writeFile');
    expect(text).not.toMatch(/running_tool|waiting_for_model|between_steps|waiting_to_retry|waiting_on_helpers/);
  });

  it('shows helpers finished while it waits on them', async () => {
    mockProgress = progress({ activity: { kind: 'waiting_on_helpers', label: '2 of 3 helpers finished' } });
    renderPanel();

    expect(await panelText()).toContain('2 of 3 helpers finished');
  });

  it('shows the steps completed, the stage it is in, the allowance, the time taken and the resumes', async () => {
    renderPanel();

    const text = await panelText();

    expect(text).toMatch(/steps completed\D{0,6}37|37\D{0,6}steps completed/i);
    expect(text).toContain('stage 3 of 5');
    expect(text).toContain('allowance used');
    expect(text).toMatch(/38\D+200/);
    expect(text).toMatch(/elapsed/i);
    expect(text).toMatch(/30\D+43/);
    expect(text).toMatch(/last progress/i);
    expect(text).toMatch(timeOfDay('2026-10-12T10:30:41.120000Z'));
    expect(text).toMatch(/resumes?\D{0,12}1\b/i);
    expect(text).not.toMatch(/Remaining work: unknown/);
  });

  it('says the remaining work is unknown when the task has no structure', async () => {
    mockProgress = progress({ structure: null, remaining: 'unknown' });
    renderPanel();

    const text = await panelText();

    expect(text).toContain('Remaining work: unknown');
    expect(text).not.toMatch(/stage \d+ of \d+/);
  });

  it('omits the allowance when the run has no task', async () => {
    mockProgress = progress();
    delete (mockProgress as any).allowance;
    renderPanel();

    expect(await panelText()).not.toContain('allowance used');
  });

  it('says an interrupted task will resume by itself, and when the interruption was found', async () => {
    mockProgress = progress({ state: 'interrupted', activity: { kind: 'between_steps' }, interrupted_at: '2026-10-12T10:12:00.000000Z' });
    renderPanel();

    const text = await panelText();

    expect(text).toContain('interrupted — will resume automatically');
    expect(text).toMatch(timeOfDay('2026-10-12T10:12:00.000000Z'));
  });

  it('says a task waiting on the provider is waiting to retry, and when the next attempt is due', async () => {
    mockProgress = progress({ state: 'waiting_provider_retry', activity: { kind: 'waiting_to_retry' }, next_attempt_at: '2026-10-12T10:41:10.000000Z' });
    renderPanel();

    const text = await panelText();

    expect(text).toContain('waiting to retry the model provider');
    expect(text).toMatch(timeOfDay('2026-10-12T10:41:10.000000Z'));
  });

  it.each([
    ['working', /working/i],
    ['resuming', /resuming|continuing/i],
    ['waiting_on_user', /waiting for you/i],
    ['finished', /finished/i],
    ['failed', /failed/i],
    ['cancelled', /cancelled/i],
  ] as const)('puts the %s state into words', async (state, words) => {
    mockProgress = progress({ state, activity: { kind: state === 'finished' || state === 'failed' || state === 'cancelled' ? 'none' : 'between_steps' } });
    renderPanel();

    const text = await panelText();

    expect(text).toMatch(words);
    expect(text).not.toMatch(/waiting_on_user|waiting_provider_retry/);
  });

  it('no_percent_for_unstructured_run: no percent sign anywhere in the panel', async () => {
    mockProgress = progress({ structure: null, remaining: 'unknown' });
    renderPanel();

    const text = await panelText();

    expect(text).not.toContain('%');
    expect(screen.getByTestId('run-progress-panel').innerHTML).not.toMatch(/%|percent/i);
  });

  it('shows no percent sign for a structured run either', async () => {
    renderPanel();

    expect(await panelText()).not.toContain('%');
  });

  it('reads the progress of the run it is given', async () => {
    mockProgress = progress({ run_id: 'run-other' });
    renderPanel('run-other');

    expect(await panelText()).toContain('stage 3 of 5');
  });
});
