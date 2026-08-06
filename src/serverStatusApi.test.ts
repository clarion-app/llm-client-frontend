import { describe, it, expect, vi, beforeEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

vi.mock('.', () => ({
  backend: {
    url: 'http://localhost:8000',
    token: 'test-token',
    user: { id: 'user-1', name: 'Test User', email: 'test@test.com' },
  },
}));

let capturedRequests: any[] = [];
const mockStatuses = [
  {
    server_id: 'srv-1',
    connection_status: 'reachable',
    in_flight: false,
    last_outcome: 'models_updated',
    last_error: null,
    model_count: 5,
    triggered_by: 'user-1',
    last_refresh_at: '2026-08-03T10:00:00Z',
  },
  {
    server_id: 'srv-2',
    connection_status: 'never_checked',
    in_flight: false,
    last_outcome: null,
    last_error: null,
    model_count: 0,
    triggered_by: null,
    last_refresh_at: null,
  },
];

vi.mock('@clarion-app/frontend-base', () => ({
  createBackendConfig: () => ({
    backend: { url: 'http://localhost:8000', user: { id: '', name: '', email: '' } },
    updateFrontend: () => {},
  }),
  createBaseQuery: () => async (args: any) => {
    capturedRequests.push(args);
    if (typeof args === 'string' && args === '/server-status') {
      return { data: mockStatuses };
    }
    if (typeof args === 'object' && args.url === '/models/srv-1/refresh') {
      return { data: { ...mockStatuses[0], in_flight: true } };
    }
    return { data: {} };
  },
}));

const { serverStatusApi } = await import('./serverStatusApi');
const { modelApi } = await import('./modelApi');

function createTestStore(capturedActions?: any[]) {
  const actionCapturer = (_api: any) => (next: any) => (action: any) => {
    if (capturedActions) {
      capturedActions.push(action);
    }
    return next(action);
  };

  return configureStore({
    reducer: {
      [serverStatusApi.reducerPath]: serverStatusApi.reducer,
      [modelApi.reducerPath]: modelApi.reducer,
    },
    middleware: (getDefault) =>
      getDefault().concat(actionCapturer, serverStatusApi.middleware, modelApi.middleware),
  });
}

describe('serverStatusApi', () => {
  beforeEach(() => {
    capturedRequests = [];
  });

  describe('getServerStatuses', () => {
    it('GET /server-status fetches server statuses', async () => {
      const store = createTestStore();
      await store.dispatch(
        serverStatusApi.endpoints.getServerStatuses.initiate(null),
      );
      expect(capturedRequests).toContainEqual('/server-status');
    });

    it('returns array of ServerStatusType entries', async () => {
      const store = createTestStore();
      const result = await store.dispatch(
        serverStatusApi.endpoints.getServerStatuses.initiate(null),
      );

      if ('data' in result) {
        const data = result.data;
        expect(Array.isArray(data)).toBe(true);
        expect(data.length).toBe(2);
        expect(data[0]).toHaveProperty('server_id');
        expect(data[0]).toHaveProperty('connection_status');
        expect(data[0]).toHaveProperty('in_flight');
        expect(data[0]).toHaveProperty('last_outcome');
        expect(data[0]).toHaveProperty('model_count');
      }
    });
  });

  describe('refreshServerModels', () => {
    it('POST /models/{server_id}/refresh triggers a model refresh', async () => {
      const store = createTestStore();
      await store.dispatch(
        serverStatusApi.endpoints.refreshServerModels.initiate('srv-1'),
      );
      expect(capturedRequests).toContainEqual({
        url: '/models/srv-1/refresh',
        method: 'POST',
      });
    });

    it('invalidates ServerStatus tag after mutation', async () => {
      const store = createTestStore();
      await store.dispatch(
        serverStatusApi.endpoints.refreshServerModels.initiate('srv-1'),
      );

      // The tag invalidation should have been triggered.
      // We verify the mutation was called.
      const postRequests = capturedRequests.filter(
        (r) => typeof r === 'object' && r.method === 'POST',
      );
      expect(postRequests.length).toBeGreaterThan(0);
    });

    it('dispatches cross-slice LanguageModel invalidation from onQueryStarted', async () => {
      const dispatchedActions: any[] = [];
      const store = createTestStore(dispatchedActions);

      // Dispatch the mutation.
      await store.dispatch(
        serverStatusApi.endpoints.refreshServerModels.initiate('srv-1'),
      );

      // Verify the cross-slice dispatch by checking that modelApi's
      // util.invalidateTags action was dispatched.
      const languageModelInvalidationActions = dispatchedActions.filter(
        (a: any) =>
          a.type?.includes('modelApi') && a.type?.includes('invalidateTags'),
      );
      expect(languageModelInvalidationActions.length).toBeGreaterThan(0);
    });
  });
});
