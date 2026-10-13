import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import type { QuestionView } from './types';

/**
 * The prompt raised when a task reaches its budget ceiling, answered on the
 * web.
 *
 * A question view whose `kind` is `task_budget` offers exactly its three
 * decisions as radios — continue with more allowance, accept what has been
 * done, stop — with no "something else" free-text answer, and shows the
 * task's standing (the server's `standing.label`). Choosing continue shows
 * "Additional steps" (a number input) and "Additional spend" (a decimal text
 * input); each is pre-filled with the offered allowance of a ceiling that
 * was reached, and left empty otherwise. Sent unchanged, continue is the
 * selection `[1]`; once an allowance is edited it is sent as the reply text
 * `continue steps=N spend=X`, naming only the allowances that are filled
 * in. Accept and stop are `[2]` and `[3]`. A refusal (422) shows the
 * server's guidance. A prompt stopped at its deadline or by the user still
 * takes a decision. An agent's own question is shown exactly as before.
 */

let requests: any[] = [];
let respond: (args: any) => any = () => ({ data: { status: 'answered', question: null, message: null } });

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

const PROMPT = "This task's budget ceiling was reached. What should happen next?";
const LABEL = "This task's budget: 20 of 20 steps, 0.41 of 1.00 USD";

function standing(overrides: Record<string, any> = {}): Record<string, any> {
  return {
    task_budget_id: 'tb-1',
    conversation_id: 'conv-1',
    state: 'paused',
    sub_state: 'awaiting_decision',
    steps: { used: 20, ceiling: 20, origin: 'default', maximum: 200, approach_noticed: true },
    spend: {
      used: '0.4120000000', ceiling: '1.0000000000', currency: 'USD', origin: 'default', maximum: '25.0000000000',
      approximate: false, incomplete: false, unpriced_request_count: 0, approach_noticed: false,
    },
    approach_threshold: '0.8000',
    reached: ['steps'],
    prompt_question_id: 'q-tb',
    label: LABEL,
    ...overrides,
  };
}

