import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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

vi.mock('@clarion-app/frontend-base', () => ({
  createBackendConfig: () => ({ backend: { url: 'http://localhost:8000', user: { id: '', name: '', email: '' } }, updateFrontend: () => {} }),
  createBaseQuery: () => async () => ({ data: [] }),
}));

const { default: Message } = await import('./Message');

function createTestStore() {
  return configureStore({
    reducer: {
      [conversationApi.reducerPath]: conversationApi.reducer,
    },
    middleware: (getDefault) =>
      getDefault().concat(conversationApi.middleware),
  });
}

const baseProps = {
  id: 'msg-1',
  conversation_id: 'conv-1',
  role: 'Assistant',
  user: 'Assistant',
  updated_at: new Date().toISOString(),
  streaming: false,
  responseTime: 0,
  onDelete: vi.fn(),
};

describe('Message - Marker Rendering', () => {
  it('renders ApiCallConfirmation card for __pending_api_call: prefix', () => {
    const payload = JSON.stringify({
      conversation_id: 'conv-1',
      message_id: 'msg-1',
      method: 'DELETE',
      path: '/api/resource/123',
      body: { id: 123 },
    });
    const store = createTestStore();
    render(
      <Provider store={store}>
        <Message {...baseProps} content={`__pending_api_call:${payload}`} />
      </Provider>,
    );

    expect(screen.getByText('DELETE')).toBeTruthy();
    expect(screen.getByText('/api/resource/123')).toBeTruthy();
  });

  it('renders denial notice for __cancelled content', () => {
    render(<Message {...baseProps} content="__cancelled" />);

    expect(screen.getByText(/API call denied by user/i)).toBeTruthy();
  });

  it('renders normal messages unchanged', () => {
    render(<Message {...baseProps} content="Hello, world!" />);

    expect(screen.getByText('Hello, world!')).toBeTruthy();
  });
});
