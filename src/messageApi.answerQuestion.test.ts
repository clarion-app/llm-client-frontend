import { describe, it, expect, vi, beforeEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

/**
 * `answerQuestion` lives on the existing, already-registered message slice:
 * it posts a selection or free text (never both) to the question's own
 * answer route, and invalidates `Message` so an open conversation's
 * message list re-fetches and shows the question's new state.
 */

let requests: any[] = [];

vi.mock('./config', () => ({
  backend: {
    url: 'http://localhost:8000',
    token: 'test-token',
    user: { id: 'user-1', name: 'Test User', email: 'test@test.com' },
  },
  updateFrontend: () => {},
}));

vi.mock('@clarion-app/frontend-base', () => ({
  createBackendConfig: () => ({ backend: { url: 'http://localhost:8000', user: { id: '', name: '', email: '' } }, updateFrontend: () => {} }),
  createBaseQuery: () => async (args: any) => {
    requests.push(args);
    if (typeof args === 'string') {
      return { data: [] };
    }
    return { data: { status: 'answered', question: null, message: null } };
  },
}));

const { messageApi } = await import('./messageApi');

function createStore() {
  return configureStore({
    reducer: { [messageApi.reducerPath]: messageApi.reducer },
    middleware: (getDefault) => getDefault().concat(messageApi.middleware),
  });
}

const endpoints = messageApi.endpoints as any;

function messageListFetches(): number {
  return requests.filter((r) => r === '/conversation/conv-1/message').length;
}

describe('messageApi - answerQuestion', () => {
  beforeEach(() => {
    requests = [];
  });

  it('is exported as a hook on the message slice', async () => {
    const module = await import('./messageApi');
    expect(typeof (module as any).useAnswerQuestionMutation).toBe('function');
  });

  it('posts a selection to the question\'s answer route with only `selected`', async () => {
    const store = createStore();

    await store.dispatch(endpoints.answerQuestion.initiate({ questionId: 'q-1', selected: [2] }));

    expect(requests).toHaveLength(1);
    expect(requests[0]).toStrictEqual({
      url: 'question/q-1/answer',
      method: 'POST',
      body: { selected: [2] },
    });
  });

  it('posts free text to the question\'s answer route with only `text`', async () => {
    const store = createStore();

    await store.dispatch(endpoints.answerQuestion.initiate({ questionId: 'q-7', text: 'none of these' }));

    expect(requests).toHaveLength(1);
    expect(requests[0]).toStrictEqual({
      url: 'question/q-7/answer',
      method: 'POST',
      body: { text: 'none of these' },
    });
  });

  it('re-fetches a subscribed message list after a successful answer', async () => {
    const store = createStore();
    const subscription = store.dispatch(endpoints.getMessages.initiate('conv-1'));
    await subscription;
    expect(messageListFetches()).toBe(1);

    await store.dispatch(endpoints.answerQuestion.initiate({ questionId: 'q-1', selected: [2] }));

    await vi.waitFor(() => {
      expect(messageListFetches()).toBe(2);
    });
    subscription.unsubscribe();
  });
});
