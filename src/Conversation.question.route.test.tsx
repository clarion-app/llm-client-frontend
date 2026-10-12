import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import type { ComponentType } from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { MessageType, QuestionView } from './types';

/**
 * The question form, reached the way the deployed app reaches it.
 *
 * The host app builds its route table and its store from `package.json`'s
 * `customFields.clarion`: each route's element is mounted with no props,
 * and only the RTK Query slices named in `customFields.clarion.api` are
 * registered. A component test that hands the form its props, or builds
 * its own store, cannot see a slice that was never registered or a screen
 * that never passes the question through. This test reads both lists from
 * the manifest, resolves every name through the package's `index.ts`
 * exports, and renders the conversation route's real `<Conversation />` at
 * a concrete id: the message list it loads carries a pending question, the
 * form appears, and submitting it posts the answer and re-fetches the list.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf-8'));
const clarion = pkg.customFields?.clarion ?? {};
const manifestRoutes: Array<{ path: string; element: string }> = clarion.routes ?? [];
const manifestApis: string[] = clarion.api ?? [];

const CONVERSATION_ROUTE = '/clarion-app/llm-client/conversations/:id';
const CONVERSATION_ID = 'conv-q';
const QUESTION_ID = 'q-route-1';
const QUESTION_TEXT =
  'Which part should I change first?\n\n1. Backend\n2. Frontend\n3. Docs\n\n' +
  'Reply with the number of your choice, or answer in your own words.';

let requests: Array<{ url: string; method: string; body: any }> = [];
let messageListFetches = 0;

function pendingView(): QuestionView {
  return {
    id: QUESTION_ID,
    question: 'Which part should I change first?',
    preamble: null,
    choices: [
      { number: 1, text: 'Backend' },
      { number: 2, text: 'Frontend' },
      { number: 3, text: 'Docs' },
    ],
    allow_multiple: false,
    state: 'pending',
    expires_at: '2026-10-12T09:00:00Z',
    answer: null,
  };
}

function messageList(): MessageType[] {
  return [
    {
      id: 'msg-user',
      conversation_id: CONVERSATION_ID,
      role: 'user',
      user: 'Test User',
      content: 'Help me tidy up the project.',
      tool_data: null,
      updated_at: '2026-10-12T08:00:00.000000Z',
      streaming: false,
      responseTime: 0,
    },
    {
      id: 'msg-question',
      conversation_id: CONVERSATION_ID,
      role: 'assistant',
      user: 'Clarion',
      content: QUESTION_TEXT,
      tool_data: { kind: 'agent_question', question_id: QUESTION_ID, state: 'pending' } as unknown as string,
      updated_at: '2026-10-12T08:00:01.000000Z',
      streaming: false,
      responseTime: 0,
      question: pendingView(),
    } as MessageType,
  ];
}

vi.mock('@clarion-app/frontend-base', () => ({
  createBackendConfig: () => ({
    backend: { url: 'http://localhost:8000', token: 'test-token', user: { id: 'user-1', name: 'Test User', email: 'test@test.com' } },
    updateFrontend: () => {},
  }),
  createBaseQuery: () => async (args: any) => {
    const url = String(typeof args === 'string' ? args : (args?.url ?? '')).split('?')[0];
    const method = typeof args === 'string' ? 'GET' : (args?.method ?? 'GET');

    if (method !== 'GET') {
      requests.push({ url, method, body: args?.body });
      if (url.replace(/^\//, '') === `question/${QUESTION_ID}/answer`) {
        return { data: { status: 'answered', question: { ...pendingView(), state: 'answered' }, message: null } };
      }
      return { data: {} };
    }

    if (url === `/conversation/${CONVERSATION_ID}/message`) {
      messageListFetches++;
      return { data: messageList() };
    }
    if (url === '/role-assignment') {
      return { data: null };
    }
    return { data: [] };
  },
  registerUserChannelHandler: () => {},
}));

// The package entry point, exactly as the host imports it.
const pkgIndex: Record<string, any> = await import('./index');

function setupEcho() {
  const channel: any = { listen: vi.fn() };
  channel.listen.mockReturnValue(channel);
  (window as any).Echo = {
    private: vi.fn().mockReturnValue(channel),
    leave: vi.fn(),
    channel: vi.fn().mockReturnValue(channel),
  };
}

/** The store the host generates from `customFields.clarion.api`. */
function manifestStore() {
  const slices = manifestApis.map((name) => {
    const slice = pkgIndex[name];
    expect(slice, `customFields.clarion.api names "${name}", which index.ts must export`).toBeDefined();
    return slice;
  });
  return configureStore({
    reducer: Object.fromEntries(slices.map((slice) => [slice.reducerPath, slice.reducer])),
    middleware: (getDefault) => getDefault({ serializableCheck: false, immutableCheck: false }).concat(...slices.map((slice) => slice.middleware)),
  });
}

/** The conversation route's element, resolved by name through index.ts. */
function conversationRouteElement(): ComponentType {
  const route = manifestRoutes.find((r) => r.path === CONVERSATION_ROUTE);
  expect(route, `the manifest declares ${CONVERSATION_ROUTE}`).toBeDefined();
  const match = route!.element.match(/^<(\w+)\s*\/>$/);
  expect(match, 'the route element is a component mounted with no props').not.toBeNull();
  const component = pkgIndex[match![1]];
  expect(component, `index.ts exports ${match![1]}`).toBeDefined();
  return component;
}

describe('Conversation route — answering a question through the form', () => {
  beforeEach(() => {
    cleanup();
    requests = [];
    messageListFetches = 0;
    setupEcho();
  });

  it('shows the pending question as a form and submits the chosen option to the question\'s answer route', async () => {
    const RouteElement = conversationRouteElement();
    const store = manifestStore();

    render(
      <MemoryRouter initialEntries={[`/clarion-app/llm-client/conversations/${CONVERSATION_ID}`]}>
        <Provider store={store}>
          <Routes>
            <Route path={CONVERSATION_ROUTE} element={<RouteElement />} />
          </Routes>
        </Provider>
      </MemoryRouter>,
    );

    const group = await screen.findByRole('group', { name: 'Which part should I change first?' });
    expect(group).toBeInTheDocument();
    expect(screen.queryByText(/Reply with the number of your choice/)).toBeNull();
    const fetchesBeforeSubmit = messageListFetches;
    expect(fetchesBeforeSubmit).toBeGreaterThanOrEqual(1);

    fireEvent.click(screen.getByRole('radio', { name: '2. Frontend' }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit answer' }));

    await waitFor(() => {
      expect(requests.filter((r) => r.url.replace(/^\//, '') === `question/${QUESTION_ID}/answer`)).toHaveLength(1);
    });
    const answer = requests.find((r) => r.url.replace(/^\//, '') === `question/${QUESTION_ID}/answer`)!;
    expect(answer.method).toBe('POST');
    expect(answer.body).toStrictEqual({ selected: [2] });
    expect(requests.filter((r) => r.url === 'message' || r.url === '/message'), 'the form does not post an ordinary message').toHaveLength(0);

    await waitFor(() => {
      expect(messageListFetches).toBeGreaterThan(fetchesBeforeSubmit);
    });
  });
});
