import { describe, it, expect, vi, beforeEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import type { EvalRunDetail, EvalCaseResultSummary } from './types';

// Written before ./evalDashboardRealtime exists -- the side-effect import
// below is expected to fail to resolve until that module is created. That
// failure is the correct, expected state right now.
//
// Design commitment this file pins down (contracts describe the two event
// payloads but not the exact cache-merge shape, so this test commits to
// one): the EvalRunCaseResultRecorded handler patches an already-cached
// getRunCases entry in place when one with the same id exists, and
// otherwise appends a lightweight placeholder entry for it -- the payload
// never carries the case's full content (produced_response/
// attempted_actions/expectation_results/error_message), so a
// newly-appended placeholder fills those with empty defaults until the
// full case detail is fetched on demand. A run whose case list was never
// fetched is left untouched. Separately, and regardless of whether the
// case list itself is cached, the handler invalidates that exact case's
// getCaseDetail cache entry so an *open* detail panel re-fetches full
// content -- an event-triggered re-fetch, not a poll, exactly the
// precedent this package's own run-diagram realtime module already
// established for action updates.

const RUN_ID = 'eval-run-1';
const CASE_ID = 'eval-case-result-1';

vi.mock('./config', () => ({
  backend: {
    url: 'http://localhost:8000',
    token: 'test-token',
    user: { id: 'user-1', name: 'Test User', email: 'test@test.com' },
  },
  updateFrontend: () => {},
}));

const registered: { event: string; handler: (event: any, dispatch: any) => void }[] = [];

let runDetailSeed: EvalRunDetail | null = null;
let runCasesSeed: { data: EvalCaseResultSummary[]; meta: any } | null = null;
let caseDetailSeed: unknown = null;

let runDetailFetchCount = 0;
let runCasesFetchCount = 0;
let caseDetailFetchCount = 0;

vi.mock('@clarion-app/frontend-base', () => ({
  createBackendConfig: () => ({
    backend: { url: 'http://localhost:8000', user: { id: '', name: '', email: '' } },
    updateFrontend: () => {},
  }),
  createBaseQuery: () => async (args: any) => {
    const url = typeof args === 'string' ? args : args?.url;

    if (url === `/eval-runs/${RUN_ID}`) {
      runDetailFetchCount += 1;
      return { data: runDetailSeed };
    }
    if (url === `/eval-runs/${RUN_ID}/cases`) {
      runCasesFetchCount += 1;
      return { data: runCasesSeed };
    }
    if (url === `/eval-runs/${RUN_ID}/cases/${CASE_ID}/detail`) {
      caseDetailFetchCount += 1;
      return { data: caseDetailSeed };
    }
    return { data: {} };
  },
  registerUserChannelHandler: (h: any) => registered.push(h),
}));

const { evalDashboardApi } = await import('./evalDashboardApi');
// Import triggers the side-effect registration (does not exist yet --
// expected to fail to resolve this module).
await import('./evalDashboardRealtime');

function createTestStore() {
  return configureStore({
    reducer: {
      [evalDashboardApi.reducerPath]: evalDashboardApi.reducer,
    },
    middleware: (getDefault) => getDefault().concat(evalDashboardApi.middleware),
  });
}

const makeRunDetail = (overrides: Partial<EvalRunDetail> = {}): EvalRunDetail => ({
  id: RUN_ID,
  suite_id: 'suite-1',
  agent_label: 'home-automation-agent',
  status: 'in_progress',
  case_count: 3,
  completed_count: 1,
  remaining_count: 2,
  started_at: '2026-08-11T10:00:00.000000Z',
  completed_at: null,
  failure_reason: null,
  overall: 'pass',
  outcome_counts: { pass: 1, fail: 0, needs_human_review: 0, errored: 0, unjudged: 0 },
  consumption: {
    total_cost: 0,
    cost_currency: 'USD',
    cost_unpriced: false,
    total_tokens: 0,
    tool_invocation_count: 0,
    total_duration_ms: 0,
    judging: { total_cost: 0, total_tokens: 0, invocation_count: 0, cost_unpriced: false },
  },
  ...overrides,
});

const makeCaseResultSummary = (overrides: Partial<EvalCaseResultSummary> = {}): EvalCaseResultSummary => ({
  id: CASE_ID,
  eval_case_id: 'eval-case-1',
  eval_case_version_id: 'eval-case-version-1',
  outcome: 'pass',
  outcome_override: null,
  produced_response: 'the produced response',
  attempted_actions: [],
  expectation_results: [],
  error_message: null,
  created_at: '2026-08-11T10:00:05.000000Z',
  ...overrides,
});

const makeCaseTick = (overrides: Partial<{
  id: string;
  run_id: string;
  eval_case_id: string;
  outcome: string;
  outcome_override: string | null;
  created_at: string;
}> = {}) => ({
  id: CASE_ID,
  run_id: RUN_ID,
  eval_case_id: 'eval-case-1',
  outcome: 'fail',
  outcome_override: null,
  created_at: '2026-08-11T10:00:10.000000Z',
  ...overrides,
});

function handlerFor(eventName: string) {
  const entry = registered.find((r) => r.event === eventName);
  if (!entry) {
    throw new Error(`No handler registered for ${eventName}`);
  }
  return entry.handler;
}

describe('evalDashboardRealtime — registration', () => {
  it('registers a handler for both eval-run live-update event names', () => {
    const names = registered.map((r) => r.event);
    expect(names).toEqual(
      expect.arrayContaining([
        '.ClarionApp\\LlmClient\\Events\\EvalRunUpdated',
        '.ClarionApp\\LlmClient\\Events\\EvalRunCaseResultRecorded',
      ]),
    );
    expect(registered).toHaveLength(2);
  });
});

describe('evalDashboardRealtime — EvalRunUpdated handler', () => {
  beforeEach(() => {
    runDetailSeed = makeRunDetail();
    runDetailFetchCount = 0;
  });

  it('replaces the cached run-detail entry in place when the run id is cached, without an extra fetch', async () => {
    const store = createTestStore();
    await store.dispatch(evalDashboardApi.endpoints.getRunDetail.initiate(RUN_ID));
    expect(runDetailFetchCount).toBe(1);

    const pushed = makeRunDetail({
      status: 'completed',
      completed_count: 3,
      remaining_count: 0,
      completed_at: '2026-08-11T10:05:00.000000Z',
      overall: 'pass',
    });
    handlerFor('.ClarionApp\\LlmClient\\Events\\EvalRunUpdated')(pushed, store.dispatch);

    const cached = evalDashboardApi.endpoints.getRunDetail.select(RUN_ID)(store.getState() as any).data;
    expect(cached).toEqual(pushed);
    // Upsert, not a re-fetch.
    expect(runDetailFetchCount).toBe(1);
  });

  it('is a no-op (does not throw, does not fabricate a cache entry) when the run id is not cached', () => {
    const store = createTestStore();

    expect(() =>
      handlerFor('.ClarionApp\\LlmClient\\Events\\EvalRunUpdated')(
        makeRunDetail({ id: 'run-elsewhere' }),
        store.dispatch,
      ),
    ).not.toThrow();

    const cached = evalDashboardApi.endpoints.getRunDetail.select('run-elsewhere')(store.getState() as any).data;
    expect(cached).toBeUndefined();
  });
});

describe('evalDashboardRealtime — EvalRunCaseResultRecorded handler (run-cases list)', () => {
  beforeEach(() => {
    runCasesSeed = {
      data: [makeCaseResultSummary()],
      meta: { current_page: 1, per_page: 25, total: 1, last_page: 1 },
    };
    runCasesFetchCount = 0;
  });

  it('patches an existing entry in the cached case list in place, without an extra fetch', async () => {
    const store = createTestStore();
    await store.dispatch(evalDashboardApi.endpoints.getRunCases.initiate({ runId: RUN_ID }));
    expect(runCasesFetchCount).toBe(1);

    handlerFor('.ClarionApp\\LlmClient\\Events\\EvalRunCaseResultRecorded')(makeCaseTick(), store.dispatch);

    const cached = evalDashboardApi.endpoints.getRunCases.select({ runId: RUN_ID })(store.getState() as any).data;
    expect(cached?.data).toHaveLength(1);
    expect(cached?.data[0].outcome).toBe('fail');
    // Upsert, not a re-fetch of the whole list.
    expect(runCasesFetchCount).toBe(1);
  });

  it('appends a lightweight placeholder entry for a case not yet in the cached list', async () => {
    const store = createTestStore();
    await store.dispatch(evalDashboardApi.endpoints.getRunCases.initiate({ runId: RUN_ID }));

    const tick = makeCaseTick({ id: 'eval-case-result-2', eval_case_id: 'eval-case-2', outcome: 'pass' });
    handlerFor('.ClarionApp\\LlmClient\\Events\\EvalRunCaseResultRecorded')(tick, store.dispatch);

    const cached = evalDashboardApi.endpoints.getRunCases.select({ runId: RUN_ID })(store.getState() as any).data;
    const ids = cached?.data.map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining([CASE_ID, 'eval-case-result-2']));

    const appended = cached?.data.find((c) => c.id === 'eval-case-result-2');
    expect(appended?.outcome).toBe('pass');
  });

  it('is a no-op on the case list when this run\'s case list was never fetched', () => {
    const store = createTestStore();

    expect(() =>
      handlerFor('.ClarionApp\\LlmClient\\Events\\EvalRunCaseResultRecorded')(
        makeCaseTick({ run_id: 'run-elsewhere' }),
        store.dispatch,
      ),
    ).not.toThrow();

    const cached = evalDashboardApi.endpoints.getRunCases.select({ runId: 'run-elsewhere' })(store.getState() as any).data;
    expect(cached).toBeUndefined();
  });
});

