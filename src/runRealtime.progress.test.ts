import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { Provider } from 'react-redux';
import { render, cleanup, act } from '@testing-library/react';

/**
 * The open run's progress stays live. A RunUpdated, RunStepUpdated or
 * RunActionUpdated event for the run whose progress is open refetches that
 * progress, and an event for another run does not. While the task is working,
 * resuming or waiting to retry the provider, the panel also polls every ten
 * seconds, as a fallback for when broadcasting is down; in any other state it
 * does not poll.
 */

vi.mock('./config', () => ({
  backend: {
    url: 'http://localhost:8000',
    token: 'test-token',
    user: { id: 'user-1', name: 'Test User', email: 'test@test.com' },
  },
  updateFrontend: () => {},
}));

const RUN_ID = 'run-1';
const registered: { event: string; handler: (event: any, dispatch: any) => void }[] = [];
let progressState = 'working';
let progressFetches = 0;

vi.mock('@clarion-app/frontend-base', () => ({
  createBackendConfig: () => ({
    backend: { url: 'http://localhost:8000', user: { id: '', name: '', email: '' } },
    updateFrontend: () => {},
  }),
  createBaseQuery: () => async (args: any) => {
    const url = typeof args === 'string' ? args : (args?.url ?? '');
    if (String(url) === `/agent-runs/${RUN_ID}/progress`) {
      progressFetches += 1;
      return {
        data: {
          run_id: RUN_ID,
          state: progressState,
          activity: { kind: 'between_steps' },
          steps_completed: 3,
          structure: null,
          remaining: 'unknown',
          started_at: '2026-10-12T10:00:00.000000Z',
          elapsed_ms: 1000,
          last_progress_at: '2026-10-12T10:00:01.000000Z',
          resume_count: 0,
          interrupted_at: null,
          next_attempt_at: null,
        },
      };
    }
    return { data: {} };
  },
  registerUserChannelHandler: (h: any) => registered.push(h),
}));

const { runApi } = await import('./runApi');
await import('./runRealtime');

function createTestStore() {
  return configureStore({
    reducer: { [runApi.reducerPath]: runApi.reducer },
    middleware: (getDefault) => getDefault().concat(runApi.middleware),
  });
}

function handlerFor(eventName: string) {
  const entry = registered.find((r) => r.event === eventName);
  if (!entry) {
    throw new Error(`No handler registered for ${eventName}`);
  }
  return entry.handler;
}

const runSummary = (id: string) => ({
  id,
  kind: 'interactive',
  end_state: 'in_progress',
  end_reason: null,
  started_at: '2026-10-12T10:00:00.000000Z',
  ended_at: null,
  duration_ms: null,
  step_count: 1,
  action_count: 1,
  conversation_id: null,
});

/**
 * Advance the fake clock in half-second steps, each inside act(), so React
 * renders what the timers and requests produce as it would in real time.
 */
async function advance(ms: number) {
  let left = ms;
  do {
    const step = Math.min(left, 500);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(step);
    });
    left -= step;
  } while (left > 0);
}

/** Let the queued requests and their promise chains settle. */
async function settle() {
  await advance(0);
  await advance(0);
}

// The query library keeps its subscription bookkeeping per API, not per store,
// so every subscription a test opens is closed again before the next test.
const openSubscriptions: { unsubscribe: () => void }[] = [];

describe('runRealtime — progress refetch on live events', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    progressFetches = 0;
    progressState = 'working';
  });

  afterEach(async () => {
    openSubscriptions.splice(0).forEach((subscription) => subscription.unsubscribe());
    cleanup();
    await advance(1000);
    vi.useRealTimers();
  });

  const events: [string, (runId: string) => any][] = [
    ['.ClarionApp\\LlmClient\\Events\\RunUpdated', (runId) => runSummary(runId)],
    [
      '.ClarionApp\\LlmClient\\Events\\RunStepUpdated',
      (runId) => ({ id: 'step-1', run_id: runId, position: 1, end_state: 'in_progress', end_reason: null, started_at: '2026-10-12T10:00:00.000000Z', ended_at: null, duration_ms: null, wait_ms: null, attempt_count: 1, action_count: 0 }),
    ],
    [
      '.ClarionApp\\LlmClient\\Events\\RunActionUpdated',
      (runId) => ({ id: 'action-1', run_id: runId, step_id: 'step-1', parent_action_id: null, action_type: 'tool_invocation', target: 'x', outcome: 'in_progress', failure_reason: null, started_at: '2026-10-12T10:00:00.000000Z', ended_at: null, duration_ms: null, has_children: false }),
    ],
  ];

  it.each(events)('%s for the open run refetches its progress', async (eventName, payload) => {
    const store = createTestStore();
    openSubscriptions.push(store.dispatch(runApi.endpoints.getRunProgress.initiate(RUN_ID)));
    await settle();
    expect(progressFetches).toBe(1);

    handlerFor(eventName)(payload(RUN_ID), store.dispatch);
    await settle();

    expect(progressFetches).toBe(2);
  });

  it.each(events)('%s for another run leaves the open run\'s progress alone', async (eventName, payload) => {
    const store = createTestStore();
    openSubscriptions.push(store.dispatch(runApi.endpoints.getRunProgress.initiate(RUN_ID)));
    await settle();

    handlerFor(eventName)(payload('run-elsewhere'), store.dispatch);
    await settle();

    expect(progressFetches).toBe(1);
  });

  it.each(events)('%s when no progress is open fetches nothing', async (eventName, payload) => {
    const store = createTestStore();

    handlerFor(eventName)(payload(RUN_ID), store.dispatch);
    await settle();

    expect(progressFetches).toBe(0);
  });
});

describe('RunProgressPanel — the ten second poll', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    progressFetches = 0;
  });

  afterEach(async () => {
    cleanup();
    await advance(1000);
    vi.useRealTimers();
  });

  async function mountPanel() {
    // Resolved at run time, so the live-event tests above stay independent of the panel's own module.
    const panelModule = './RunProgressPanel';
    const { RunProgressPanel } = await import(/* @vite-ignore */ panelModule);
    return render(React.createElement(Provider, { store: createTestStore() } as any, React.createElement(RunProgressPanel, { runId: RUN_ID })));
  }

  it.each(['working', 'resuming', 'waiting_provider_retry'])('polls every ten seconds while the task is %s', async (state) => {
    progressState = state;
    await mountPanel();
    await settle();
    expect(progressFetches).toBe(1);

    await advance(9000);
    expect(progressFetches, 'not before ten seconds').toBe(1);

    await advance(2500);
    expect(progressFetches, 'once at ten seconds (the query library batches subscription changes for half a second)').toBe(2);

    await advance(10500);
    expect(progressFetches, 'and again ten seconds later').toBe(3);
  });

  it.each(['finished', 'failed', 'cancelled', 'waiting_on_user', 'interrupted'])('does not poll while the task is %s', async (state) => {
    progressState = state;
    await mountPanel();
    await settle();
    expect(progressFetches).toBe(1);

    await advance(60000);

    expect(progressFetches).toBe(1);
  });

  it('stops polling once the task finishes', async () => {
    progressState = 'working';
    await mountPanel();
    await settle();
    expect(progressFetches).toBe(1);

    progressState = 'finished';
    await advance(11500);
    expect(progressFetches, 'the poll that saw it finish').toBe(2);

    await advance(60000);
    expect(progressFetches, 'and no poll after').toBe(2);
  });
});
