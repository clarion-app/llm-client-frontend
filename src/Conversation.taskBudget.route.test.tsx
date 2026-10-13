import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import type { ComponentType } from 'react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';

/**
 * The conversation's task budget, reached the way the deployed app reaches
 * it.
 *
 * The host builds its routes and its store from `package.json`'s
 * `customFields.clarion`: a route's element is mounted with no props, and
 * only the slices named in `customFields.clarion.api` are registered. This
 * test reads both lists from the manifest, resolves them through the
 * package's `index.ts`, and renders the conversation route's real
 * `<Conversation />`:
 *
 * - the task budget panel appears with the standing read through the
 *   registered conversation slice (`GET conversation/{id}/task-budget`);
 * - the composer's "Limits" disclosure ("Step limit", "Spend limit") adds
 *   `task_budget: {max_steps, max_spend}` — only the limits filled in — to
 *   the message it sends; with nothing filled in no `task_budget` is sent;
 * - a message the server refuses with 422 `decision_required` (a ceiling
 *   prompt is waiting and the text was not a decision) shows the server's
 *   guidance inline and keeps what was typed.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'package.json'), 'utf-8'));
const clarion = pkg.customFields?.clarion ?? {};
const manifestRoutes: Array<{ path: string; element: string }> = clarion.routes ?? [];
const manifestApis: string[] = clarion.api ?? [];

const CONVERSATION_ROUTE = '/clarion-app/llm-client/conversations/:id';
const CONVERSATION_ID = 'conv-tb';
const LABEL = "This task's budget: 16 of 20 steps, 0.41 of 1.00 USD";
const GUIDANCE =
  "That was not a decision on this task's budget. Reply 'continue' (optionally with steps=N or spend=X), 'accept' or 'stop'.";

let requests: Array<{ url: string; method: string; body: any }> = [];
let messageResult: () => { data?: any; error?: any };

function standing() {
  return {
    task_budget_id: 'tb-1',
    conversation_id: CONVERSATION_ID,
    state: 'running',
    sub_state: null,
    steps: { used: 16, ceiling: 20, origin: 'default', maximum: 200, approach_noticed: true },
    spend: {
      used: '0.4120000000', ceiling: '1.0000000000', currency: 'USD', origin: 'default', maximum: '25.0000000000',
      approximate: false, incomplete: false, unpriced_request_count: 0, approach_noticed: false,
    },
    approach_threshold: '0.8000',
    reached: [],
    prompt_question_id: null,
    label: LABEL,
  };
}

vi.mock('@clarion-app/frontend-base', () => ({
  createBackendConfig: () => ({
    backend: { url: 'http://localhost:8000', token: 'test-token', user: { id: 'user-1', name: 'Test User', email: 'test@test.com' } },
    updateFrontend: () => {},
  }),
  createBaseQuery: () => async (args: any) => {
    const url = String(typeof args === 'string' ? args : (args?.url ?? '')).split('?')[0];
    const method = typeof args === 'string' ? 'GET' : (args?.method ?? 'GET');
    requests.push({ url, method, body: args?.body });

    if (method === 'POST' && url.replace(/^\//, '') === 'message') {
      return messageResult();
    }
    if (method !== 'GET') {
      return { data: {} };
    }
    if (url === `/conversation/${CONVERSATION_ID}/task-budget`) {
      return { data: standing() };
    }
    if (url === `/conversation/${CONVERSATION_ID}/message`) {
      return { data: [] };
    }
    if (url === '/role-assignment') {
      return { data: null };
    }
    return { data: [] };
  },
  registerUserChannelHandler: () => {},
}));

const pkgIndex: Record<string, any> = await import('./index');

function setupEcho() {
  const channel: any = { listen: vi.fn(() => channel) };
  (window as any).Echo = {
    private: vi.fn().mockReturnValue(channel),
    leave: vi.fn(),
    channel: vi.fn().mockReturnValue(channel),
  };
}

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

function conversationRouteElement(): ComponentType {
  const route = manifestRoutes.find((r) => r.path === CONVERSATION_ROUTE);
  expect(route, `the manifest declares ${CONVERSATION_ROUTE}`).toBeDefined();
  const match = route!.element.match(/^<(\w+)\s*\/>$/);
  expect(match, 'the route element is a component mounted with no props').not.toBeNull();
  const component = pkgIndex[match![1]];
  expect(component, `index.ts exports ${match![1]}`).toBeDefined();
  return component;
}

function renderConversationRoute() {
  const RouteElement = conversationRouteElement();
  render(
    <MemoryRouter initialEntries={[`/clarion-app/llm-client/conversations/${CONVERSATION_ID}`]}>
      <Provider store={manifestStore()}>
        <Routes>
          <Route path={CONVERSATION_ROUTE} element={<RouteElement />} />
        </Routes>
      </Provider>
    </MemoryRouter>,
  );
}

function composer(): HTMLTextAreaElement {
  return screen.getByPlaceholderText('Type your message here...') as HTMLTextAreaElement;
}

function send(text: string) {
  fireEvent.change(composer(), { target: { value: text } });
  fireEvent.keyDown(composer(), { key: 'Enter', shiftKey: false });
}

function sentMessages() {
  return requests.filter((r) => r.method === 'POST' && r.url.replace(/^\//, '') === 'message');
}

describe('Conversation route — the task budget', () => {
  beforeEach(() => {
    cleanup();
    requests = [];
    messageResult = () => ({ data: { id: 'msg-new' } });
    setupEcho();
  });

  it('shows the task budget panel with the standing read through the registered conversation slice', async () => {
    renderConversationRoute();

    expect(await screen.findByText(LABEL)).toBeInTheDocument();
    expect(screen.getByTestId('task-budget-panel')).toBeInTheDocument();
    expect(requests.some((r) => r.method === 'GET' && r.url === `/conversation/${CONVERSATION_ID}/task-budget`)).toBe(true);
  });

  it('sends the limits filled in with the message', async () => {
    renderConversationRoute();
    await screen.findByText(LABEL);

    fireEvent.click(screen.getByRole('button', { name: 'Limits' }));
    fireEvent.change(screen.getByLabelText('Step limit'), { target: { value: '5' } });
    fireEvent.change(screen.getByLabelText('Spend limit'), { target: { value: '2.00' } });
    send('Tidy up the project.');

    await waitFor(() => expect(sentMessages()).toHaveLength(1));
    expect(sentMessages()[0].body).toMatchObject({
      conversation_id: CONVERSATION_ID,
      content: 'Tidy up the project.',
      task_budget: { max_steps: 5, max_spend: '2.00' },
    });
  });

  it('sends only the limits that were filled in', async () => {
    renderConversationRoute();
    await screen.findByText(LABEL);

    fireEvent.click(screen.getByRole('button', { name: 'Limits' }));
    fireEvent.change(screen.getByLabelText('Step limit'), { target: { value: '5' } });
    send('Tidy up the project.');

    await waitFor(() => expect(sentMessages()).toHaveLength(1));
    expect(sentMessages()[0].body.task_budget).toStrictEqual({ max_steps: 5 });
  });

  it('sends no task budget when no limit was filled in', async () => {
    renderConversationRoute();
    await screen.findByText(LABEL);

    send('Tidy up the project.');

    await waitFor(() => expect(sentMessages()).toHaveLength(1));
    expect(sentMessages()[0].body).not.toHaveProperty('task_budget');
  });

  it('shows the guidance of a refused decision inline and keeps the text typed', async () => {
    messageResult = () => ({ error: { status: 422, data: { code: 'decision_required', message: GUIDANCE } } });
    renderConversationRoute();
    await screen.findByText(LABEL);

    send('maybe later');

    expect(await screen.findByRole('alert')).toHaveTextContent(GUIDANCE);
    expect(composer().value).toBe('maybe later');
  });

  it('shows why a message stating limits was refused while busy and keeps the text typed', async () => {
    const BUSY = "This task's budget can only be stated when a request starts, and this conversation is still working on the previous one, so your message was not sent. Send it again once the reply has finished.";
    messageResult = () => ({ error: { status: 409, data: { code: 'processing', message: BUSY } } });
    renderConversationRoute();
    await screen.findByText(LABEL);

    send('/budget steps=5\nTidy up the project.');

    expect(await screen.findByRole('alert')).toHaveTextContent('still working on the previous one');
    expect(composer().value).toBe('/budget steps=5\nTidy up the project.');
  });
});
