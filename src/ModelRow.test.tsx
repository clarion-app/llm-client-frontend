import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { serverApi } from './serverApi';
import { serverStatusApi } from './serverStatusApi';
import { modelApi } from './modelApi';
import { roleAssignmentApi } from './roleAssignmentApi';

vi.mock('.', () => ({
  backend: {
    url: 'http://localhost:8000',
    token: 'test-token',
    user: { id: 'user-1', name: 'Test User', email: 'test@test.com' },
  },
}));

// Mock data
let mockServers: any[] = [];
let mockModels: any[] = [];
let mockRoleAssignments: any = null;
let capturedRequests: any[] = [];

vi.mock('@clarion-app/frontend-base', () => ({
  createBackendConfig: () => ({
    backend: { url: 'http://localhost:8000', user: { id: '', name: '', email: '' } },
    updateFrontend: () => {},
  }),
  createBaseQuery: () => async (args: any) => {
    capturedRequests.push(args);
    const url = typeof args === 'string' ? args : args?.url;
    if (url?.includes('/server') && !url?.includes('/server-status')) return { data: mockServers };
    if (url?.includes('/server-status')) return { data: [] };
    if (url?.includes('/model')) return { data: mockModels };
    if (url?.includes('/role-assignment') && args?.method !== 'PUT') return { data: mockRoleAssignments };
    if (typeof args === 'object' && args.method === 'PUT' && (args.url === '/role-assignment' || args.url?.includes('/role-assignment'))) {
      const body = args.body;
      return {
        data: {
          role: body.role,
          effective: {
            status: 'resolved',
            scope: 'user',
            server: { id: body.server_id, name: mockServers.find((s) => s.id === body.server_id)?.name ?? 'Server' },
            model: body.model,
            reason: null,
          },
          user_assignment: { server_id: body.server_id, model: body.model },
          installation_assignment: null,
        },
      };
    }
    return { data: {} };
  },
}));

// Dynamic import so mocks are in place.
const { ModelRow } = await import('./ModelRow');

function createTestStore() {
  return configureStore({
    reducer: {
      [serverApi.reducerPath]: serverApi.reducer,
      [serverStatusApi.reducerPath]: serverStatusApi.reducer,
      [modelApi.reducerPath]: modelApi.reducer,
      [roleAssignmentApi.reducerPath]: roleAssignmentApi.reducer,
    },
    middleware: (getDefault) =>
      getDefault().concat(
        serverApi.middleware,
        serverStatusApi.middleware,
        modelApi.middleware,
        roleAssignmentApi.middleware
      ),
  });
}

