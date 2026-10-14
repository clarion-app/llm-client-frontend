import { describe, it, expect, vi, beforeEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

/**
 * The two reads behind a task's progress view, on the run API slice the
 * package already registers: `getRunProgress(runId)` reads
 * `agent-runs/{id}/progress`, and `getRunResumeEvents({ runId, page })` reads
 * `agent-runs/{id}/resume-events?page=N`. No new slice is introduced, so the
 * slice keeps its reducer path (the host's generated store names it) and the
 * package manifest needs no new entry.
 */

vi.mock('./config', () => ({
  backend: {
    url: 'http://localhost:8000',
    token: 'test-token',
    user: { id: 'user-1', name: 'Test User', email: 'test@test.com' },
  },
  updateFrontend: () => {},
}));

const requested: string[] = [];

vi.mock('@clarion-app/frontend-base', () => ({
  createBackendConfig: () => ({
    backend: { url: 'http://localhost:8000', user: { id: '', name: '', email: '' } },
    updateFrontend: () => {},
  }),
  createBaseQuery: () => async (args: any) => {
    const url = typeof args === 'string' ? args : (args?.url ?? '');
    requested.push(String(url));
    if (String(url).includes('/progress')) {
      return { data: { run_id: 'run-1', state: 'working' } };
    }
    return { data: { data: [], meta: { current_page: 1, per_page: 50, total: 0, last_page: 1 } } };
  },
  registerUserChannelHandler: () => {},
}));

const runApiModule = await import('./runApi');
const { runApi } = runApiModule;

function createTestStore() {
  return configureStore({
    reducer: { [runApi.reducerPath]: runApi.reducer },
    middleware: (getDefault) => getDefault().concat(runApi.middleware),
  });
}

describe('runApi — progress reads', () => {
  beforeEach(() => {
    requested.length = 0;
  });

  it('keeps the slice\'s reducer path, so the host store and the manifest are unchanged', () => {
    expect(runApi.reducerPath).toBe('llm-client-runApi');
  });

  it('getRunProgress reads agent-runs/{id}/progress', async () => {
    const store = createTestStore();

    const result = await store.dispatch(runApi.endpoints.getRunProgress.initiate('run-1'));

    expect(requested).toEqual(['/agent-runs/run-1/progress']);
    expect(result.data).toEqual({ run_id: 'run-1', state: 'working' });
  });

  it('getRunResumeEvents reads agent-runs/{id}/resume-events with the page asked for', async () => {
    const store = createTestStore();

    await store.dispatch(runApi.endpoints.getRunResumeEvents.initiate({ runId: 'run-1', page: 2 }));

    expect(requested).toEqual(['/agent-runs/run-1/resume-events?page=2']);
  });

  it('getRunResumeEvents without a page reads the first page', async () => {
    const store = createTestStore();

    await store.dispatch(runApi.endpoints.getRunResumeEvents.initiate({ runId: 'run-1' }));

    expect(requested).toHaveLength(1);
    expect(requested[0]).toMatch(/^\/agent-runs\/run-1\/resume-events(\?page=1)?$/);
  });

  it('keeps one cache entry per run and page', async () => {
    const store = createTestStore();

    await store.dispatch(runApi.endpoints.getRunResumeEvents.initiate({ runId: 'run-1', page: 2 }));
    await store.dispatch(runApi.endpoints.getRunResumeEvents.initiate({ runId: 'run-1', page: 3 }));
    await store.dispatch(runApi.endpoints.getRunResumeEvents.initiate({ runId: 'run-2', page: 2 }));

    expect(requested).toEqual([
      '/agent-runs/run-1/resume-events?page=2',
      '/agent-runs/run-1/resume-events?page=3',
      '/agent-runs/run-2/resume-events?page=2',
    ]);
  });

  it('exports the hooks for both reads', () => {
    expect(typeof (runApiModule as any).useGetRunProgressQuery).toBe('function');
    expect(typeof (runApiModule as any).useGetRunResumeEventsQuery).toBe('function');
  });
});
