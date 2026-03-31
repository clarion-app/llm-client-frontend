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
let mockUserSetting: any = { server_id: null, model: null };

vi.mock('./baseQuery', () => ({
  baseQuery: () => async (args: any) => {
    if (typeof args === 'string') {
      if (args === '/server') return { data: mockServers };
      if (args === '/user-setting') return { data: mockUserSetting };
      if (args.match(/\/server\/.+\/model/)) return { data: mockModels };
    }
    return { data: {} };
  },
}));

const { default: UserSettings } = await import('./UserSettings');
const { userSettingApi } = await import('./userSettingApi');
const { serverApi } = await import('./serverApi');
const { modelApi } = await import('./modelApi');

function createTestStore() {
  return configureStore({
    reducer: {
      [userSettingApi.reducerPath]: userSettingApi.reducer,
      [serverApi.reducerPath]: serverApi.reducer,
      [modelApi.reducerPath]: modelApi.reducer,
    },
    middleware: (getDefault) =>
      getDefault().concat(
        userSettingApi.middleware,
        serverApi.middleware,
        modelApi.middleware,
      ),
  });
}

describe('UserSettings', () => {
  beforeEach(() => {
    mockServers = [];
    mockModels = [];
    mockUserSetting = { server_id: null, model: null };
  });

  it('renders loading state', () => {
    const store = createTestStore();
    render(
      <Provider store={store}>
        <UserSettings />
      </Provider>,
    );
    expect(screen.getByText(/loading/i)).toBeTruthy();
  });

  it('shows empty state when no servers exist', async () => {
    mockServers = [];
    const store = createTestStore();
    render(
      <Provider store={store}>
        <UserSettings />
      </Provider>,
    );
    await waitFor(() => {
      expect(screen.getByText(/no servers/i)).toBeTruthy();
    });
  });

  it('renders server selector when servers exist', async () => {
    mockServers = [
      { id: 'srv-1', name: 'Server 1', server_url: 'https://llm.example.com' },
      { id: 'srv-2', name: 'Server 2', server_url: 'https://llm2.example.com' },
    ];
    const store = createTestStore();
    render(
      <Provider store={store}>
        <UserSettings />
      </Provider>,
    );
    await waitFor(() => {
      expect(screen.getByText('Server 1')).toBeTruthy();
      expect(screen.getByText('Server 2')).toBeTruthy();
    });
  });
});
