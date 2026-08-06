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
const mockServers = [
  { id: 'srv-1', name: 'Local Server', server_url: 'http://localhost:8080', provider_type: 'openai' },
  { id: 'srv-2', name: 'Remote Server', server_url: 'https://api.example.com', provider_type: 'openai' },
];

vi.mock('@clarion-app/frontend-base', () => ({
  createBackendConfig: () => ({
    backend: { url: 'http://localhost:8000', user: { id: '', name: '', email: '' } },
    updateFrontend: () => {},
  }),
  createBaseQuery: () => async (args: any) => {
    capturedRequests.push(args);
    if (typeof args === 'string' && args === '/server') {
      return { data: mockServers };
    }
    if (typeof args === 'object') {
      if (args.method === 'POST' && args.url === '/server') {
        return { data: { id: 'srv-new', name: args.body?.name || 'New Server', server_url: args.body?.server_url || 'http://new.example.com', provider_type: 'openai' } };
      }
      if (args.method === 'PUT') {
        return { data: { ...mockServers[0], name: args.body?.name || 'Updated Server' } };
      }
    }
    return { data: mockServers };
  },
}));

const { serverApi } = await import('./serverApi');
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
      [serverApi.reducerPath]: serverApi.reducer,
      [serverStatusApi.reducerPath]: serverStatusApi.reducer,
      [modelApi.reducerPath]: modelApi.reducer,
    },
    middleware: (getDefault) =>
      getDefault().concat(actionCapturer, serverApi.middleware, serverStatusApi.middleware, modelApi.middleware),
  });
}

describe('serverApi', () => {
  beforeEach(() => {
    capturedRequests = [];
  });

  describe('getServers', () => {
    it('GET /server fetches server list', async () => {
      const store = createTestStore();
      await store.dispatch(
        serverApi.endpoints.getServers.initiate(null),
      );
      expect(capturedRequests).toContainEqual('/server');
    });
  });

  describe('createServer', () => {
    it('POST /server creates a new server', async () => {
      const store = createTestStore();
      await store.dispatch(
        serverApi.endpoints.createServer.initiate({
          name: 'New Server',
          server_url: 'http://new.example.com',
        }),
      );
      expect(capturedRequests).toContainEqual({
        url: '/server',
        method: 'POST',
        body: { name: 'New Server', server_url: 'http://new.example.com' },
      });
    });

    it('dispatches cross-slice ServerStatus invalidation after create', async () => {
      const dispatchedActions: any[] = [];
      const store = createTestStore(dispatchedActions);

      await store.dispatch(
        serverApi.endpoints.createServer.initiate({
          name: 'New Server',
          server_url: 'http://new.example.com',
        }),
      );

      const serverStatusInvalidationActions = dispatchedActions.filter(
        (a: any) =>
          a.type?.includes('serverStatusApi') && a.type?.includes('invalidateTags'),
      );
      expect(serverStatusInvalidationActions.length).toBeGreaterThan(0);
    });

    it('dispatches cross-slice LanguageModel invalidation after create', async () => {
      const dispatchedActions: any[] = [];
      const store = createTestStore(dispatchedActions);

      await store.dispatch(
        serverApi.endpoints.createServer.initiate({
          name: 'New Server',
          server_url: 'http://new.example.com',
        }),
      );

      const languageModelInvalidationActions = dispatchedActions.filter(
        (a: any) =>
          a.type?.includes('modelApi') && a.type?.includes('invalidateTags'),
      );
      expect(languageModelInvalidationActions.length).toBeGreaterThan(0);
    });
  });

  describe('updateServer', () => {
    it('PUT /server/{id} updates a server', async () => {
      const store = createTestStore();
      await store.dispatch(
        serverApi.endpoints.updateServer.initiate({
          id: 'srv-1',
          server: { name: 'Updated Server' },
        }),
      );
      expect(capturedRequests).toContainEqual({
        url: '/server/srv-1',
        method: 'PUT',
        body: { name: 'Updated Server' },
      });
    });

    it('dispatches cross-slice ServerStatus invalidation after update', async () => {
      const dispatchedActions: any[] = [];
      const store = createTestStore(dispatchedActions);

      await store.dispatch(
        serverApi.endpoints.updateServer.initiate({
          id: 'srv-1',
          server: { name: 'Updated Server' },
        }),
      );

      const serverStatusInvalidationActions = dispatchedActions.filter(
        (a: any) =>
          a.type?.includes('serverStatusApi') && a.type?.includes('invalidateTags'),
      );
      expect(serverStatusInvalidationActions.length).toBeGreaterThan(0);
    });

    it('dispatches cross-slice LanguageModel invalidation after update', async () => {
      const dispatchedActions: any[] = [];
      const store = createTestStore(dispatchedActions);

      await store.dispatch(
        serverApi.endpoints.updateServer.initiate({
          id: 'srv-1',
          server: { name: 'Updated Server' },
        }),
      );

      const languageModelInvalidationActions = dispatchedActions.filter(
        (a: any) =>
          a.type?.includes('modelApi') && a.type?.includes('invalidateTags'),
      );
      expect(languageModelInvalidationActions.length).toBeGreaterThan(0);
    });
  });

  describe('deleteServer', () => {
    it('DELETE /server/{id} deletes a server', async () => {
      const store = createTestStore();
      await store.dispatch(
        serverApi.endpoints.deleteServer.initiate('srv-1'),
      );
      expect(capturedRequests).toContainEqual({
        url: '/server/srv-1',
        method: 'DELETE',
      });
    });

    it('dispatches cross-slice ServerStatus invalidation after delete', async () => {
      const dispatchedActions: any[] = [];
      const store = createTestStore(dispatchedActions);

      await store.dispatch(
        serverApi.endpoints.deleteServer.initiate('srv-1'),
      );

      const serverStatusInvalidationActions = dispatchedActions.filter(
        (a: any) =>
          a.type?.includes('serverStatusApi') && a.type?.includes('invalidateTags'),
      );
      expect(serverStatusInvalidationActions.length).toBeGreaterThan(0);
    });

    it('dispatches cross-slice LanguageModel invalidation after delete', async () => {
      const dispatchedActions: any[] = [];
      const store = createTestStore(dispatchedActions);

      await store.dispatch(
        serverApi.endpoints.deleteServer.initiate('srv-1'),
      );

      const languageModelInvalidationActions = dispatchedActions.filter(
        (a: any) =>
          a.type?.includes('modelApi') && a.type?.includes('invalidateTags'),
      );
      expect(languageModelInvalidationActions.length).toBeGreaterThan(0);
    });
  });
});
