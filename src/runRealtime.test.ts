import { describe, it, expect, vi, beforeEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import type { RunSummary, StepSummary, ActionSummary, ActionDetail } from './types';

// Phase 6 (T058), User Story 3 — mirrors serverStatusRealtime.test.ts's own
// structure exactly: a real RTK Query store (not a mocked `util`), a mocked
// `@clarion-app/frontend-base` capturing every registerUserChannelHandler()
// call, and a mocked createBaseQuery keyed by URL so cache-hydration and
// "did a network call actually happen" are both directly observable.
//
// Written before ./runRealtime exists — the side-effect import below is
// expected to fail to resolve (module not found) until Phase 6's
// implementation (T065) creates it. That failure is the correct, expected
// state for this phase.
//
// Design assumption (not fully pinned by contracts/run-realtime-events.md,
// documented here since this test commits to a shape): the RunActionUpdated
// handler upserts-in-place into the getStepActions/getActionChildren caches
// via `runApi.util.updateQueryData` (no network call — verified below by a
// fetch-count assertion on those endpoints' URLs), and *separately*
// invalidates the `RunActions`-tagged getActionDetail cache entry for that
// same action id. Because getActionDetail is tagged `{ type: 'RunActions',
// id: actionId }` (runApi.ts) and RTK Query only actually re-fetches an
// invalidated tag for an *actively subscribed* query, "triggers exactly one
// detail re-fetch, not a poll" falls out of RTK Query's own subscription
// semantics: a component with the detail panel open holds a live
// subscription (re-fetches); a closed/never-opened panel holds none
// (silently no-ops) — no separate "is the panel open" tracking state is
// needed in the module for this to hold.

const RUN_ID = 'run-1';
const STEP_ID = 'step-1';
const PARENT_ACTION_ID = 'action-parent';
const CHILD_ACTION_ID = 'action-child';

vi.mock('./config', () => ({
  backend: {
    url: 'http://localhost:8000',
    token: 'test-token',
    user: { id: 'user-1', name: 'Test User', email: 'test@test.com' },
  },
  updateFrontend: () => {},
}));

const registered: { event: string; handler: (event: any, dispatch: any) => void }[] = [];

let runSeed: RunSummary | null = null;
let stepsSeed: { data: StepSummary[]; meta: any } | null = null;
let stepActionsSeed: { data: ActionSummary[]; meta: any } | null = null;
let actionChildrenSeed: { data: ActionSummary[]; meta: any } | null = null;
let actionDetailSeed: ActionDetail | null = null;

let runFetchCount = 0;
let stepsFetchCount = 0;
let stepActionsFetchCount = 0;
let actionChildrenFetchCount = 0;
let actionDetailFetchCount = 0;

vi.mock('@clarion-app/frontend-base', () => ({
  createBackendConfig: () => ({
    backend: { url: 'http://localhost:8000', user: { id: '', name: '', email: '' } },
    updateFrontend: () => {},
  }),
  createBaseQuery: () => async (args: any) => {
    const url = typeof args === 'string' ? args : args?.url;

    if (url === `/agent-runs/${RUN_ID}`) {
      runFetchCount += 1;
      return { data: runSeed };
    }
    if (url === `/agent-runs/${RUN_ID}/steps`) {
      stepsFetchCount += 1;
      return { data: stepsSeed };
    }
    if (url === `/agent-runs/${RUN_ID}/steps/${STEP_ID}/actions`) {
      stepActionsFetchCount += 1;
      return { data: stepActionsSeed };
    }
    if (url === `/agent-runs/${RUN_ID}/actions/${PARENT_ACTION_ID}/children`) {
      actionChildrenFetchCount += 1;
      return { data: actionChildrenSeed };
    }
    if (url === `/agent-runs/${RUN_ID}/actions/${PARENT_ACTION_ID}`) {
      actionDetailFetchCount += 1;
      return { data: actionDetailSeed };
    }
    return { data: {} };
  },
  registerUserChannelHandler: (h: any) => registered.push(h),
}));

const { runApi } = await import('./runApi');
// Import triggers the side-effect registration (does not exist yet — T058
// is expected to fail to resolve this module).
await import('./runRealtime');

function createTestStore() {
  return configureStore({
    reducer: {
      [runApi.reducerPath]: runApi.reducer,
    },
    middleware: (getDefault) => getDefault().concat(runApi.middleware),
  });
}

const makeRunSummary = (overrides: Partial<RunSummary> = {}): RunSummary => ({
  id: RUN_ID,
  kind: 'interactive',
  end_state: 'in_progress',
  end_reason: null,
  started_at: '2026-08-06T14:02:11.000000Z',
  ended_at: null,
  duration_ms: null,
  step_count: 1,
  action_count: 1,
  conversation_id: null,
  ...overrides,
});

const makeStepSummary = (overrides: Partial<StepSummary> = {}): StepSummary => ({
  id: STEP_ID,
  run_id: RUN_ID,
  position: 1,
  end_state: 'in_progress',
  end_reason: null,
  started_at: '2026-08-06T14:02:14.000000Z',
  ended_at: null,
  duration_ms: null,
  wait_ms: null,
  attempt_count: 1,
  action_count: 0,
  ...overrides,
});

const makeActionSummary = (overrides: Partial<ActionSummary> = {}): ActionSummary => ({
  id: PARENT_ACTION_ID,
  run_id: RUN_ID,
  step_id: STEP_ID,
  parent_action_id: null,
  action_type: 'tool_invocation',
  target: 'search_operations',
  outcome: 'in_progress',
  failure_reason: null,
  started_at: '2026-08-06T14:02:14.300000Z',
  ended_at: null,
  duration_ms: null,
  has_children: false,
  ...overrides,
});

function handlerFor(eventName: string) {
  const entry = registered.find((r) => r.event === eventName);
  if (!entry) {
    throw new Error(`No handler registered for ${eventName}`);
  }
  return entry.handler;
}

describe('runRealtime — registration', () => {
  it('registers a handler for all three run event names', () => {
    const names = registered.map((r) => r.event);
    expect(names).toEqual(
      expect.arrayContaining([
        '.ClarionApp\\LlmClient\\Events\\RunUpdated',
        '.ClarionApp\\LlmClient\\Events\\RunStepUpdated',
        '.ClarionApp\\LlmClient\\Events\\RunActionUpdated',
      ]),
    );
    expect(registered).toHaveLength(3);
  });
});

describe('runRealtime — RunUpdated handler', () => {
  beforeEach(() => {
    runSeed = makeRunSummary();
    runFetchCount = 0;
  });

  it('replaces the cached run entry in place when the run id is cached, without an extra fetch', async () => {
    const store = createTestStore();
    await store.dispatch(runApi.endpoints.getRun.initiate(RUN_ID));
    expect(runFetchCount).toBe(1);

    const pushed = makeRunSummary({ end_state: 'completed', ended_at: '2026-08-06T14:02:20.000000Z', duration_ms: 9000 });
    handlerFor('.ClarionApp\\LlmClient\\Events\\RunUpdated')(pushed, store.dispatch);

    const cached = runApi.endpoints.getRun.select(RUN_ID)(store.getState() as any).data;
    expect(cached).toEqual(pushed);
    // Upsert, not a re-fetch.
    expect(runFetchCount).toBe(1);
  });

  it('is a no-op (does not throw, does not fabricate a cache entry) when the run id is not cached', () => {
    const store = createTestStore();

    expect(() =>
      handlerFor('.ClarionApp\\LlmClient\\Events\\RunUpdated')(makeRunSummary({ id: 'run-elsewhere' }), store.dispatch),
    ).not.toThrow();

    const cached = runApi.endpoints.getRun.select('run-elsewhere')(store.getState() as any).data;
    expect(cached).toBeUndefined();
  });
});

describe('runRealtime — RunStepUpdated handler', () => {
  beforeEach(() => {
    stepsSeed = {
      data: [makeStepSummary()],
      meta: { current_page: 1, per_page: 100, total: 1, last_page: 1 },
    };
    stepsFetchCount = 0;
  });

  it('replaces an existing step in the cached step list in place, without an extra fetch', async () => {
    const store = createTestStore();
    await store.dispatch(runApi.endpoints.getRunSteps.initiate(RUN_ID));
    expect(stepsFetchCount).toBe(1);

    const pushed = makeStepSummary({ end_state: 'completed', ended_at: '2026-08-06T14:02:20.000000Z', duration_ms: 6000 });
    handlerFor('.ClarionApp\\LlmClient\\Events\\RunStepUpdated')(pushed, store.dispatch);

    const cached = runApi.endpoints.getRunSteps.select(RUN_ID)(store.getState() as any).data;
    expect(cached?.data).toHaveLength(1);
    expect(cached?.data[0]).toEqual(pushed);
    // Upsert, not a re-fetch of the whole list.
    expect(stepsFetchCount).toBe(1);
  });

  it('appends a newly-opened step to an already-cached step list rather than dropping it', async () => {
    const store = createTestStore();
    await store.dispatch(runApi.endpoints.getRunSteps.initiate(RUN_ID));

    const newStep = makeStepSummary({ id: 'step-2', position: 2 });
    handlerFor('.ClarionApp\\LlmClient\\Events\\RunStepUpdated')(newStep, store.dispatch);

    const cached = runApi.endpoints.getRunSteps.select(RUN_ID)(store.getState() as any).data;
    const ids = cached?.data.map((s) => s.id);
    expect(ids).toEqual(expect.arrayContaining([STEP_ID, 'step-2']));
  });

  it('is a no-op when this run\'s step list has never been fetched (diagram not open for this run)', () => {
    const store = createTestStore();

    expect(() =>
      handlerFor('.ClarionApp\\LlmClient\\Events\\RunStepUpdated')(makeStepSummary({ run_id: 'run-elsewhere' }), store.dispatch),
    ).not.toThrow();

    const cached = runApi.endpoints.getRunSteps.select('run-elsewhere')(store.getState() as any).data;
    expect(cached).toBeUndefined();
  });
});

describe('runRealtime — RunActionUpdated handler (top-level, step-scoped list)', () => {
  beforeEach(() => {
    stepActionsSeed = {
      data: [makeActionSummary()],
      meta: { current_page: 1, per_page: 50, total: 1, last_page: 1 },
    };
    stepActionsFetchCount = 0;
  });

  it('replaces an existing action in the cached step-actions list in place, without an extra fetch', async () => {
    const store = createTestStore();
    await store.dispatch(runApi.endpoints.getStepActions.initiate({ runId: RUN_ID, stepId: STEP_ID }));
    expect(stepActionsFetchCount).toBe(1);

    const pushed = makeActionSummary({ outcome: 'success', ended_at: '2026-08-06T14:02:15.000000Z', duration_ms: 700 });
    handlerFor('.ClarionApp\\LlmClient\\Events\\RunActionUpdated')(pushed, store.dispatch);

    const cached = runApi.endpoints.getStepActions.select({ runId: RUN_ID, stepId: STEP_ID })(store.getState() as any).data;
    expect(cached?.data).toHaveLength(1);
    expect(cached?.data[0]).toEqual(pushed);
    // Upsert, not a re-fetch of the list itself.
    expect(stepActionsFetchCount).toBe(1);
  });

  it('appends a new sibling action to an already-loaded step-actions list', async () => {
    const store = createTestStore();
    await store.dispatch(runApi.endpoints.getStepActions.initiate({ runId: RUN_ID, stepId: STEP_ID }));

    const sibling = makeActionSummary({ id: 'action-sibling', target: 'search_b' });
    handlerFor('.ClarionApp\\LlmClient\\Events\\RunActionUpdated')(sibling, store.dispatch);

    const cached = runApi.endpoints.getStepActions.select({ runId: RUN_ID, stepId: STEP_ID })(store.getState() as any).data;
    const ids = cached?.data.map((a) => a.id);
    expect(ids).toEqual(expect.arrayContaining([PARENT_ACTION_ID, 'action-sibling']));
  });

  it('is a no-op when the step\'s action list was never expanded/fetched', () => {
    const store = createTestStore();

    expect(() =>
      handlerFor('.ClarionApp\\LlmClient\\Events\\RunActionUpdated')(
        makeActionSummary({ id: 'action-elsewhere', step_id: 'step-never-opened' }),
        store.dispatch,
      ),
    ).not.toThrow();

    const cached = runApi.endpoints.getStepActions.select({ runId: RUN_ID, stepId: 'step-never-opened' })(store.getState() as any).data;
    expect(cached).toBeUndefined();
  });
});

describe('runRealtime — RunActionUpdated handler (nested, parent-action-scoped list)', () => {
  beforeEach(() => {
    actionChildrenSeed = {
      data: [makeActionSummary({ id: CHILD_ACTION_ID, parent_action_id: PARENT_ACTION_ID, action_type: 'llm_request', target: 'child-model' })],
      meta: { current_page: 1, per_page: 50, total: 1, last_page: 1 },
    };
    actionChildrenFetchCount = 0;
  });

  it('replaces an existing child action in the cached children list in place, without an extra fetch', async () => {
    const store = createTestStore();
    await store.dispatch(runApi.endpoints.getActionChildren.initiate({ runId: RUN_ID, actionId: PARENT_ACTION_ID }));
    expect(actionChildrenFetchCount).toBe(1);

    const pushed = makeActionSummary({
      id: CHILD_ACTION_ID,
      parent_action_id: PARENT_ACTION_ID,
      action_type: 'llm_request',
      target: 'child-model',
      outcome: 'success',
      ended_at: '2026-08-06T14:02:16.000000Z',
      duration_ms: 400,
    });
    handlerFor('.ClarionApp\\LlmClient\\Events\\RunActionUpdated')(pushed, store.dispatch);

    const cached = runApi.endpoints.getActionChildren.select({ runId: RUN_ID, actionId: PARENT_ACTION_ID })(store.getState() as any).data;
    expect(cached?.data).toHaveLength(1);
    expect(cached?.data[0]).toEqual(pushed);
    expect(actionChildrenFetchCount).toBe(1);
  });

  it('is a no-op when the parent action was never expanded (children list never fetched)', () => {
    const store = createTestStore();

    expect(() =>
      handlerFor('.ClarionApp\\LlmClient\\Events\\RunActionUpdated')(
        makeActionSummary({ id: 'grandchild', parent_action_id: 'parent-never-opened' }),
        store.dispatch,
      ),
    ).not.toThrow();

    const cached = runApi.endpoints.getActionChildren.select({ runId: RUN_ID, actionId: 'parent-never-opened' })(store.getState() as any).data;
    expect(cached).toBeUndefined();
  });
});

describe('runRealtime — RunActionUpdated triggers an open detail panel to re-fetch (event-triggered, not polling)', () => {
  beforeEach(() => {
    actionDetailSeed = {
      ...makeActionSummary(),
      content: 'original content',
      content_truncated: false,
    };
    actionDetailFetchCount = 0;
  });

  it('re-fetches the detail endpoint exactly once when that exact action\'s detail panel is open (actively subscribed)', async () => {
    const store = createTestStore();
    const subscription = store.dispatch(
      runApi.endpoints.getActionDetail.initiate({ runId: RUN_ID, actionId: PARENT_ACTION_ID }),
    );
    await subscription;
    expect(actionDetailFetchCount).toBe(1);

    handlerFor('.ClarionApp\\LlmClient\\Events\\RunActionUpdated')(
      makeActionSummary({ outcome: 'success', ended_at: '2026-08-06T14:02:16.000000Z', duration_ms: 400 }),
      store.dispatch,
    );

    await vi.waitFor(() => expect(actionDetailFetchCount).toBe(2));

    subscription.unsubscribe();
  });

  it('does not fetch the detail endpoint for a different action id', async () => {
    const store = createTestStore();
    const subscription = store.dispatch(
      runApi.endpoints.getActionDetail.initiate({ runId: RUN_ID, actionId: PARENT_ACTION_ID }),
    );
    await subscription;
    expect(actionDetailFetchCount).toBe(1);

    handlerFor('.ClarionApp\\LlmClient\\Events\\RunActionUpdated')(
      makeActionSummary({ id: 'some-other-action' }),
      store.dispatch,
    );

    // Give any (incorrect) async refetch a chance to happen before asserting it didn't.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(actionDetailFetchCount).toBe(1);

    subscription.unsubscribe();
  });

  it('does not fetch the detail endpoint once the panel has been closed (unsubscribed) — not a poll', async () => {
    const store = createTestStore();
    const subscription = store.dispatch(
      runApi.endpoints.getActionDetail.initiate({ runId: RUN_ID, actionId: PARENT_ACTION_ID }),
    );
    await subscription;
    expect(actionDetailFetchCount).toBe(1);

    subscription.unsubscribe();

    handlerFor('.ClarionApp\\LlmClient\\Events\\RunActionUpdated')(
      makeActionSummary({ outcome: 'success' }),
      store.dispatch,
    );

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(actionDetailFetchCount).toBe(1);
  });
});
