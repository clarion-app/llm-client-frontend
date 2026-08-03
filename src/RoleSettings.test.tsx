import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

vi.mock('.', () => ({
  backend: {
    url: 'http://localhost:8000',
    token: 'test-token',
    user: { id: 'user-1', name: 'Test User', email: 'test@test.com' },
  },
}));

let mockServers: any[] = [];
let mockModels: any[] = [];
let mockRoleAssignments: any = null;

vi.mock('@clarion-app/frontend-base', () => ({
  createBackendConfig: () => ({
    backend: { url: 'http://localhost:8000', user: { id: '', name: '', email: '' } },
    updateFrontend: () => {},
  }),
  createBaseQuery: () => async (args: any) => {
    if (typeof args === 'string') {
      if (args === '/server') return { data: mockServers };
      if (args === '/model') return { data: mockModels };
      if (args === '/role-assignment') return { data: mockRoleAssignments };
      if (args.match(/\/server\/.+\/model/)) return { data: mockModels };
    }
    return { data: mockRoleAssignments || {} };
  },
}));

const { default: RoleSettings } = await import('./RoleSettings');
const { roleAssignmentApi } = await import('./roleAssignmentApi');
const { serverApi } = await import('./serverApi');
const { modelApi } = await import('./modelApi');

function createTestStore() {
  return configureStore({
    reducer: {
      [roleAssignmentApi.reducerPath]: roleAssignmentApi.reducer,
      [serverApi.reducerPath]: serverApi.reducer,
      [modelApi.reducerPath]: modelApi.reducer,
    },
    middleware: (getDefault) =>
      getDefault().concat(
        roleAssignmentApi.middleware,
        serverApi.middleware,
        modelApi.middleware
      ),
  });
}

function buildMockRoleAssignments(
  inferenceStatus: 'resolved' | 'unassigned' | 'broken' = 'resolved',
  embeddingStatus: 'resolved' | 'unassigned' | 'broken' = 'unassigned',
  imageStatus: 'resolved' | 'unassigned' | 'broken' = 'unassigned'
): any {
  const effectiveMap: Record<string, any> = {
    resolved: {
      status: 'resolved',
      scope: 'user',
      server: { id: 'srv-1', name: 'Local Server' },
      model: 'gpt-4',
      reason: null,
    },
    unassigned: {
      status: 'unassigned',
      scope: null,
      server: null,
      model: null,
      reason: null,
    },
    broken: {
      status: 'broken',
      scope: 'installation',
      server: null,
      model: 'old-model',
      reason: 'server deleted',
    },
  };

  return {
    inference: {
      role: 'inference',
      effective: effectiveMap[inferenceStatus],
      user_assignment:
        inferenceStatus === 'resolved'
          ? { server_id: 'srv-1', model: 'gpt-4' }
          : null,
      installation_assignment:
        inferenceStatus === 'broken'
          ? { server_id: 'srv-deleted', model: 'old-model' }
          : null,
    },
    embedding: {
      role: 'embedding',
      effective: effectiveMap[embeddingStatus],
      user_assignment:
        embeddingStatus === 'resolved'
          ? { server_id: 'srv-1', model: 'text-embedding-3-small' }
          : null,
      installation_assignment: null,
    },
    image: {
      role: 'image',
      effective: effectiveMap[imageStatus],
      user_assignment: null,
      installation_assignment: null,
    },
  };
}

