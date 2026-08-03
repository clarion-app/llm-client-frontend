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

const { default: Models } = await import('./AllModels');
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

function buildMockRoleAssignments(overrides: {
  inference?: { user?: { server_id: string; model: string } | null; installation?: { server_id: string; model: string } | null };
  embedding?: { user?: { server_id: string; model: string } | null; installation?: { server_id: string; model: string } | null };
  image?: { user?: { server_id: string; model: string } | null; installation?: { server_id: string; model: string } | null };
} = {}): any {
  const roleEntry = (
    role: 'inference' | 'embedding' | 'image',
    userAsgn: { server_id: string; model: string } | null,
    instAsgn: { server_id: string; model: string } | null
  ) => ({
    role,
    effective: {
      status: userAsgn ? 'resolved' : instAsgn ? 'resolved' : 'unassigned',
      scope: userAsgn ? 'user' : instAsgn ? 'installation' : null,
      server: userAsgn
        ? { id: userAsgn.server_id, name: 'Local Server' }
        : instAsgn
          ? { id: instAsgn.server_id, name: 'Local Server' }
          : null,
      model: userAsgn?.model ?? instAsgn?.model ?? null,
      reason: null,
    },
    user_assignment: userAsgn,
    installation_assignment: instAsgn,
  });

  return {
    inference: roleEntry(
      'inference',
      overrides.inference?.user ?? null,
      overrides.inference?.installation ?? null
    ),
    embedding: roleEntry(
      'embedding',
      overrides.embedding?.user ?? null,
      overrides.embedding?.installation ?? null
    ),
    image: roleEntry(
      'image',
      overrides.image?.user ?? null,
      overrides.image?.installation ?? null
    ),
  };
}

describe('AllModels', () => {
  beforeEach(() => {
    mockServers = [];
    mockModels = [];
    mockRoleAssignments = null;
  });

  it('renders loading state', () => {
    const store = createTestStore();
    render(
      <Provider store={store}>
        <Models />
      </Provider>
    );
    expect(screen.getByText(/loading/i)).toBeTruthy();
  });

  it('shows model holding role at installation scope is annotated', async () => {
    mockServers = [
      { id: 'srv-1', name: 'Local Server', server_url: 'https://llm.local' },
    ];
    mockModels = [
      { id: 'lm-1', server_id: 'srv-1', name: 'text-embedding-3-small' },
      { id: 'lm-2', server_id: 'srv-1', name: 'gpt-4' },
    ];
    mockRoleAssignments = buildMockRoleAssignments({
      embedding: {
        installation: { server_id: 'srv-1', model: 'text-embedding-3-small' },
      },
    });

    const store = createTestStore();
    render(
      <Provider store={store}>
        <Models />
      </Provider>
    );

    await waitFor(() => {
      expect(screen.getByText(/text-embedding-3-small/)).toBeTruthy();
    });

    // The embedding model should show an Embedding badge with (installation) scope
    const embeddingBadge = screen.getByText(/Embedding/);
    expect(embeddingBadge).toBeTruthy();
    const installationLabel = screen.getByText(/\(installation\)/);
    expect(installationLabel).toBeTruthy();
  });

  it('shows no annotation for model holding no role', async () => {
    mockServers = [
      { id: 'srv-1', name: 'Local Server', server_url: 'https://llm.local' },
    ];
    mockModels = [
      { id: 'lm-1', server_id: 'srv-1', name: 'gpt-4' },
    ];
    mockRoleAssignments = buildMockRoleAssignments();

    const store = createTestStore();
    render(
      <Provider store={store}>
        <Models />
      </Provider>
    );

    await waitFor(() => {
      expect(screen.getByText(/gpt-4/)).toBeTruthy();
    });

    // No role badges should appear for an unassigned model
    expect(screen.queryByText(/Embedding/)).toBeNull();
    expect(screen.queryByText(/Inference/)).toBeNull();
    expect(screen.queryByText(/Image/)).toBeNull();
  });

  it('shows both roles for model holding two roles', async () => {
    mockServers = [
      { id: 'srv-1', name: 'Local Server', server_url: 'https://llm.local' },
    ];
    mockModels = [
      { id: 'lm-1', server_id: 'srv-1', name: 'multi-purpose-model' },
    ];
    mockRoleAssignments = buildMockRoleAssignments({
      inference: {
        user: { server_id: 'srv-1', model: 'multi-purpose-model' },
      },
      embedding: {
        installation: { server_id: 'srv-1', model: 'multi-purpose-model' },
      },
    });

    const store = createTestStore();
    render(
      <Provider store={store}>
        <Models />
      </Provider>
    );

    await waitFor(() => {
      expect(screen.getByText(/multi-purpose-model/)).toBeTruthy();
    });

    // Both Inference and Embedding badges should appear
    const inferenceBadge = screen.getByText(/Inference/);
    expect(inferenceBadge).toBeTruthy();
    const embeddingBadge = screen.getByText(/Embedding/);
    expect(embeddingBadge).toBeTruthy();

    // Should show (user) for inference and (installation) for embedding
    const userLabel = screen.getByText(/\(user\)/);
    expect(userLabel).toBeTruthy();
    const installationLabel = screen.getByText(/\(installation\)/);
    expect(installationLabel).toBeTruthy();
  });

  it('distinguishes identically-named models on different servers (FR-026)', async () => {
    mockServers = [
      { id: 'srv-1', name: 'Local Server', server_url: 'https://llm.local' },
      { id: 'srv-2', name: 'Remote Server', server_url: 'https://llm.remote' },
    ];
    mockModels = [
      { id: 'lm-1', server_id: 'srv-1', name: 'gpt-4' },
      { id: 'lm-2', server_id: 'srv-2', name: 'gpt-4' },
    ];
    mockRoleAssignments = buildMockRoleAssignments({
      inference: {
        user: { server_id: 'srv-1', model: 'gpt-4' },
      },
      embedding: {
        installation: { server_id: 'srv-2', model: 'gpt-4' },
      },
    });

    const store = createTestStore();
    render(
      <Provider store={store}>
        <Models />
      </Provider>
    );

    await waitFor(() => {
      // Both models should be rendered
      const gpt4Elements = screen.getAllByText(/gpt-4/);
      expect(gpt4Elements.length).toBe(2);
    });

    // The Local Server gpt-4 should have Inference badge
    // The Remote Server gpt-4 should have Embedding badge
    const inferenceBadge = screen.getByText(/Inference/);
    expect(inferenceBadge).toBeTruthy();
    const embeddingBadge = screen.getByText(/Embedding/);
    expect(embeddingBadge).toBeTruthy();

    // Both server names should be visible to distinguish the models
    expect(screen.getByText(/Local Server/)).toBeTruthy();
    expect(screen.getByText(/Remote Server/)).toBeTruthy();
  });
});
