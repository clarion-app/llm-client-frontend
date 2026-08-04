import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { roleAssignmentApi } from './roleAssignmentApi';
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

// Shared mock state object — mutations are visible to the mock function
const mockState: any = {
  roleAssignments: null,
  servers: [],
  serverStatuses: [],
  models: [],
};

vi.mock('@clarion-app/frontend-base', () => ({
  createBackendConfig: () => ({
    backend: { url: 'http://localhost:8000', user: { id: '', name: '', email: '' } },
    updateFrontend: () => {},
  }),
  createBaseQuery: () => async (args: any) => {
    if (typeof args === 'string') {
      if (args === '/role-assignment') return { data: mockState.roleAssignments };
      if (args === '/server') return { data: mockState.servers };
      if (args === '/server-status') return { data: mockState.serverStatuses };
      if (args === '/model') return { data: mockState.models };
    }
    return { data: {} };
  },
}));

const { default: RolesPanel } = await import('./RolesPanel');

function createTestStore() {
  return configureStore({
    reducer: {
      [roleAssignmentApi.reducerPath]: roleAssignmentApi.reducer,
      [serverApi.reducerPath]: serverApi.reducer,
      [serverStatusApi.reducerPath]: serverStatusApi.reducer,
      [modelApi.reducerPath]: modelApi.reducer,
    },
    middleware: (getDefault) =>
      getDefault().concat(
        roleAssignmentApi.middleware,
        serverApi.middleware,
        serverStatusApi.middleware,
        modelApi.middleware
      ),
  });
}

describe('RolesPanel', () => {
  beforeEach(() => {
    mockState.roleAssignments = {
      inference: {
        role: 'inference',
        effective: { status: 'unassigned', scope: null, server: null, model: null, reason: null },
        user_assignment: null,
        installation_assignment: null,
      },
      embedding: {
        role: 'embedding',
        effective: { status: 'unassigned', scope: null, server: null, model: null, reason: null },
        user_assignment: null,
        installation_assignment: null,
      },
      image: {
        role: 'image',
        effective: { status: 'unassigned', scope: null, server: null, model: null, reason: null },
        user_assignment: null,
        installation_assignment: null,
      },
    };
    mockState.servers = [];
    mockState.serverStatuses = [];
    mockState.models = [];
  });

  it('renders three role cards: inference, embedding, image', async () => {
    const store = createTestStore();
    render(
      <Provider store={store}>
        <RolesPanel />
      </Provider>,
    );

    // Should render three role cards
    await waitFor(() => {
      expect(screen.getByTestId('role-card-inference')).toBeInTheDocument();
      expect(screen.getByTestId('role-card-embedding')).toBeInTheDocument();
      expect(screen.getByTestId('role-card-image')).toBeInTheDocument();
    });
  });

  it('reads from GET /role-assignment existing describeAllRoles() output', async () => {
    mockState.roleAssignments = {
      inference: {
        role: 'inference',
        effective: {
          status: 'resolved',
          scope: 'user',
          server: { id: 'srv-1', name: 'Local Server' },
          model: 'gpt-4',
          reason: null,
        },
        user_assignment: { server_id: 'srv-1', model: 'gpt-4' },
        installation_assignment: null,
      },
      embedding: {
        role: 'embedding',
        effective: { status: 'unassigned', scope: null, server: null, model: null, reason: null },
        user_assignment: null,
        installation_assignment: null,
      },
      image: {
        role: 'image',
        effective: { status: 'unassigned', scope: null, server: null, model: null, reason: null },
        user_assignment: null,
        installation_assignment: null,
      },
    };

    const store = createTestStore();
    render(
      <Provider store={store}>
        <RolesPanel />
      </Provider>,
    );

    // Should show resolved state for inference
    await waitFor(() => {
      const resolvedStatus = screen.getByTestId('role-status-resolved');
      expect(resolvedStatus.textContent).toContain('gpt-4');
    });
  });
});
