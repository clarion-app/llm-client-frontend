import { describe, it, expect, vi, beforeEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';
import { conversationApi } from './conversationApi';

vi.mock('.', () => ({
  backend: {
    url: 'http://localhost:8000',
    token: 'test-token',
    user: { id: 'user-1', name: 'Test User', email: 'test@test.com' },
  },
}));

vi.mock('./baseQuery', () => ({
  baseQuery: () => async (args: any) => {
    lastRequest = args;
    return { data: { success: true } };
  },
}));

let lastRequest: any = null;

describe('conversationApi - confirmApiCall', () => {
  beforeEach(() => {
    lastRequest = null;
  });

  it('sends POST to /conversation/{id}/confirm-api-call with message_id and approved', async () => {
    const store = configureStore({
      reducer: {
        [conversationApi.reducerPath]: conversationApi.reducer,
      },
      middleware: (getDefault) =>
        getDefault().concat(conversationApi.middleware),
    });

    await store.dispatch(
      conversationApi.endpoints.confirmApiCall.initiate({
        conversationId: 'conv-123',
        message_id: 'msg-456',
        approved: true,
      }),
    );

    expect(lastRequest).toEqual({
      url: '/conversation/conv-123/confirm-api-call',
      method: 'POST',
      body: { message_id: 'msg-456', approved: true },
    });
  });
});
