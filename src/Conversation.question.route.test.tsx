import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react';
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
 *
 * A form left open on a screen goes stale when its question is resolved
 * elsewhere. The conversation's broadcast (`NewConversationMessageEvent`)
 * re-fetches the list, which carries the question's new state, and the
 * form turns read-only without a reload; a submission the server refuses
 * with 409 shows the question's state and re-fetches the list too.
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

const NEW_MESSAGE_EVENT = '.ClarionApp\\LlmClient\\Events\\NewConversationMessageEvent';

let requests: Array<{ url: string; method: string; body: any }> = [];
let messageListFetches = 0;
/** The question as the server currently holds it. */
let serverView: QuestionView;
/** What `POST question/{id}/answer` returns. */
let answerResult: () => { data?: any; error?: any };
/** While set, message-list fetches wait for it, so a test can observe the moment before they land. */
let listGate: Promise<void> | null = null;
/** The handlers the screen registered on the conversation's channel, by event name. */
let echoHandlers: Record<string, (event?: any) => void> = {};

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
      question: serverView,
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
        return answerResult();
      }
      return { data: {} };
    }

    if (url === `/conversation/${CONVERSATION_ID}/message`) {
      messageListFetches++;
      if (listGate) {
        await listGate;
      }
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
  const channel: any = {
    listen: vi.fn((event: string, handler: (event?: any) => void) => {
      echoHandlers[event] = handler;
      return channel;
    }),
  };
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

function answeredByTap(): QuestionView {
  return {
    ...pendingView(),
    state: 'answered',
    answer: { is_selection: true, selected: [{ number: 2, text: 'Frontend' }], raw_reply: '2', method: 'messaging_option' },
  };
}

function renderConversationRoute() {
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
}

function deferred(): { promise: Promise<void>; release: () => void } {
  let release: () => void = () => {};
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

describe('Conversation route — answering a question through the form', () => {
  beforeEach(() => {
    cleanup();
    requests = [];
    messageListFetches = 0;
    serverView = pendingView();
    answerResult = () => ({ data: { status: 'answered', question: { ...pendingView(), state: 'answered' }, message: null } });
    listGate = null;
    echoHandlers = {};
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
  it.each([
    ['answered elsewhere', answeredByTap, 'Answered: 2. Frontend (from Telegram)'],
    ['expired', (): QuestionView => ({ ...pendingView(), state: 'expired' }), 'Expired — no longer awaiting a reply.'],
  ])('an open form turns read-only without a reload when the question is %s', async (_label, resolved, outcome) => {
    renderConversationRoute();
    await screen.findByRole('group', { name: 'Which part should I change first?' });
    expect(screen.getByRole('button', { name: 'Submit answer' })).toBeInTheDocument();
    expect(echoHandlers[NEW_MESSAGE_EVENT], 'the screen listens for the conversation\'s new-message broadcast').toBeDefined();
    const fetchesBefore = messageListFetches;

    // Resolved on another device, in Telegram, or by expiry: the server
    // broadcasts on the conversation's channel.
    serverView = resolved();
    act(() => {
      echoHandlers[NEW_MESSAGE_EVENT]({ conversation_id: CONVERSATION_ID, message_id: 'msg-question' });
    });

    expect(await screen.findByText(outcome)).toBeInTheDocument();
    expect(messageListFetches).toBeGreaterThan(fetchesBefore);
    expect(screen.queryByRole('button', { name: 'Submit answer' }), 'nothing left to submit').toBeNull();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.getByText('2. Frontend'), 'the question and its choices stay readable').toBeInTheDocument();
    expect(requests, 'nothing was sent').toHaveLength(0);
  });

  it('a submission refused because the question already resolved shows its state and re-fetches the list', async () => {
    renderConversationRoute();
    await screen.findByRole('group', { name: 'Which part should I change first?' });

    // The question was answered from Telegram; this screen has not heard yet.
    serverView = answeredByTap();
    answerResult = () => ({
      error: { status: 409, data: { code: 'question_not_pending', state: 'answered', question: answeredByTap() } },
    });
    const gate = deferred();
    listGate = gate.promise;
    const fetchesBefore = messageListFetches;

    fireEvent.click(screen.getByRole('radio', { name: '3. Docs' }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit answer' }));

    expect(await screen.findByRole('status')).toHaveTextContent('This question was already answered.');
    await waitFor(() => {
      expect(messageListFetches, 'the refusal re-fetches the message list').toBeGreaterThan(fetchesBefore);
    });
    expect(requests.filter((r) => r.url.replace(/^\//, '') === `question/${QUESTION_ID}/answer`)).toHaveLength(1);

    // The re-fetched list lands: the form shows the outcome it lost to.
    await act(async () => {
      gate.release();
    });
    expect(await screen.findByText('Answered: 2. Frontend (from Telegram)')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit answer' })).toBeNull();
  });

  it('a question whose work stopped at its deadline still shows an answerable form, and answering it posts and re-fetches', async () => {
    // Built as a plain object and cast: the view type does not name the
    // stopped state or the newer keys yet.
    serverView = {
      ...pendingView(),
      state: 'stopped',
      answerable: true,
      if_unanswered: 'stop',
      consequential: false,
      assumed_answer: null,
      expiry_statement:
        'If there is no answer by 09:00 UTC on 12 Oct 2026 (1 day after this was asked), work on this task will pause until you reply.',
      outcome_text: 'Expired — work stopped. Answer to resume.',
      stopped_at: '2026-10-12T09:00:05Z',
      answered_late: false,
    } as unknown as QuestionView;
    renderConversationRoute();

    const group = await screen.findByRole('group', { name: 'Which part should I change first?' });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Expired — work stopped. Answer to resume.');
    const fetchesBeforeSubmit = messageListFetches;

    fireEvent.click(screen.getByRole('radio', { name: '2. Frontend' }));
    fireEvent.click(screen.getByRole('button', { name: 'Submit answer' }));

    await waitFor(() => {
      expect(requests.filter((r) => r.url.replace(/^\//, '') === `question/${QUESTION_ID}/answer`)).toHaveLength(1);
    });
    const answer = requests.find((r) => r.url.replace(/^\//, '') === `question/${QUESTION_ID}/answer`)!;
    expect(answer.method).toBe('POST');
    expect(answer.body).toStrictEqual({ selected: [2] });
    expect(requests, 'only the answer was sent').toHaveLength(1);

    await waitFor(() => {
      expect(messageListFetches).toBeGreaterThan(fetchesBeforeSubmit);
    });
  });
});