describe('evalDashboardRealtime — EvalRunCaseResultRecorded triggers an open case-detail panel to re-fetch (event-triggered, not polling)', () => {
  beforeEach(() => {
    caseDetailSeed = { ...makeCaseResultSummary(), given: 'x', expected_behavior: 'y' };
    caseDetailFetchCount = 0;
  });

  it('re-fetches the case-detail endpoint exactly once when that exact case\'s detail panel is open (actively subscribed)', async () => {
    const store = createTestStore();
    const subscription = store.dispatch(
      evalDashboardApi.endpoints.getCaseDetail.initiate({ runId: RUN_ID, caseResultId: CASE_ID }),
    );
    await subscription;
    expect(caseDetailFetchCount).toBe(1);

    handlerFor('.ClarionApp\\LlmClient\\Events\\EvalRunCaseResultRecorded')(makeCaseTick(), store.dispatch);

    await vi.waitFor(() => expect(caseDetailFetchCount).toBe(2));

    subscription.unsubscribe();
  });

  it('does not fetch the case-detail endpoint for a different case id', async () => {
    const store = createTestStore();
    const subscription = store.dispatch(
      evalDashboardApi.endpoints.getCaseDetail.initiate({ runId: RUN_ID, caseResultId: CASE_ID }),
    );
    await subscription;
    expect(caseDetailFetchCount).toBe(1);

    handlerFor('.ClarionApp\\LlmClient\\Events\\EvalRunCaseResultRecorded')(
      makeCaseTick({ id: 'some-other-case' }),
      store.dispatch,
    );

    // Give any (incorrect) async refetch a chance to happen before asserting it didn't.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(caseDetailFetchCount).toBe(1);

    subscription.unsubscribe();
  });

  it('does not fetch the case-detail endpoint once the panel has been closed (unsubscribed) — not a poll', async () => {
    const store = createTestStore();
    const subscription = store.dispatch(
      evalDashboardApi.endpoints.getCaseDetail.initiate({ runId: RUN_ID, caseResultId: CASE_ID }),
    );
    await subscription;
    expect(caseDetailFetchCount).toBe(1);

    subscription.unsubscribe();

    handlerFor('.ClarionApp\\LlmClient\\Events\\EvalRunCaseResultRecorded')(makeCaseTick(), store.dispatch);

    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(caseDetailFetchCount).toBe(1);
  });
});
