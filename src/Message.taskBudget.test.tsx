import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import type { MessageType, QuestionView } from './types';

/**
 * The task budget's own messages in a conversation.
 *
 * A notice (`tool_data.kind` `task_budget_notice`: approaching the ceiling,
 * a ceiling cut to the maximum, a ceiling changed) and a report
 * (`task_budget_report`: what was done when the task paused, halted or was
 * accepted) are plain text, shown exactly as written — like an agent's
 * question and its notices, never through markdown and never with the raw
 * "Tool Data" box every other tool-data message gets. The ceiling prompt's
 * own display message is an `agent_question` message carrying a
 * `task_budget` question view, and is shown as the question form.
 */

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
  createBaseQuery: () => async () => ({ data: [] }),
}));

const { messageApi } = await import('./messageApi');
const { default: Message } = await import('./Message');

const NOTICE =
  "Heads up — this task's budget is 80% used: 16 of 20 steps, 0.41 of 1.00 USD. It will pause for your decision at the ceiling. " +
  "You can raise it now with '/budget steps=40' or from the conversation's limits.";

const REPORT = [
  "This task's budget ceiling was reached: 20 of 20 steps used.",
  'Done so far: *store_note* x 20, list_applications x 20.',
  '1. Latest progress: the notes are stored.',
  'Anything the agent had not started yet is not recorded.',
].join('\n\n');

function message(content: string, toolData: unknown, extra: Partial<MessageType> = {}): MessageType {
  return {
    id: 'msg-tb',
    conversation_id: 'conv-1',
    role: 'assistant',
    user: 'Clarion',
    content,
    tool_data: toolData as string,
    updated_at: '2026-10-12T09:00:00.000000Z',
    streaming: false,
    responseTime: 0,
    ...extra,
  };
}

function renderMessage(m: MessageType) {
  const store = configureStore({
    reducer: { [messageApi.reducerPath]: messageApi.reducer },
    middleware: (getDefault) => getDefault().concat(messageApi.middleware),
  });
  return render(
    <Provider store={store}>
      <Message {...m} onDelete={() => {}} />
    </Provider>,
  );
}

function contentOf(container: HTMLElement): HTMLElement {
  const content = container.querySelector('.message-content');
  expect(content).not.toBeNull();
  return content as HTMLElement;
}

describe('Message — the task budget\'s own messages', () => {
  beforeEach(() => {
    cleanup();
  });

  it.each([
    ['an approach notice (object)', NOTICE, { kind: 'task_budget_notice', task_budget_id: 'tb-1', notice: 'approach' }],
    ['an approach notice (JSON string)', NOTICE, JSON.stringify({ kind: 'task_budget_notice', task_budget_id: 'tb-1', notice: 'approach' })],
    ['a report (object)', REPORT, { kind: 'task_budget_report', task_budget_id: 'tb-1', occasion: 'paused' }],
    ['a report (JSON string)', REPORT, JSON.stringify({ kind: 'task_budget_report', task_budget_id: 'tb-1', occasion: 'halted' })],
  ])('shows %s as plain text exactly as written, with no tool-data box', (_label, content, toolData) => {
    const { container } = renderMessage(message(content, toolData));

    const shown = contentOf(container);
    expect(shown.textContent).toBe(content);
    expect(shown.style.whiteSpace).toBe('pre-wrap');
    expect(shown.querySelector('em, ol, ul, strong, pre')).toBeNull();
    expect(screen.queryByText('Tool Data:')).toBeNull();
  });

  it('still shows the tool-data box for any other tool data', () => {
    renderMessage(message('Done.', { kind: 'tool_results', results: [] }));

    expect(screen.getByText('Tool Data:')).toBeInTheDocument();
  });

  it('shows the ceiling prompt\'s display message as the question form', () => {
    const view = {
      id: 'q-tb',
      question: "This task's budget ceiling was reached. What should happen next?",
      preamble: REPORT,
      choices: [
        { number: 1, text: 'Continue with more allowance (+20 steps)' },
        { number: 2, text: 'Accept what has been done' },
        { number: 3, text: 'Stop' },
      ],
      allow_multiple: false,
      state: 'pending',
      expires_at: '2026-10-13T09:00:00Z',
      answer: null,
      answerable: true,
      kind: 'task_budget',
      offered_allowance: { steps: 20, spend: null },
      reached: ['steps'],
      standing: { state: 'paused', sub_state: 'awaiting_decision', label: "This task's budget: 20 of 20 steps, 0.41 of 1.00 USD" },
    } as unknown as QuestionView;
    renderMessage(message(
      'the rendered prompt text',
      { kind: 'agent_question', question_id: 'q-tb', state: 'pending', origin: 'task_budget' },
      { question: view },
    ));

    expect(screen.getByRole('group', { name: "This task's budget ceiling was reached. What should happen next?" })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '3. Stop' })).toBeInTheDocument();
    expect(screen.queryByText('Tool Data:')).toBeNull();
  });
});
