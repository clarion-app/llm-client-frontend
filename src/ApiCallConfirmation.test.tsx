import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { conversationApi } from './conversationApi';

vi.mock('.', () => ({
  backend: {
    url: 'http://localhost:8000',
    token: 'test-token',
    user: { id: 'user-1', name: 'Test User', email: 'test@test.com' },
  },
}));

let mockMutationResult = { data: { success: true } };
let capturedArgs: any = null;

vi.mock('./baseQuery', () => ({
  baseQuery: () => async (args: any) => {
    capturedArgs = args;
    // Simulate network delay for in-flight testing
    await new Promise((r) => setTimeout(r, 50));
    return mockMutationResult;
  },
}));

const { default: ApiCallConfirmation } = await import('./ApiCallConfirmation');

function createTestStore() {
  return configureStore({
    reducer: {
      [conversationApi.reducerPath]: conversationApi.reducer,
    },
    middleware: (getDefault) =>
      getDefault().concat(conversationApi.middleware),
  });
}

const defaultProps = {
  conversation_id: 'conv-1',
  message_id: 'msg-1',
  method: 'DELETE',
  path: '/api/items/42',
  body: { reason: 'cleanup' },
};

describe('ApiCallConfirmation', () => {
  beforeEach(() => {
    capturedArgs = null;
    mockMutationResult = { data: { success: true } };
  });

  it('renders method, path, and body', () => {
    const store = createTestStore();
    render(
      <Provider store={store}>
        <ApiCallConfirmation {...defaultProps} />
      </Provider>,
    );
    expect(screen.getByText('DELETE')).toBeInTheDocument();
    expect(screen.getByText('/api/items/42')).toBeInTheDocument();
    expect(screen.getByText(/"reason":\s*"cleanup"/)).toBeInTheDocument();
  });

  it('Approve button calls confirm mutation with approved: true', async () => {
    const store = createTestStore();
    render(
      <Provider store={store}>
        <ApiCallConfirmation {...defaultProps} />
      </Provider>,
    );
    fireEvent.click(screen.getByText('Approve'));
    await waitFor(() => {
      expect(capturedArgs).toEqual({
        url: '/conversation/conv-1/confirm-api-call',
        method: 'POST',
        body: { message_id: 'msg-1', approved: true },
      });
    });
  });

  it('Deny button calls confirm mutation with approved: false', async () => {
    const store = createTestStore();
    render(
      <Provider store={store}>
        <ApiCallConfirmation {...defaultProps} />
      </Provider>,
    );
    fireEvent.click(screen.getByText('Deny'));
    await waitFor(() => {
      expect(capturedArgs).toEqual({
        url: '/conversation/conv-1/confirm-api-call',
        method: 'POST',
        body: { message_id: 'msg-1', approved: false },
      });
    });
  });
});
