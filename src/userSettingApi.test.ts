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

vi.mock('./baseQuery', () => ({
  baseQuery: () => async (args: any) => {
    capturedRequests.push(args);
    if (typeof args === 'string' && args === '/user-setting') {
      return { data: { server_id: 'srv-1', model: 'gpt-4' } };
    }
    return { data: { server_id: 'srv-2', model: 'gpt-3.5' } };
  },
}));

const { userSettingApi } = await import('./userSettingApi');

function createTestStore() {
  return configureStore({
    reducer: {
      [userSettingApi.reducerPath]: userSettingApi.reducer,
    },
    middleware: (getDefault) =>
      getDefault().concat(userSettingApi.middleware),
  });
}

describe('userSettingApi', () => {
  beforeEach(() => {
    capturedRequests = [];
  });

  it('GET /user-setting fetches user settings', async () => {
    const store = createTestStore();
    await store.dispatch(userSettingApi.endpoints.getUserSetting.initiate(null));
    expect(capturedRequests).toContainEqual('/user-setting');
  });

  it('PUT /user-setting updates user settings', async () => {
    const store = createTestStore();
    await store.dispatch(
      userSettingApi.endpoints.updateUserSetting.initiate({
        server_id: 'srv-2',
        model: 'gpt-3.5',
      }),
    );
    expect(capturedRequests).toContainEqual({
      url: '/user-setting',
      method: 'PUT',
      body: { server_id: 'srv-2', model: 'gpt-3.5' },
    });
  });
});
