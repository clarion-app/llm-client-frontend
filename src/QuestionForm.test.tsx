import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import type { QuestionView } from './types';

/**
 * The web form for a question an agent asked. It is built entirely from the
 * server-held question view: a pending question is answered by choosing
 * one option (radios) or several (checkboxes), or by answering with
 * something else in free text — never both at once — and a question that
 * is no longer pending is shown read-only with its outcome.
 *
 * Keyboard and assistive-technology operation is met by native controls
 * alone. jsdom performs no Tab traversal or implicit submission, so these
 * tests prove the structure that makes it work (native, labelled,
 * grouped controls, nothing removed from the tab order, no custom key
 * handling); operating it with a real keyboard and screen reader is a
 * manual check.
 */

type Responder = (args: any) => any;

let requests: any[] = [];
let respond: Responder = () => ({ data: { status: 'answered', question: null, message: null } });

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
    if (typeof args === 'string') {
      return { data: [] };
    }
    requests.push(args);
    return respond(args);
  },
}));

const { messageApi } = await import('./messageApi');
const { QuestionForm } = await import('./QuestionForm');

const QUESTION = 'Which part should I change first?';

function view(overrides: Partial<QuestionView> = {}): QuestionView {
  return {
    id: 'q-1',
    question: QUESTION,
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
    ...overrides,
  };
}

function renderForm(question: QuestionView) {
  const store = configureStore({
    reducer: { [messageApi.reducerPath]: messageApi.reducer },
    middleware: (getDefault) => getDefault().concat(messageApi.middleware),
  });
  return render(
    <Provider store={store}>
      <QuestionForm question={question} />
    </Provider>,
  );
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Submit answer' }));
}

function answerRequests() {
  return requests.filter((r) => r?.url === 'question/q-1/answer');
}

async function onlyRequestBody(): Promise<any> {
  await waitFor(() => expect(answerRequests()).toHaveLength(1));
  return answerRequests()[0].body;
}

