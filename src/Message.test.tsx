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

const QUESTION_TEXT =
  'Which part should I change first?\n' +
  '\n' +
  '1. Backend\n' +
  '2. Frontend\n' +
  '3. Docs\n' +
  '\n' +
  'Reply with the number of your choice, or answer in your own words.';

// The element whose whole text is the message content, or undefined.
function elementWithText(container: HTMLElement, text: string): HTMLElement | undefined {
  return Array.from(container.querySelectorAll<HTMLElement>('*')).find(
    (el) => el.textContent === text,
  );
}

function isPreWrapped(el: HTMLElement): boolean {
  return el.style.whiteSpace === 'pre-wrap' || el.classList.contains('whitespace-pre-wrap');
}

// tool_data arrives as an object at runtime even though types.ts declares a
// string; both forms must be handled.
const asToolData = (value: unknown) => value as unknown as string;

describe('Message - agent question messages', () => {
  const kinds = ['agent_question', 'agent_question_notice', 'agent_question_answer'];

  it.each(kinds)('renders a %s message as plain pre-wrapped text with its numbering intact', (kind) => {
    const { container } = render(
      <Message
        {...baseProps}
        content={QUESTION_TEXT}
        tool_data={asToolData({ kind, question_id: 'q-1', state: 'pending' })}
      />,
    );

    const text = container.textContent ?? '';
    expect(text).toContain('1. Backend\n2. Frontend\n3. Docs');
    expect(container.querySelector('ol')).toBeNull();
    expect(container.querySelector('li')).toBeNull();

    const body = elementWithText(container, QUESTION_TEXT);
    expect(body).toBeDefined();
    expect(isPreWrapped(body!)).toBe(true);
  });

  it.each(kinds)('shows no "Tool Data:" block for a %s message', (kind) => {
    render(
      <Message
        {...baseProps}
        content={QUESTION_TEXT}
        tool_data={asToolData({ kind, question_id: 'q-1', state: 'pending' })}
      />,
    );

    expect(screen.queryByText('Tool Data:')).toBeNull();
    expect(screen.queryByText(/"question_id"/)).toBeNull();
  });

  it('handles tool_data delivered as a JSON string', () => {
    const { container } = render(
      <Message
        {...baseProps}
        content={QUESTION_TEXT}
        tool_data={JSON.stringify({ kind: 'agent_question', question_id: 'q-1', state: 'pending' })}
      />,
    );

    expect(container.textContent ?? '').toContain('1. Backend\n2. Frontend\n3. Docs');
    expect(container.querySelector('ol')).toBeNull();
    expect(screen.queryByText('Tool Data:')).toBeNull();
  });

  it('keeps markdown rendering and the "Tool Data:" block for any other tool_data', () => {
    const { container } = render(
      <Message
        {...baseProps}
        content={'Here is the plan:\n\n1. Alpha\n2. Beta'}
        tool_data={asToolData({ tool_calls: [{ id: 'call_1', function: { name: 'search_operations' } }] })}
      />,
    );

    expect(container.querySelector('ol')).not.toBeNull();
    expect(screen.getByText('Tool Data:')).toBeTruthy();
  });

  it('keeps markdown rendering for a message without tool_data', () => {
    const { container } = render(<Message {...baseProps} content={QUESTION_TEXT} tool_data={null} />);

    expect(container.querySelector('ol')).not.toBeNull();
    expect(screen.queryByText('Tool Data:')).toBeNull();
  });
});
