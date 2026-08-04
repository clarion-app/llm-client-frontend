import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

// Mock data - declared before vi.mock so the factory captures the reference.
let mockServers: any[] = [];
let mockModels: any[] = [];

vi.mock('@clarion-app/frontend-base', () => ({
  createBackendConfig: () => ({
    backend: { url: 'http://localhost:8000', user: { id: '', name: '', email: '' } },
    updateFrontend: () => {},
  }),
  createBaseQuery: () => async (args: any) => {
    const url = typeof args === 'string' ? args : args?.url;
    if (url?.includes('/server') && !url?.includes('/server-status')) return { data: mockServers };
    if (url?.includes('/model')) return { data: mockModels };
    return { data: {} };
  },
}));

// Dynamic import so mocks are in place.
const { ModelPicker } = await import('./ModelPicker');

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

function buildMockModels(serverId: string, count: number): any[] {
  const models: any[] = [];
  for (let i = 1; i <= count; i++) {
    models.push({
      id: `${serverId}-model-${i}`,
      name: `model-${i}`,
      server_id: serverId,
    });
  }
  return models;
}

describe('ModelPicker', () => {
  let onSelect: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onSelect = vi.fn();
    mockServers = [
      { id: 'srv-1', name: 'Local Server', server_url: 'http://localhost:8081', provider_type: 'openai', has_token: true },
      { id: 'srv-2', name: 'Cloud Server', server_url: 'https://api.cloud.com', provider_type: 'openai', has_token: true },
    ];
    mockModels = [
      ...buildMockModels('srv-1', 3),
      ...buildMockModels('srv-2', 2),
    ];
  });

  it('displays options grouped under their server name', async () => {
    const store = createTestStore();

    render(
      <Provider store={store}>
        <ModelPicker onSelect={onSelect} />
      </Provider>,
    );

    // Wait for data to load
    await waitFor(() => {
      const serverState = store.getState()[serverApi.reducerPath];
      const modelState = store.getState()[modelApi.reducerPath];
      expect(serverState.queries['getServers(null)']?.status).toBe('fulfilled');
      expect(modelState.queries['getAllModels(undefined)']?.status).toBe('fulfilled');
    });

    // Click the button to open the dropdown
    const button = screen.getByRole('combobox');
    fireEvent.click(button);

    // Should show server group headings (CSS textTransform doesn't change DOM text)
    expect(screen.getByText('Local Server')).toBeInTheDocument();
    expect(screen.getByText('Cloud Server')).toBeInTheDocument();

    // Models should be visible under their server groups
    expect(screen.getAllByText('model-1')).toHaveLength(2); // One under each server
    expect(screen.getAllByText('model-3')).toHaveLength(1); // Only srv-1 has model-3
  });

  it('narrows options across all servers when text is typed', async () => {
    const store = createTestStore();
    render(
      <Provider store={store}>
        <ModelPicker onSelect={onSelect} />
      </Provider>,
    );

    // Wait for data to load
    await waitFor(() => {
      const serverState = store.getState()[serverApi.reducerPath];
      const modelState = store.getState()[modelApi.reducerPath];
      expect(serverState.queries['getServers(null)']?.status).toBe('fulfilled');
      expect(modelState.queries['getAllModels(undefined)']?.status).toBe('fulfilled');
    });

    // Click the button to open the dropdown
    const button = screen.getByRole('combobox');
    fireEvent.click(button);

    // Type in the search/filter input
    const searchInput = screen.getByPlaceholderText('Search models...');
    fireEvent.change(searchInput, { target: { value: 'model-2' } });

    // Only matching models should be visible
    expect(screen.getAllByText('model-2')).toHaveLength(2); // One under each server
    // Non-matching models should be hidden
    expect(screen.queryAllByText('model-1')).toHaveLength(0);
    expect(screen.queryAllByText('model-3')).toHaveLength(0);
  });

  it('selected option value carries (server_id, model) — no code path selects by model name alone', async () => {
    const store = createTestStore();
    render(
      <Provider store={store}>
        <ModelPicker onSelect={onSelect} />
      </Provider>,
    );

    // Wait for data to load
    await waitFor(() => {
      const serverState = store.getState()[serverApi.reducerPath];
      const modelState = store.getState()[modelApi.reducerPath];
      expect(serverState.queries['getServers(null)']?.status).toBe('fulfilled');
      expect(modelState.queries['getAllModels(undefined)']?.status).toBe('fulfilled');
    });

    // Click the button to open the dropdown
    const button = screen.getByRole('combobox');
    fireEvent.click(button);

    // Select a model (getAllByText because model-1 exists under both servers)
    const modelOptions = screen.getAllByText('model-1');
    fireEvent.click(modelOptions[0]);

    // Verify the onSelect callback receives (server_id, model) tuple
    expect(onSelect).toHaveBeenCalled();
    const selectedValue = onSelect.mock.calls[0][0];

    // The selected value should include both server_id and model name
    expect(selectedValue).toHaveProperty('server_id', 'srv-1');
    expect(selectedValue).toHaveProperty('model', 'model-1');

    // It should NOT be just the model name
    expect(selectedValue).not.toBe('model-1');
  });

  it('assigns a model in <= 3 interactions with 200 models across 5 servers (SC-007)', async () => {
    // Build 200 models across 5 servers
    mockServers = [];
    mockModels = [];
    for (let s = 1; s <= 5; s++) {
      mockServers.push({
        id: `srv-${s}`,
        name: `Server ${s}`,
        server_url: `http://server${s}.localhost`,
        provider_type: 'openai',
        has_token: true,
      });
      mockModels.push(...buildMockModels(`srv-${s}`, 40));
    }

    const store = createTestStore();
    render(
      <Provider store={store}>
        <ModelPicker onSelect={onSelect} />
      </Provider>,
    );

    // Wait for data to load
    await waitFor(() => {
      const serverState = store.getState()[serverApi.reducerPath];
      const modelState = store.getState()[modelApi.reducerPath];
      expect(serverState.queries['getServers(null)']?.status).toBe('fulfilled');
      expect(modelState.queries['getAllModels(undefined)']?.status).toBe('fulfilled');
    });

    // Interaction 1: Open picker (click to open dropdown)
    const picker = screen.getByRole('combobox');
    fireEvent.click(picker);

    // Interaction 2: Type to filter
    const searchInput = screen.getByPlaceholderText('Search models...');
    fireEvent.change(searchInput, { target: { value: 'model-20' } });

    // Filtered results should show (model-20 exists in all 5 servers)
    expect(screen.getAllByText('model-20')).toHaveLength(5);

    // Interaction 3: Click to select
    const modelOptions = screen.getAllByText('model-20');
    fireEvent.click(modelOptions[0]);

    // Verify selection
    expect(onSelect).toHaveBeenCalled();
    const selectedValue = onSelect.mock.calls[0][0];
    expect(selectedValue).toHaveProperty('model', 'model-20');
    expect(selectedValue).toHaveProperty('server_id');
  });
});