describe('QuestionForm - a pending question', () => {
  beforeEach(() => {
    cleanup();
    requests = [];
    respond = () => ({ data: { status: 'answered', question: null, message: null } });
  });

  it('shows a single-select question as numbered radios in a group named by the question, with something else and submit', () => {
    renderForm(view({ preamble: 'I found three areas that need work.' }));

    expect(screen.getByText('I found three areas that need work.')).toBeInTheDocument();

    const group = screen.getByRole('group', { name: QUESTION });
    expect(group.tagName).toBe('FIELDSET');
    expect(group.querySelector('legend')).not.toBeNull();

    const radios = ['1. Backend', '2. Frontend', '3. Docs'].map((name) => screen.getByRole('radio', { name }));
    for (const radio of radios) {
      expect(group.contains(radio)).toBe(true);
    }
    expect(screen.getByRole('radio', { name: 'Answer with something else' })).toBeInTheDocument();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Submit answer' })).toHaveAttribute('type', 'submit');

    const form = screen.getByRole('button', { name: 'Submit answer' }).closest('form');
    expect(form).not.toBeNull();
    expect(form).toHaveAttribute('aria-labelledby');
  });

  it('lets at most one choice be selected on a single-select question', () => {
    renderForm(view());

    fireEvent.click(screen.getByRole('radio', { name: '1. Backend' }));
    fireEvent.click(screen.getByRole('radio', { name: '2. Frontend' }));

    expect(screen.getByRole('radio', { name: '1. Backend' })).not.toBeChecked();
    expect(screen.getByRole('radio', { name: '2. Frontend' })).toBeChecked();
  });

  it('submits the chosen option as a selection', async () => {
    renderForm(view());

    fireEvent.click(screen.getByRole('radio', { name: '2. Frontend' }));
    submit();

    expect(await onlyRequestBody()).toStrictEqual({ selected: [2] });
    expect(answerRequests()[0].method).toBe('POST');
  });

  it('shows a multi-select question as checkboxes and submits every chosen option', async () => {
    renderForm(view({ allow_multiple: true }));

    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    fireEvent.click(screen.getByRole('checkbox', { name: '1. Backend' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '3. Docs' }));
    submit();

    expect(await onlyRequestBody()).toStrictEqual({ selected: [1, 3] });
  });

  it('shows a question without choices as a single answer field', async () => {
    renderForm(view({ choices: [], question: 'What time works for you?' }));

    expect(screen.queryAllByRole('radio')).toHaveLength(0);
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    const field = screen.getByRole('textbox', { name: 'Your answer' });
    expect(field.tagName).toBe('TEXTAREA');

    fireEvent.change(field, { target: { value: 'Tuesday at ten' } });
    submit();

    expect(await onlyRequestBody()).toStrictEqual({ text: 'Tuesday at ten' });
  });

  it('submission_is_selection_or_text_never_both', async () => {
    renderForm(view());

    // A choice, then something else with text: only the text is sent.
    fireEvent.click(screen.getByRole('radio', { name: '2. Frontend' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Answer with something else' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'none of these — use a fourth approach' } });
    submit();

    expect(await onlyRequestBody()).toStrictEqual({ text: 'none of these — use a fourth approach' });

    // Something else with text, then back to a choice: only the choice is sent.
    cleanup();
    requests = [];
    renderForm(view());
    fireEvent.click(screen.getByRole('radio', { name: 'Answer with something else' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'my own idea' } });
    fireEvent.click(screen.getByRole('radio', { name: '3. Docs' }));
    submit();

    expect(await onlyRequestBody()).toStrictEqual({ selected: [3] });
  });

  it('clears and disables the choices when something else is chosen on a multi-select question', async () => {
    renderForm(view({ allow_multiple: true }));

    fireEvent.click(screen.getByRole('checkbox', { name: '1. Backend' }));
    expect(screen.getByRole('checkbox', { name: '1. Backend' })).toBeChecked();

    fireEvent.click(screen.getByRole('checkbox', { name: 'Answer with something else' }));

    for (const name of ['1. Backend', '2. Frontend', '3. Docs']) {
      expect(screen.getByRole('checkbox', { name })).not.toBeChecked();
      expect(screen.getByRole('checkbox', { name })).toBeDisabled();
    }
    const field = screen.getByRole('textbox');
    expect(field).toBeEnabled();

    fireEvent.change(field, { target: { value: 'all of them, but later' } });
    submit();

    expect(await onlyRequestBody()).toStrictEqual({ text: 'all of them, but later' });
  });

  it('sends nothing for an empty submission and says an answer is needed', async () => {
    renderForm(view());

    submit();

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Choose an option or type an answer.'));
    expect(answerRequests()).toHaveLength(0);
  });

  it('sends nothing for whitespace-only text', async () => {
    renderForm(view());

    fireEvent.click(screen.getByRole('radio', { name: 'Answer with something else' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '   \n  ' } });
    submit();

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Choose an option or type an answer.'));
    expect(answerRequests()).toHaveLength(0);
  });

  it('disables the controls while the answer is being sent', async () => {
    let release: (value: any) => void = () => {};
    respond = () => new Promise((resolve) => { release = resolve; });
    renderForm(view());

    fireEvent.click(screen.getByRole('radio', { name: '2. Frontend' }));
    submit();

    await waitFor(() => expect(screen.getByRole('button', { name: 'Submit answer' })).toBeDisabled());
    for (const name of ['1. Backend', '2. Frontend', '3. Docs', 'Answer with something else']) {
      expect(screen.getByRole('radio', { name })).toBeDisabled();
    }

    release({ data: { status: 'answered', question: null, message: null } });
    await waitFor(() => expect(answerRequests()).toHaveLength(1));
  });

  it('reports a question that is no longer pending', async () => {
    respond = () => ({ error: { status: 409, data: { code: 'question_not_pending', state: 'answered', question: view({ state: 'answered' }) } } });
    renderForm(view());

    fireEvent.click(screen.getByRole('radio', { name: '2. Frontend' }));
    submit();

    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('This question was already answered.'));
  });

  it('reports an expired or withdrawn question by its state', async () => {
    respond = () => ({ error: { status: 409, data: { code: 'question_not_pending', state: 'expired', question: view({ state: 'expired' }) } } });
    renderForm(view());
    fireEvent.click(screen.getByRole('radio', { name: '2. Frontend' }));
    submit();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/expired/i));

    cleanup();
    respond = () => ({ error: { status: 409, data: { code: 'question_not_pending', state: 'withdrawn', question: view({ state: 'withdrawn' }) } } });
    renderForm(view());
    fireEvent.click(screen.getByRole('radio', { name: '2. Frontend' }));
    submit();
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent(/withdrawn/i));
  });

  it('shows the message of a refused answer', async () => {
    respond = () => ({ error: { status: 422, data: { code: 'invalid_answer', message: 'Choice 4 is not one of the options.' } } });
    renderForm(view());

    fireEvent.click(screen.getByRole('radio', { name: '2. Frontend' }));
    submit();

    expect(await screen.findByText('Choice 4 is not one of the options.')).toBeInTheDocument();
  });

  it('keeps the form filled and says to try again when the answer could not be sent', async () => {
    respond = () => ({ error: { status: 'FETCH_ERROR', error: 'TypeError: Failed to fetch' } });
    renderForm(view());

    fireEvent.click(screen.getByRole('radio', { name: '2. Frontend' }));
    submit();

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent("Couldn't send your answer — try again."));
    expect(screen.getByRole('radio', { name: '2. Frontend' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Submit answer' })).toBeEnabled();
  });

  it('treats a server error like a lost connection', async () => {
    respond = () => ({ error: { status: 500, data: { message: 'Server Error' } } });
    renderForm(view());

    fireEvent.click(screen.getByRole('radio', { name: 'Answer with something else' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'my own idea' } });
    submit();

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent("Couldn't send your answer — try again."));
    expect(screen.getByRole('textbox')).toHaveValue('my own idea');
  });

  it('is operable with native controls only', () => {
    const { container } = renderForm(view({ allow_multiple: true }));

    expect(container.querySelectorAll('[tabindex="-1"]')).toHaveLength(0);
    for (const element of Array.from(container.querySelectorAll('input, textarea, button'))) {
      expect(element.getAttribute('tabindex')).not.toBe('-1');
    }

    // Enter in the answer field adds a line; it never sends the answer.
    fireEvent.click(screen.getByRole('checkbox', { name: 'Answer with something else' }));
    const field = screen.getByRole('textbox');
    fireEvent.change(field, { target: { value: 'first line' } });
    fireEvent.keyDown(field, { key: 'Enter', code: 'Enter' });
    expect(answerRequests()).toHaveLength(0);
  });
});