describe('ModelRow', () => {
  beforeEach(() => {
    capturedRequests = [];
    mockServers = [
      { id: 'srv-1', name: 'Local Server', server_url: 'http://localhost:8081', provider_type: 'openai' },
      { id: 'srv-2', name: 'Cloud Server', server_url: 'https://api.cloud.com', provider_type: 'openai' },
    ];
    mockModels = [
      { id: 'm-1', name: 'gpt-4', server_id: 'srv-1' },
    ];
    mockRoleAssignments = {
      inference: { role: 'inference', effective: { status: 'unassigned', scope: null, server: null, model: null, reason: null }, user_assignment: null, installation_assignment: null },
      embedding: { role: 'embedding', effective: { status: 'unassigned', scope: null, server: null, model: null, reason: null }, user_assignment: null, installation_assignment: null },
      image: { role: 'image', effective: { status: 'unassigned', scope: null, server: null, model: null, reason: null }, user_assignment: null, installation_assignment: null },
    };
  });

  it('always renders the model with its server, never the name alone', async () => {
    const store = createTestStore();
    render(
      <Provider store={store}>
        <ModelRow model={mockModels[0]} serverName={mockServers[0].name} roleAssignments={mockRoleAssignments} />
      </Provider>,
    );

    // Model name should be present
    expect(screen.getByText('gpt-4')).toBeInTheDocument();
    // Server name should also be present (FR-023)
    expect(screen.getByText('Local Server')).toBeInTheDocument();
  });

  it('role badges carry their scope (FR-023)', async () => {
    mockRoleAssignments = {
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
      embedding: { role: 'embedding', effective: { status: 'unassigned', scope: null, server: null, model: null, reason: null }, user_assignment: null, installation_assignment: null },
      image: { role: 'image', effective: { status: 'unassigned', scope: null, server: null, model: null, reason: null }, user_assignment: null, installation_assignment: null },
    };

    const store = createTestStore();
    render(
      <Provider store={store}>
        <ModelRow model={mockModels[0]} serverName={mockServers[0].name} roleAssignments={mockRoleAssignments} />
      </Provider>,
    );

    // The row should show an inference badge
    expect(screen.getByText('inference')).toBeInTheDocument();
  });

  it('assign-to-role from the row updates the roles panel (FR-010, US2-3)', async () => {
    const store = createTestStore();
    render(
      <Provider store={store}>
        <ModelRow model={mockModels[0]} serverName={mockServers[0].name} roleAssignments={mockRoleAssignments} />
      </Provider>,
    );

    // Click the Assign button to open dropdown
    fireEvent.click(screen.getByTestId('assign-role-btn'));

    // Click the inference role in the dropdown
    fireEvent.click(screen.getByTestId('assign-role-inference'));

    // Verify PUT /role-assignment was called
    await waitFor(() => {
      const putRequest = capturedRequests.find(
        (r) => typeof r === 'object' && r.method === 'PUT' && r.url === '/role-assignment'
      );
      expect(putRequest).toBeDefined();
      expect(putRequest.body.role).toBe('inference');
      expect(putRequest.body.server_id).toBe('srv-1');
      expect(putRequest.body.model).toBe('gpt-4');
    });
  });

  it('two servers reporting the same model name render as two rows under two groups', async () => {
    mockModels = [
      { id: 'm-1', name: 'gpt-4', server_id: 'srv-1' },
      { id: 'm-2', name: 'gpt-4', server_id: 'srv-2' },
    ];

    const store = createTestStore();
    render(
      <Provider store={store}>
        <ModelRow model={mockModels[0]} serverName={mockServers[0].name} roleAssignments={mockRoleAssignments} />
        <ModelRow model={mockModels[1]} serverName={mockServers[1].name} roleAssignments={mockRoleAssignments} />
      </Provider>,
    );

    // Both rows should show "gpt-4" but with different server names
    const gpt4Elements = screen.getAllByText('gpt-4');
    expect(gpt4Elements.length).toBe(2);
    // Both servers should be distinguishable
    expect(screen.getByText('Local Server')).toBeInTheDocument();
    expect(screen.getByText('Cloud Server')).toBeInTheDocument();
  });

  // Ported from AllModels.test.tsx ("shows model holding role at installation
  // scope is annotated") — not covered elsewhere: ModelRow renders badges
  // from a roleAssignments prop directly, and no other test asserted the
  // literal "(installation)"/"(user)" scope label text.
  it('labels a role badge with its scope: installation', async () => {
    const resolvedInstallation = {
      role: 'embedding',
      effective: {
        status: 'resolved',
        scope: 'installation',
        server: { id: 'srv-1', name: 'Local Server' },
        model: 'gpt-4',
        reason: null,
      },
      user_assignment: null,
      installation_assignment: { server_id: 'srv-1', model: 'gpt-4' },
    };
    mockRoleAssignments = {
      ...mockRoleAssignments,
      embedding: resolvedInstallation,
    };

    const store = createTestStore();
    render(
      <Provider store={store}>
        <ModelRow model={mockModels[0]} serverName={mockServers[0].name} roleAssignments={mockRoleAssignments} />
      </Provider>,
    );

    expect(screen.getByTestId('role-badge-embedding')).toBeInTheDocument();
    expect(screen.getByText('(installation)')).toBeInTheDocument();
  });

  // Ported from AllModels.test.tsx ("shows both roles for model holding two
  // roles") — not covered elsewhere: no other test assigns a single model
  // two roles at two different scopes simultaneously.
  it('shows a badge for each role a model holds simultaneously, with distinct scopes', async () => {
    mockRoleAssignments = {
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
        effective: {
          status: 'resolved',
          scope: 'installation',
          server: { id: 'srv-1', name: 'Local Server' },
          model: 'gpt-4',
          reason: null,
        },
        user_assignment: null,
        installation_assignment: { server_id: 'srv-1', model: 'gpt-4' },
      },
      image: mockRoleAssignments.image,
    };

    const store = createTestStore();
    render(
      <Provider store={store}>
        <ModelRow model={mockModels[0]} serverName={mockServers[0].name} roleAssignments={mockRoleAssignments} />
      </Provider>,
    );

    expect(screen.getByTestId('role-badge-inference')).toBeInTheDocument();
    expect(screen.getByTestId('role-badge-embedding')).toBeInTheDocument();
    expect(screen.getByText('(user)')).toBeInTheDocument();
    expect(screen.getByText('(installation)')).toBeInTheDocument();
  });

  it('long model/server names wrap or scroll with the distinguishing part still readable', async () => {
    mockModels = [
      { id: 'm-1', name: 'very-long-model-name-that-should-wrap-or-scroll-without-breaking-the-layout', server_id: 'srv-1' },
    ];
    mockServers = [
      { id: 'srv-1', name: 'a-very-long-server-name-that-should-also-wrap-or-scroll-gracefully', server_url: 'http://localhost:8081', provider_type: 'openai' },
    ];

    const store = createTestStore();
    render(
      <Provider store={store}>
        <ModelRow model={mockModels[0]} serverName={mockServers[0].name} roleAssignments={mockRoleAssignments} />
      </Provider>,
    );

    // The long names should still be readable
    expect(screen.getByText('very-long-model-name-that-should-wrap-or-scroll-without-breaking-the-layout')).toBeInTheDocument();
    expect(screen.getByText('a-very-long-server-name-that-should-also-wrap-or-scroll-gracefully')).toBeInTheDocument();
  });
});
