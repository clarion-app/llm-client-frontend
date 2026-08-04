import { describe, it, expect, vi, beforeEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import type { ServerStatusType } from './types';

// A real RTK Query store, not a mocked `util` — a handler that builds the
// right thunk but never dispatches it passes against mocks and does nothing
// in the browser.

vi.mock('./config', () => ({
  backend: {
    url: 'http://localhost:8000',
    token: 'test-token',
    user: { id: 'user-1', name: 'Test User', email: 'test@test.com' },
  },
  updateFrontend: () => {},
}));

const registered: { event: string; handler: (event: any, dispatch: any) => void }[] = [];
let fetchCount = 0;

vi.mock('@clarion-app/frontend-base', () => ({
  createBackendConfig: () => ({
    backend: { url: 'http://localhost:8000', user: { id: '', name: '', email: '' } },
    updateFrontend: () => {},
  }),
  createBaseQuery: () => async (args: any) => {
    const url = typeof args === 'string' ? args : args?.url;
    if (url === '/server-status') {
      fetchCount += 1;
      return { data: seeded };
    }
    return { data: {} };
  },
  registerUserChannelHandler: (h: any) => registered.push(h),
}));

const makeStatus = (overrides: Partial<ServerStatusType> = {}): ServerStatusType => ({
  server_id: 'srv-1',
  connection_status: 'reachable',
  in_flight: false,
  last_outcome: 'models_updated',
  last_error: null,
  model_count: 5,
  triggered_by: 'user-1',
  last_refresh_at: '2026-08-04T10:00:00.000000Z',
  ...overrides,
});

let seeded: ServerStatusType[] = [];

const { serverStatusApi } = await import('./serverStatusApi');
// Import triggers the side-effect registration.
await import('./serverStatusRealtime');

function createTestStore() {
  return configureStore({
    reducer: {
      [serverStatusApi.reducerPath]: serverStatusApi.reducer,
    },
    middleware: (getDefault) => getDefault().concat(serverStatusApi.middleware),
  });
}

function cachedServerIds(store: ReturnType<typeof createTestStore>) {
  return serverStatusApi.endpoints.getServerStatuses
    .select(undefined)(store.getState() as any)
    .data?.map((s: ServerStatusType) => s.server_id);
}

function cached(store: ReturnType<typeof createTestStore>) {
  return serverStatusApi.endpoints.getServerStatuses.select(undefined)(
    store.getState() as any,
  ).data;
}

describe('serverStatusRealtime — ServerModelsRefreshed handler', () => {
  beforeEach(() => {
    seeded = [makeStatus()];
    fetchCount = 0;
  });

  it('registers a handler for the fully-qualified event name', () => {
    expect(registered).toHaveLength(1);
    expect(registered[0].event).toBe(
      '.ClarionApp\\LlmClient\\Events\\ServerModelsRefreshed',
    );
  });

  it('replaces the cached entry in place when the server_id is known', async () => {
    const store = createTestStore();
    await store.dispatch(serverStatusApi.endpoints.getServerStatuses.initiate());

    expect(cached(store)?.[0].connection_status).toBe('reachable');

    const pushed = makeStatus({
      connection_status: 'unreachable',
      last_outcome: 'http_error',
      last_error: '502 Bad Gateway',
      model_count: 0,
      last_refresh_at: '2026-08-04T11:00:00.000000Z',
    });
    registered[0].handler(pushed, store.dispatch);

    expect(cached(store)).toHaveLength(1);
    expect(cached(store)?.[0]).toEqual(pushed);
  });

  it('leaves sibling entries untouched', async () => {
    seeded = [makeStatus(), makeStatus({ server_id: 'srv-2', model_count: 12 })];
    const store = createTestStore();
    await store.dispatch(serverStatusApi.endpoints.getServerStatuses.initiate());

    registered[0].handler(makeStatus({ connection_status: 'unreachable' }), store.dispatch);

    const after = cached(store);
    expect(after).toHaveLength(2);
    expect(after?.[0].connection_status).toBe('unreachable');
    expect(after?.[1].server_id).toBe('srv-2');
    expect(after?.[1].model_count).toBe(12);
  });

  it('an unknown server_id does not corrupt the cache and falls through to invalidation', async () => {
    const store = createTestStore();
    const subscription = store.dispatch(
      serverStatusApi.endpoints.getServerStatuses.initiate(),
    );
    await subscription;
    expect(fetchCount).toBe(1);

    // A server status pushed from another tab — not in this cache.
    seeded = [makeStatus(), makeStatus({ server_id: 'srv-elsewhere' })];
    registered[0].handler(makeStatus({ server_id: 'srv-elsewhere' }), store.dispatch);

    // The failed in-place update left the cache exactly as it was…
    expect(cachedServerIds(store)).toEqual(['srv-1']);

    // …and the invalidation refetches for the live subscription.
    await vi.waitFor(() => expect(fetchCount).toBe(2));
    await vi.waitFor(() =>
      expect(cachedServerIds(store)).toEqual(['srv-1', 'srv-elsewhere']),
    );
    subscription.unsubscribe();
  });

  it('is harmless when there is no cache entry at all', async () => {
    const store = createTestStore();

    expect(() =>
      registered[0].handler(makeStatus(), store.dispatch),
    ).not.toThrow();
    expect(cached(store)).toBeUndefined();
  });

  it('ignores a payload without a server_id rather than throwing', async () => {
    const store = createTestStore();
    await store.dispatch(serverStatusApi.endpoints.getServerStatuses.initiate());

    expect(() => registered[0].handler({}, store.dispatch)).not.toThrow();
    expect(() => registered[0].handler(null, store.dispatch)).not.toThrow();
    expect(cached(store)?.[0].connection_status).toBe('reachable');
  });
});