describe('QuestionForm - a question that is no longer pending', () => {
  beforeEach(() => {
    cleanup();
    requests = [];
  });

  function assertReadOnly(container: HTMLElement) {
    expect(screen.queryByRole('button', { name: 'Submit answer' })).toBeNull();
    for (const control of Array.from(container.querySelectorAll('input, textarea'))) {
      expect(control).toBeDisabled();
    }
    // The question and its full numbered choices are still shown.
    expect(container.textContent).toContain(QUESTION);
    for (const choice of ['1. Backend', '2. Frontend', '3. Docs']) {
      expect(container.textContent).toContain(choice);
    }
  }

  it('shows a choice answered from the web form', () => {
    const { container } = renderForm(view({
      state: 'answered',
      answer: { is_selection: true, selected: [{ number: 2, text: 'Frontend' }], raw_reply: '2', method: 'web_form' },
    }));

    assertReadOnly(container);
    expect(container.textContent).toContain('Answered: 2. Frontend');
    expect(container.textContent).toContain('(from the web form)');
  });

  it('shows several choices answered from Telegram', () => {
    const { container } = renderForm(view({
      state: 'answered',
      allow_multiple: true,
      answer: {
        is_selection: true,
        selected: [{ number: 1, text: 'Backend' }, { number: 3, text: 'Docs' }],
        raw_reply: '1, 3',
        method: 'messaging_option',
      },
    }));

    assertReadOnly(container);
    expect(container.textContent).toContain('Answered: 1. Backend, 3. Docs');
    expect(container.textContent).toContain('(from Telegram)');
  });

  it('shows a typed answer in the user\'s own words', () => {
    const { container } = renderForm(view({
      state: 'answered',
      answer: { is_selection: false, selected: [], raw_reply: 'none of these — use a fourth approach', method: 'typed_reply' },
    }));

    assertReadOnly(container);
    expect(container.textContent).toContain('Answered: none of these — use a fourth approach');
    expect(container.textContent).toContain('(typed reply)');
  });

  it.each([
    ['expired', 'Expired — no longer awaiting a reply.'],
    ['withdrawn', 'Withdrawn.'],
    ['undeliverable', 'Could not be delivered.'],
  ] as const)('shows a %s question as such', (state, text) => {
    const { container } = renderForm(view({ state }));

    assertReadOnly(container);
    expect(container.textContent).toContain(text);
    expect(container.textContent).not.toContain('Answered:');
  });
});
