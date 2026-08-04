import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { serverApi } from './serverApi';
import { serverStatusApi } from './serverStatusApi';
import { modelApi } from './modelApi';

vi.mock('.', () => ({
  backend: {
    url: 'http://localhost:8000',
    token: 'test-token',
    user: { id: 'user-1', name: 'Test User', email: 'test@test.com' },
  },
}));

let mockServers: any[] = [];
let mockServerStatuses: any[] = [];
let capturedRequests: any[] = [];

vi.mock('@clarion-app/frontend-base', () => ({
  createBackendConfig: () => ({
    backend: { url: 'http://localhost:8000', user: { id: '', name: '', email: '' } },
    updateFrontend: () => {},
  }),
  createBaseQuery: () => async (args: any) => {
    capturedRequests.push(args);
    if (typeof args === 'string') {
      if (args === '/server') return { data: mockServers };
      if (args === '/server-status') return { data: mockServerStatuses };
      if (args === '/model') return { data: [] };
    }
    // Handle POST to refresh server models
    if (typeof args === 'object' && args.method === 'POST' && args.url?.includes('/server')) {
      return { data: {} };
    }
    return { data: {} };
  },
}));

const { default: ServersSection } = await import('./ServersSection');

function createTestStore() {
  return configureStore({
    reducer: {
      [serverApi.reducerPath]: serverApi.reducer,
      [serverStatusApi.reducerPath]: serverStatusApi.reducer,
      [modelApi.reducerPath]: modelApi.reducer,
    },
    middleware: (getDefault) =>
      getDefault().concat(
        serverApi.middleware,
        serverStatusApi.middleware,
        modelApi.middleware
      ),
  });
}

describe('ServersSection', () => {
  beforeEach(() => {
    capturedRequests = [];
    mockServers = [];
    mockServerStatuses = [];
  });

  it('renders a list of servers with their names', async () => {
    mockServers = [
      { id: 'srv-1', name: 'Local Server', server_url: 'http://localhost:8080', provider_type: 'openai', has_token: true },
      { id: 'srv-2', name: 'Remote Server', server_url: 'https://api.example.com', provider_type: 'openai', has_token: false },
    ];

    const store = createTestStore();
    render(
      <Provider store={store}>
        <ServersSection />
      </Provider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Local Server')).toBeInTheDocument();
      expect(screen.getByText('Remote Server')).toBeInTheDocument();
    });
  });

  it('shows connection status badge for each server', async () => {
    mockServers = [
      { id: 'srv-1', name: 'Local Server', server_url: 'http://localhost:8080', provider_type: 'openai', has_token: true },
    ];
    mockServerStatuses = [
      { server_id: 'srv-1', connection_status: 'reachable', in_flight: false, last_outcome: 'models_updated', model_count: 5 },
    ];

    const store = createTestStore();
    render(
      <Provider store={store}>
        <ServersSection />
      </Provider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('status-badge')).toBeInTheDocument();
    });
  });

  it('shows a refresh button for each server', async () => {
    mockServers = [
      { id: 'srv-1', name: 'Local Server', server_url: 'http://localhost:8080', provider_type: 'openai', has_token: true },
    ];

    const store = createTestStore();
    render(
      <Provider store={store}>
        <ServersSection />
      </Provider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('refresh-button')).toBeInTheDocument();
    });
  });
});