function budgetView(overrides: Record<string, any> = {}): QuestionView {
  return {
    id: 'q-tb',
    question: PROMPT,
    preamble: "This task's budget ceiling was reached: 20 of 20 steps used.",
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
    standing: standing(),
    ...overrides,
  } as unknown as QuestionView;
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

function answerBodies(id = 'q-tb'): any[] {
  return requests.filter((r) => r?.url === `question/${id}/answer`).map((r) => r.body);
}

async function onlyBody(): Promise<any> {
  await waitFor(() => expect(answerBodies()).toHaveLength(1));
  return answerBodies()[0];
}

function choose(name: string) {
  fireEvent.click(screen.getByRole('radio', { name }));
}

function submit() {
  fireEvent.click(screen.getByRole('button', { name: 'Submit answer' }));
}

const CONTINUE = '1. Continue with more allowance (+20 steps)';

describe('QuestionForm — the task budget prompt', () => {
  beforeEach(() => {
    cleanup();
    requests = [];
    respond = () => ({ data: { status: 'answered', question: null, message: null } });
  });

  it('offers exactly the three decisions and shows the task\'s standing', () => {
    renderForm(budgetView());

    expect(screen.getByRole('group', { name: PROMPT })).toBeInTheDocument();
    expect(screen.getAllByRole('radio')).toEqual([
      screen.getByRole('radio', { name: CONTINUE }),
      screen.getByRole('radio', { name: '2. Accept what has been done' }),
      screen.getByRole('radio', { name: '3. Stop' }),
    ]);
    expect(screen.queryByText('Answer with something else')).toBeNull();
    expect(screen.queryByLabelText('Your answer')).toBeNull();
    expect(screen.getByText(LABEL)).toBeInTheDocument();
  });

  it('shows the allowance inputs only for continue, pre-filled for the reached ceiling', () => {
    renderForm(budgetView());
    expect(screen.queryByLabelText(/Additional steps/)).toBeNull();
    expect(screen.queryByLabelText(/Additional spend/)).toBeNull();

    choose(CONTINUE);

    const steps = screen.getByLabelText(/Additional steps/);
    const spend = screen.getByLabelText(/Additional spend/);
    expect(steps).toHaveAttribute('type', 'number');
    expect(steps).toHaveValue(20);
    expect(spend).toHaveAttribute('inputmode', 'decimal');
    expect(spend).toHaveValue('');

    choose('2. Accept what has been done');
    expect(screen.queryByLabelText(/Additional steps/)).toBeNull();
  });

  it('pre-fills both allowances when both ceilings were reached', () => {
    renderForm(budgetView({
      choices: [
        { number: 1, text: 'Continue with more allowance (+20 steps, +1.00 USD)' },
        { number: 2, text: 'Accept what has been done' },
        { number: 3, text: 'Stop' },
      ],
      offered_allowance: { steps: 20, spend: '1.0000000000' },
      reached: ['steps', 'spend'],
    }));

    choose('1. Continue with more allowance (+20 steps, +1.00 USD)');

    expect(screen.getByLabelText(/Additional steps/)).toHaveValue(20);
    expect(screen.getByLabelText(/Additional spend/)).toHaveValue('1.00');
  });

  it('pre-fills only the spend allowance when only spend was reached', () => {
    renderForm(budgetView({
      choices: [
        { number: 1, text: 'Continue with more allowance (+1.00 USD)' },
        { number: 2, text: 'Accept what has been done' },
        { number: 3, text: 'Stop' },
      ],
      offered_allowance: { steps: null, spend: '1.0000000000' },
      reached: ['spend'],
    }));

    choose('1. Continue with more allowance (+1.00 USD)');

    expect(screen.getByLabelText(/Additional steps/)).toHaveValue(null);
    expect(screen.getByLabelText(/Additional spend/)).toHaveValue('1.00');
  });

  it('sends continue unchanged as the selection [1]', async () => {
    renderForm(budgetView());
    choose(CONTINUE);
    submit();

    expect(await onlyBody()).toStrictEqual({ selected: [1] });
  });

  it('sends an edited allowance as the reply text', async () => {
    renderForm(budgetView());
    choose(CONTINUE);
    fireEvent.change(screen.getByLabelText(/Additional steps/), { target: { value: '5' } });
    submit();

    expect(await onlyBody()).toStrictEqual({ text: 'continue steps=5' });
  });

  it('names every filled-in allowance in the reply text', async () => {
    renderForm(budgetView({ offered_allowance: { steps: 20, spend: '1.0000000000' }, reached: ['steps', 'spend'] }));
    choose(CONTINUE);
    fireEvent.change(screen.getByLabelText(/Additional spend/), { target: { value: '0.50' } });
    submit();

    expect(await onlyBody()).toStrictEqual({ text: 'continue steps=20 spend=0.50' });
  });

  it.each([
    ['2. Accept what has been done', [2]],
    ['3. Stop', [3]],
  ])('sends %s as its selection', async (name, selected) => {
    renderForm(budgetView());
    choose(name);
    submit();

    expect(await onlyBody()).toStrictEqual({ selected });
  });

  it('shows the server\'s guidance when the decision is refused', async () => {
    const guidance = "That was not a decision on this task's budget: no more allowance is available, because this task is at the installation maximum.";
    respond = () => ({ error: { status: 422, data: { code: 'invalid_answer', message: guidance } } });
    renderForm(budgetView());
    choose(CONTINUE);
    submit();

    expect(await screen.findByRole('alert')).toHaveTextContent(guidance);
  });

  it('still takes a decision once the prompt has stopped', async () => {
    const outcome = "Already stopped at this task's budget ceiling. Reply 'continue' to resume with more allowance or 'accept' to close the task with what has been done.";
    renderForm(budgetView({ state: 'stopped', answerable: true, outcome_text: outcome, standing: standing({ sub_state: 'stopped' }) }));

    expect(screen.getByRole('status')).toHaveTextContent(outcome);
    choose(CONTINUE);
    submit();

    expect(await onlyBody()).toStrictEqual({ selected: [1] });
  });

  it('shows a decided prompt read-only with its outcome', () => {
    renderForm(budgetView({
      state: 'answered',
      answerable: false,
      outcome_text: "Continued under this task's budget with more allowance.",
      answer: { is_selection: true, selected: [{ number: 1, text: 'Continue with more allowance (+20 steps)' }], raw_reply: 'continue steps=20', method: 'web_form' },
    }));

    expect(screen.getByText("Continued under this task's budget with more allowance.")).toBeInTheDocument();
    expect(screen.queryByRole('radio')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Submit answer' })).toBeNull();
  });
});

describe('QuestionForm — an agent\'s own question is unchanged', () => {
  beforeEach(() => {
    cleanup();
    requests = [];
  });

  it.each([
    ['kind agent', { kind: 'agent' }],
    ['no kind', {}],
  ])('still offers something else and a free answer (%s)', (_label, extra) => {
    renderForm({
      id: 'q-1',
      question: 'Which part should I change first?',
      preamble: null,
      choices: [{ number: 1, text: 'Backend' }, { number: 2, text: 'Frontend' }],
      allow_multiple: false,
      state: 'pending',
      expires_at: '2026-10-12T09:00:00Z',
      answer: null,
      ...extra,
    } as unknown as QuestionView);

    expect(screen.getByRole('radio', { name: 'Answer with something else' })).toBeInTheDocument();
    expect(screen.getByLabelText('Your answer')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: '1. Backend' }));
    expect(screen.queryByLabelText(/Additional steps/)).toBeNull();
  });
});