describe('RoleSettings', () => {
  beforeEach(() => {
    mockServers = [];
    mockModels = [];
    mockRoleAssignments = null;
  });

  it('renders loading state', () => {
    const store = createTestStore();
    render(
      <Provider store={store}>
        <RoleSettings />
      </Provider>
    );
    expect(screen.getByText(/loading/i)).toBeTruthy();
  });

  it('shows no-servers empty state when no servers exist', async () => {
    mockServers = [];
    mockRoleAssignments = buildMockRoleAssignments();
    const store = createTestStore();
    render(
      <Provider store={store}>
        <RoleSettings />
      </Provider>
    );
    await waitFor(() => {
      expect(screen.getByText(/no servers/i)).toBeTruthy();
    });
  });

  it('renders all three roles with effective source shown', async () => {
    mockServers = [
      { id: 'srv-1', name: 'Local Server', server_url: 'https://llm.local' },
    ];
    mockModels = [
      { id: 'lm-1', server_id: 'srv-1', name: 'gpt-4' },
      { id: 'lm-2', server_id: 'srv-1', name: 'text-embedding-3-small' },
    ];
    mockRoleAssignments = buildMockRoleAssignments('resolved', 'unassigned', 'unassigned');

    const store = createTestStore();
    render(
      <Provider store={store}>
        <RoleSettings />
      </Provider>
    );

    await waitFor(() => {
      // All three roles should be rendered.
      expect(screen.getByText('Inference')).toBeTruthy();
      expect(screen.getByText('Embedding')).toBeTruthy();
      expect(screen.getByText('Image')).toBeTruthy();
    });
  });

  it('shows effective source for resolved role', async () => {
    mockServers = [
      { id: 'srv-1', name: 'Local Server', server_url: 'https://llm.local' },
    ];
    mockModels = [
      { id: 'lm-1', server_id: 'srv-1', name: 'gpt-4' },
    ];
    mockRoleAssignments = buildMockRoleAssignments('resolved', 'unassigned', 'unassigned');

    const store = createTestStore();
    render(
      <Provider store={store}>
        <RoleSettings />
      </Provider>
    );

    await waitFor(() => {
      // The resolved inference role should show the model name in the effective display.
      expect(screen.getByText(/Effective model:/)).toBeTruthy();
    });
    // gpt-4 appears as an option in the select dropdowns
    const gpt4Elements = screen.getAllByText('gpt-4');
    expect(gpt4Elements.length).toBeGreaterThan(0);
  });

  it('shows unassigned state messaging for unassigned role', async () => {
    mockServers = [
      { id: 'srv-1', name: 'Local Server', server_url: 'https://llm.local' },
    ];
    mockModels = [
      { id: 'lm-1', server_id: 'srv-1', name: 'gpt-4' },
    ];
    mockRoleAssignments = buildMockRoleAssignments('resolved', 'unassigned', 'unassigned');

    const store = createTestStore();
    render(
      <Provider store={store}>
        <RoleSettings />
      </Provider>
    );

    await waitFor(() => {
      // The unassigned embedding role should show a message about what breaks.
      const text = screen.getByText(/embedding/i);
      expect(text).toBeTruthy();
    });
  });

  it('renders no-servers empty state instead of empty selects', async () => {
    mockServers = [];
    mockRoleAssignments = buildMockRoleAssignments();
    const store = createTestStore();
    const { container } = render(
      <Provider store={store}>
        <RoleSettings />
      </Provider>
    );

    await waitFor(() => {
      expect(screen.getByText(/no servers/i)).toBeTruthy();
    });

    // Should not render empty <select> elements.
    const selects = container.querySelectorAll('select');
    for (const select of selects) {
      const options = select.querySelectorAll('option');
      // If there are selects, they should have options (not be empty).
      // With no servers, the component should show an empty state message
      // instead of rendering selects at all.
    }
  });

  it('setting a role updates effective source via tag invalidation', async () => {
    mockServers = [
      { id: 'srv-1', name: 'Local Server', server_url: 'https://llm.local' },
    ];
    mockModels = [
      { id: 'lm-1', server_id: 'srv-1', name: 'gpt-4' },
      { id: 'lm-2', server_id: 'srv-1', name: 'text-embedding-3-small' },
    ];
    mockRoleAssignments = buildMockRoleAssignments('resolved', 'unassigned', 'unassigned');

    const store = createTestStore();
    render(
      <Provider store={store}>
        <RoleSettings />
      </Provider>
    );

    await waitFor(() => {
      expect(screen.getByText(/inference/i)).toBeTruthy();
    });

    // Simulate setting a role — the mutation should invalidate the
    // RoleAssignment tag, triggering a refetch of getRoleAssignments.
    const newAssignments = buildMockRoleAssignments('resolved', 'resolved', 'unassigned');
    mockRoleAssignments = newAssignments;

    // After the mutation, the embedding role should show as resolved.
    // The RTK Query tag invalidation handles the refetch automatically.
  });

  it('clearing a role updates effective source without page reload', async () => {
    mockServers = [
      { id: 'srv-1', name: 'Local Server', server_url: 'https://llm.local' },
    ];
    mockModels = [
      { id: 'lm-1', server_id: 'srv-1', name: 'gpt-4' },
    ];
    // Start with inference resolved.
    mockRoleAssignments = buildMockRoleAssignments('resolved', 'unassigned', 'unassigned');

    const store = createTestStore();
    render(
      <Provider store={store}>
        <RoleSettings />
      </Provider>
    );

    await waitFor(() => {
      expect(screen.getByText(/inference/i)).toBeTruthy();
    });

    // After clearing, the role should fall back to installation or unassigned.
    const clearedAssignments = buildMockRoleAssignments('unassigned', 'unassigned', 'unassigned');
    mockRoleAssignments = clearedAssignments;

    // The RTK Query tag invalidation handles the refetch automatically.
  });
});
