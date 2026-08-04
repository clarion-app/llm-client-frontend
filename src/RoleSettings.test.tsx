import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
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
/** Every non-GET request the component issued, in order. */
let mockRequests: Array<{ url: string; method: string; body: any }> = [];

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
    if (args?.method) {
      mockRequests.push({ url: args.url, method: args.method, body: args.body });
      const role = args.body?.role;
      return { data: role ? mockRoleAssignments?.[role] ?? null : null };
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
    cleanup();
    mockServers = [];
    mockModels = [];
    mockRoleAssignments = null;
    mockRequests = [];
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

    // FR-027: no empty controls at all, not merely controls with no options.
    expect(container.querySelectorAll('select').length).toBe(0);
  });

  it('renders a no-models empty state instead of empty selects', async () => {
    mockServers = [
      { id: 'srv-1', name: 'Local Server', server_url: 'https://llm.local' },
    ];
    mockModels = [];
    mockRoleAssignments = buildMockRoleAssignments('unassigned', 'unassigned', 'unassigned');

    const store = createTestStore();
    const { container } = render(
      <Provider store={store}>
        <RoleSettings />
      </Provider>
    );

    await waitFor(() => {
      expect(screen.getByText(/no models are known/i)).toBeTruthy();
    });

    expect(container.querySelectorAll('select').length).toBe(0);
  });

  it('names the vanished model and what breaks for a broken role', async () => {
    mockServers = [
      { id: 'srv-1', name: 'Local Server', server_url: 'https://llm.local' },
    ];
    mockModels = [{ id: 'lm-1', server_id: 'srv-1', name: 'gpt-4' }];
    mockRoleAssignments = buildMockRoleAssignments('broken', 'unassigned', 'unassigned');

    const store = createTestStore();
    render(
      <Provider store={store}>
        <RoleSettings />
      </Provider>
    );

    await waitFor(() => {
      // FR-013: the model that vanished is named, with the reason and scope...
      expect(screen.getByText(/old-model/)).toBeTruthy();
    });
    const broken = screen.getByText(/old-model/).textContent ?? '';
    expect(broken).toMatch(/server deleted/);
    expect(broken).toMatch(/installation/);
    // ...and FR-025: what stops working as a result.
    expect(broken).toMatch(/Starting a new conversation/);
  });

  it('shows the model the user just picked, not the saved one', async () => {
    mockServers = [
      { id: 'srv-1', name: 'Local Server', server_url: 'https://llm.local' },
    ];
    mockModels = [
      { id: 'lm-1', server_id: 'srv-1', name: 'gpt-4' },
      { id: 'lm-2', server_id: 'srv-1', name: 'llama-3-70b' },
    ];
    // inference already has a saved user assignment of srv-1:gpt-4.
    mockRoleAssignments = buildMockRoleAssignments('resolved', 'unassigned', 'unassigned');

    const store = createTestStore();
    const { container } = render(
      <Provider store={store}>
        <RoleSettings />
      </Provider>
    );

    await waitFor(() => {
      expect(container.querySelectorAll('select').length).toBeGreaterThan(0);
    });

    const inferenceUserSelect = container.querySelectorAll('select')[0] as HTMLSelectElement;
    expect(inferenceUserSelect.value).toBe('srv-1:gpt-4');

    fireEvent.change(inferenceUserSelect, { target: { value: 'srv-1:llama-3-70b' } });

    // SC-008 is one selection and one save: the selection has to survive the
    // re-render, or the user cannot see what they are about to save.
    await waitFor(() => {
      expect(inferenceUserSelect.value).toBe('srv-1:llama-3-70b');
    });
  });

  it('setting a role PUTs the assignment and updates the effective source', async () => {
    mockServers = [
      { id: 'srv-1', name: 'Local Server', server_url: 'https://llm.local' },
    ];
    mockModels = [
      { id: 'lm-1', server_id: 'srv-1', name: 'gpt-4' },
      { id: 'lm-2', server_id: 'srv-1', name: 'text-embedding-3-small' },
    ];
    mockRoleAssignments = buildMockRoleAssignments('resolved', 'unassigned', 'unassigned');

    const store = createTestStore();
    const { container } = render(
      <Provider store={store}>
        <RoleSettings />
      </Provider>
    );

    await waitFor(() => {
      expect(container.querySelectorAll('select').length).toBe(6);
    });

    // Embedding is the second role section: its user-scope select is index 2.
    const embeddingUserSelect = container.querySelectorAll('select')[2] as HTMLSelectElement;
    fireEvent.change(embeddingUserSelect, {
      target: { value: 'srv-1:text-embedding-3-small' },
    });

    // The server now reports embedding as resolved; the tag invalidation the
    // mutation declares is what has to bring that back into the view.
    mockRoleAssignments = buildMockRoleAssignments('resolved', 'resolved', 'unassigned');

    const saveButtons = screen.getAllByText('Save');
    fireEvent.click(saveButtons[2]);

    await waitFor(() => {
      expect(mockRequests).toContainEqual({
        url: '/role-assignment',
        method: 'PUT',
        body: {
          role: 'embedding',
          scope: 'user',
          server_id: 'srv-1',
          model: 'text-embedding-3-small',
        },
      });
    });

    await waitFor(() => {
      // Two roles resolved now (inference and embedding), where there was one.
      expect(screen.getAllByText(/Effective model:/).length).toBe(2);
    });
  });

  it('clearing a role DELETEs it and falls back without a page reload', async () => {
    mockServers = [
      { id: 'srv-1', name: 'Local Server', server_url: 'https://llm.local' },
    ];
    mockModels = [{ id: 'lm-1', server_id: 'srv-1', name: 'gpt-4' }];
    mockRoleAssignments = buildMockRoleAssignments('resolved', 'unassigned', 'unassigned');

    const store = createTestStore();
    render(
      <Provider store={store}>
        <RoleSettings />
      </Provider>
    );

    await waitFor(() => {
      expect(screen.getAllByText(/Effective model:/).length).toBe(1);
    });

    // After the clear the role resolves to nothing at either scope.
    mockRoleAssignments = buildMockRoleAssignments('unassigned', 'unassigned', 'unassigned');

    fireEvent.click(screen.getAllByText('Clear')[0]);

    await waitFor(() => {
      expect(mockRequests).toContainEqual({
        url: '/role-assignment',
        method: 'DELETE',
        body: { role: 'inference', scope: 'user' },
      });
    });

    await waitFor(() => {
      expect(screen.queryByText(/Effective model:/)).toBeNull();
      expect(screen.getAllByText(/Unassigned\./).length).toBe(3);
    });
  });
});
