import { describe, it, expect, vi, beforeEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

/**
 * The task budget endpoints live on the conversation slice the host
 * already registers (`llmClientConversationApi`, reducer path
 * `llm-client-conversationApi`) — never on a slice of their own, which the
 * host would not register:
 *
 * - `getTaskBudget(conversationId)` reads `GET conversation/{id}/task-budget`;
 * - `updateTaskBudget({conversationId, max_steps?, max_spend?})` sends
 *   `PATCH conversation/{id}/task-budget` with only the keys it was given,
 *   and the standing is read again afterwards;
 * - `getRunTaskBudget(runId)` reads `GET agent-runs/{id}/task-budget`.
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
    return { data: { task_budget: null } };
  },
  registerUserChannelHandler: () => {},
}));

const { conversationApi } = await import('./conversationApi');
const pkgIndex: Record<string, any> = await import('./index');

function store() {
  return configureStore({
    reducer: { [conversationApi.reducerPath]: conversationApi.reducer },
    middleware: (getDefault) => getDefault().concat(conversationApi.middleware),
  });
}

function asRequest(args: any): { url: string; method: string; body?: unknown } {
  return typeof args === 'string' ? { url: args, method: 'GET' } : { method: 'GET', ...args };
}

const endpoints = conversationApi.endpoints as Record<string, any>;

describe('conversationApi — task budget endpoints', () => {
  beforeEach(() => {
    requests = [];
  });

  it('belongs to the conversation slice the host already registers', () => {
    expect(conversationApi.reducerPath).toBe('llm-client-conversationApi');
    expect(pkgIndex.llmClientConversationApi).toBe(conversationApi);
    for (const name of ['getTaskBudget', 'updateTaskBudget', 'getRunTaskBudget']) {
      expect(endpoints[name], `${name} is an endpoint of llmClientConversationApi`).toBeDefined();
    }
  });

  it('getTaskBudget reads the conversation\'s task budget', async () => {
    const s = store();
    await s.dispatch(endpoints.getTaskBudget.initiate('conv-1'));

    expect(requests.map(asRequest)).toEqual([{ url: '/conversation/conv-1/task-budget', method: 'GET' }]);
  });

  it('getRunTaskBudget reads a run\'s task budget record', async () => {
    const s = store();
    await s.dispatch(endpoints.getRunTaskBudget.initiate('run-9'));

    expect(requests.map(asRequest)).toEqual([{ url: '/agent-runs/run-9/task-budget', method: 'GET' }]);
  });

  it.each([
    ['steps only', { max_steps: 30 }, { max_steps: 30 }],
    ['spend only', { max_spend: '2.00' }, { max_spend: '2.00' }],
    ['both', { max_steps: 30, max_spend: '2.00' }, { max_steps: 30, max_spend: '2.00' }],
  ])('updateTaskBudget sends PATCH with only the keys given (%s)', async (_label, change, body) => {
    const s = store();
    await s.dispatch(endpoints.updateTaskBudget.initiate({ conversationId: 'conv-1', ...change }));

    const patches = requests.map(asRequest).filter((r) => r.method === 'PATCH');
    expect(patches).toEqual([{ url: '/conversation/conv-1/task-budget', method: 'PATCH', body }]);
  });

  it('a change is followed by reading the standing again', async () => {
    const s = store();
    const subscription = s.dispatch(endpoints.getTaskBudget.initiate('conv-1'));
    await subscription;
    expect(requests.map(asRequest).filter((r) => r.method === 'GET')).toHaveLength(1);

    await s.dispatch(endpoints.updateTaskBudget.initiate({ conversationId: 'conv-1', max_steps: 30 }));

    await vi.waitFor(() => {
      expect(requests.map(asRequest).filter((r) => r.url === '/conversation/conv-1/task-budget' && r.method === 'GET')).toHaveLength(2);
    });
    subscription.unsubscribe();
  });
});
