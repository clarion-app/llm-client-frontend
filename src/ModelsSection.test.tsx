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

vi.mock('@clarion-app/frontend-base', () => ({
  createBackendConfig: () => ({
    backend: { url: 'http://localhost:8000', user: { id: '', name: '', email: '' } },
    updateFrontend: () => {},
  }),
  createBaseQuery: () => async (args: any) => {
    const url = typeof args === 'string' ? args : args?.url;
    if (url?.includes('/server') && !url?.includes('/server-status')) return { data: mockServers };
    if (url?.includes('/server-status')) return { data: [] };
    if (url?.includes('/model')) return { data: mockModels };
    if (url?.includes('/role-assignment')) return { data: mockRoleAssignments };
    return { data: {} };
  },
}));

// Dynamic import so mocks are in place.
const { ModelsSection } = await import('./ModelsSection');

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

describe('ModelsSection', () => {
  beforeEach(() => {
    mockServers = [
      { id: 'srv-1', name: 'Local Server', server_url: 'http://localhost:8081', provider_type: 'openai' },
      { id: 'srv-2', name: 'Cloud Server', server_url: 'https://api.cloud.com', provider_type: 'openai' },
    ];
    mockModels = [
      { id: 'm-1', name: 'gpt-4', server_id: 'srv-1' },
      { id: 'm-2', name: 'gpt-3.5-turbo', server_id: 'srv-1' },
      { id: 'm-3', name: 'claude-3', server_id: 'srv-2' },
    ];
    mockRoleAssignments = {
      inference: { role: 'inference', effective: { status: 'unassigned', scope: null, server: null, model: null, reason: null }, user_assignment: null, installation_assignment: null },
      embedding: { role: 'embedding', effective: { status: 'unassigned', scope: null, server: null, model: null, reason: null }, user_assignment: null, installation_assignment: null },
      image: { role: 'image', effective: { status: 'unassigned', scope: null, server: null, model: null, reason: null }, user_assignment: null, installation_assignment: null },
    };
  });

  it('renders all known models grouped under their server', async () => {
    const store = createTestStore();
    render(
      <Provider store={store}>
        <ModelsSection />
      </Provider>,
    );

    // Wait for data to load
    await waitFor(() => {
      const serverState = store.getState()[serverApi.reducerPath];
      const modelState = store.getState()[modelApi.reducerPath];
      expect(serverState.queries['getServers(null)']?.status).toBe('fulfilled');
      expect(modelState.queries['getAllModels(undefined)']?.status).toBe('fulfilled');
    });

    // Server group headings should be present
    const serverHeadings = screen.getAllByText(/Local Server|Cloud Server/);
    expect(serverHeadings.length).toBeGreaterThanOrEqual(2);

    // Models should be present under their server groups
    expect(screen.getByText('gpt-4')).toBeInTheDocument();
    expect(screen.getByText('gpt-3.5-turbo')).toBeInTheDocument();
    expect(screen.getByText('claude-3')).toBeInTheDocument();
  });

  it('ModelSearchInput narrows across all servers (FR-021)', async () => {
    const store = createTestStore();
    render(
      <Provider store={store}>
        <ModelsSection />
      </Provider>,
    );

    // Wait for data to load
    await waitFor(() => {
      const modelState = store.getState()[modelApi.reducerPath];
      expect(modelState.queries['getAllModels(undefined)']?.status).toBe('fulfilled');
    });

    // Find the search input
    const searchInput = screen.getByPlaceholderText(/filter/i) || screen.getByRole('searchbox');
    fireEvent.change(searchInput, { target: { value: 'gpt' } });

    // Only gpt models should be visible
    await waitFor(() => {
      expect(screen.getByText('gpt-4')).toBeInTheDocument();
      expect(screen.getByText('gpt-3.5-turbo')).toBeInTheDocument();
      expect(screen.queryByText('claude-3')).not.toBeInTheDocument();
    });
  });

  it('assignment remains available from the narrowed list (FR-022)', async () => {
    const store = createTestStore();
    render(
      <Provider store={store}>
        <ModelsSection />
      </Provider>,
    );

    // Wait for data to load
    await waitFor(() => {
      const modelState = store.getState()[modelApi.reducerPath];
      expect(modelState.queries['getAllModels(undefined)']?.status).toBe('fulfilled');
    });

    // Filter to narrow
    const searchInput = screen.getByPlaceholderText(/filter/i) || screen.getByRole('searchbox');
    fireEvent.change(searchInput, { target: { value: 'gpt-4' } });

    // gpt-4 should still be assignable (the row should have an assign affordance)
    await waitFor(() => {
      expect(screen.getByText('gpt-4')).toBeInTheDocument();
      // The model row should have a way to assign (button or similar)
      const assignButtons = screen.getAllByTestId('assign-role-btn');
      expect(assignButtons.length).toBeGreaterThan(0);
    });
  });

  it('empty group headings disappear when filter narrows results', async () => {
    const store = createTestStore();
    render(
      <Provider store={store}>
        <ModelsSection />
      </Provider>,
    );

    // Wait for data to load
    await waitFor(() => {
      const modelState = store.getState()[modelApi.reducerPath];
      expect(modelState.queries['getAllModels(undefined)']?.status).toBe('fulfilled');
    });

    // Filter to a model only on srv-1
    const searchInput = screen.getByPlaceholderText(/filter/i) || screen.getByRole('searchbox');
    fireEvent.change(searchInput, { target: { value: 'gpt-4' } });

    // Cloud Server heading should disappear (no matches)
    await waitFor(() => {
      expect(screen.queryByTestId('server-model-group-srv-2')).not.toBeInTheDocument();
    });

    // Local Server heading should still be visible
    expect(screen.getByTestId('server-model-group-srv-1')).toBeInTheDocument();
  });
});
