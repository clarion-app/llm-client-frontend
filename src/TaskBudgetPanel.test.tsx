import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup, act, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

/**
 * The conversation's task budget, shown beside the conversation.
 *
 * `<TaskBudgetPanel conversationId processing? />` reads the standing of
 * the conversation's current task through `getTaskBudget` and shows:
 * - a steps bar and a spend bar (role `progressbar`, named "Steps" and
 *   "Spend"), each with "used of ceiling" figures (spend at two places with
 *   its currency) and where the ceiling came from — "default", "set by you"
 *   or "reduced to the installation maximum";
 * - "approximate" when some cost is estimated, and "incomplete (N requests
 *   had no price)" when some requests could not be priced;
 * - the task's state (data-testid `task-budget-state`): Running / Paused at
 *   budget ceiling — awaiting your decision / Stopped at budget ceiling /
 *   Concluded at budget ceiling / Completed / Ended;
 * - the server's own standing sentence (`label`), verbatim;
 * - while the task is running or paused, "Change limits": a form with
 *   "Step ceiling" and "Spend ceiling" filled with the current ceilings,
 *   whose "Save limits" sends `updateTaskBudget` with only the ceilings that
 *   were changed and then says when one was cut to the installation maximum.
 *
 * It renders nothing when the conversation has no task. It reads the
 * standing again every 5 seconds while the conversation is processing or
 * the task is paused, and not otherwise.
 */

const CONVERSATION_ID = 'conv-1';
const URL = `/conversation/${CONVERSATION_ID}/task-budget`;

type Standing = Record<string, any>;

let serverStanding: Standing | { task_budget: null } = { task_budget: null };
let patchResult: (body: any) => { data?: any; error?: any } = () => ({ data: {} });
let requests: Array<{ url: string; method: string; body?: any }> = [];

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
    const url = typeof args === 'string' ? args : args?.url;
    const method = typeof args === 'string' ? 'GET' : (args?.method ?? 'GET');
    requests.push({ url, method, body: args?.body });
    if (method === 'PATCH') {
      return patchResult(args.body);
    }
    if (url === URL) {
      return { data: serverStanding };
    }
    return { data: [] };
  },
}));

const { conversationApi } = await import('./conversationApi');
const { TaskBudgetPanel } = await import('./TaskBudgetPanel');

function standing(overrides: Standing = {}): Standing {
  return {
    task_budget_id: 'tb-1',
    conversation_id: CONVERSATION_ID,
    state: 'running',
    sub_state: null,
    steps: { used: 16, ceiling: 20, origin: 'default', maximum: 200, approach_noticed: true },
    spend: {
      used: '0.4120000000',
      ceiling: '1.0000000000',
      currency: 'USD',
      origin: 'default',
      maximum: '25.0000000000',
      approximate: false,
      incomplete: false,
      unpriced_request_count: 0,
      approach_noticed: false,
    },
    approach_threshold: '0.8000',
    reached: [],
    prompt_question_id: null,
    label: "This task's budget: 16 of 20 steps, 0.41 of 1.00 USD",
    ...overrides,
  };
}

function renderPanel(props: { processing?: boolean } = {}) {
  const store = configureStore({
    reducer: { [conversationApi.reducerPath]: conversationApi.reducer },
    middleware: (getDefault) => getDefault().concat(conversationApi.middleware),
  });
  return render(
    <Provider store={store}>
      <TaskBudgetPanel conversationId={CONVERSATION_ID} {...props} />
    </Provider>,
  );
}

function standingReads(): number {
  return requests.filter((r) => r.url === URL && r.method === 'GET').length;
}

describe('TaskBudgetPanel — what it shows', () => {
  beforeEach(() => {
    cleanup();
    requests = [];
    serverStanding = standing();
    patchResult = () => ({ data: {} });
  });

  it('shows steps and spend against their ceilings, where each ceiling came from, and the server\'s own sentence', async () => {
    serverStanding = standing({
      steps: { used: 16, ceiling: 20, origin: 'user', maximum: 200, approach_noticed: true },
      spend: { ...standing().spend, origin: 'user_reduced_to_maximum' },
    });
    renderPanel();

    expect(await screen.findByText("This task's budget: 16 of 20 steps, 0.41 of 1.00 USD")).toBeInTheDocument();
    const steps = screen.getByRole('progressbar', { name: 'Steps' });
    expect(steps).toHaveAttribute('aria-valuenow', '16');
    expect(steps).toHaveAttribute('aria-valuemax', '20');
    expect(screen.getByRole('progressbar', { name: 'Spend' })).toBeInTheDocument();

    const stepsRow = screen.getByTestId('task-budget-steps');
    expect(stepsRow).toHaveTextContent('16 of 20 steps');
    expect(stepsRow).toHaveTextContent('set by you');
    const spendRow = screen.getByTestId('task-budget-spend');
    expect(spendRow).toHaveTextContent('0.41 of 1.00 USD');
    expect(spendRow).toHaveTextContent('reduced to the installation maximum');
    expect(spendRow).not.toHaveTextContent('approximate');
    expect(spendRow).not.toHaveTextContent('incomplete');
  });

  it('says where a default ceiling came from', async () => {
    renderPanel();

    expect(await screen.findByTestId('task-budget-steps')).toHaveTextContent('default');
    expect(screen.getByTestId('task-budget-spend')).toHaveTextContent('default');
  });

  it.each([
    [2, 'incomplete (2 requests had no price)'],
    [1, 'incomplete (1 request had no price)'],
  ])('marks spend approximate and incomplete (%i unpriced)', async (unpriced, text) => {
    serverStanding = standing({
      spend: { ...standing().spend, approximate: true, incomplete: true, unpriced_request_count: unpriced },
    });
    renderPanel();

    const spendRow = await screen.findByTestId('task-budget-spend');
    expect(spendRow).toHaveTextContent('approximate');
    expect(spendRow).toHaveTextContent(text);
  });

  it.each([
    ['running', null, 'Running'],
    ['paused', 'awaiting_decision', 'Paused at budget ceiling — awaiting your decision'],
    ['paused', 'stopped', 'Stopped at budget ceiling'],
    ['concluded', null, 'Concluded at budget ceiling'],
    ['completed', null, 'Completed'],
    ['halted', null, 'Stopped at budget ceiling'],
    ['ended', null, 'Ended'],
  ])('labels a %s task (%s) "%s"', async (state, subState, label) => {
    serverStanding = standing({ state, sub_state: subState });
    renderPanel();

    expect(await screen.findByTestId('task-budget-state')).toHaveTextContent(label);
  });

  it('renders nothing when the conversation has no task', async () => {
    serverStanding = { task_budget: null };
    const { container } = renderPanel();

    await waitFor(() => expect(standingReads()).toBeGreaterThanOrEqual(1));
    await act(async () => {});
    expect(container).toBeEmptyDOMElement();
  });

  it.each(['concluded', 'completed', 'halted', 'ended'])('offers no change to a %s task', async (state) => {
    serverStanding = standing({ state });
    renderPanel();

    await screen.findByTestId('task-budget-state');
    expect(screen.queryByRole('button', { name: 'Change limits' })).toBeNull();
  });
});

describe('TaskBudgetPanel — changing the limits', () => {
  beforeEach(() => {
    cleanup();
    requests = [];
    serverStanding = standing();
    patchResult = () => ({ data: { ...standing(), reduced: { steps: false, spend: false } } });
  });

  function patches() {
    return requests.filter((r) => r.method === 'PATCH');
  }

  async function openForm() {
    fireEvent.click(await screen.findByRole('button', { name: 'Change limits' }));
    return { steps: screen.getByLabelText('Step ceiling'), spend: screen.getByLabelText('Spend ceiling') };
  }

  it('fills the form with the current ceilings', async () => {
    renderPanel();
    const { steps, spend } = await openForm();

    expect(steps).toHaveValue(20);
    expect(spend).toHaveValue('1.00');
  });

  it('sends only the ceiling that was changed', async () => {
    renderPanel();
    const { steps } = await openForm();
    fireEvent.change(steps, { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save limits' }));

    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0]).toEqual({ url: URL, method: 'PATCH', body: { max_steps: 30 } });
  });

  it('sends a changed spend ceiling as a decimal string', async () => {
    renderPanel();
    const { spend } = await openForm();
    fireEvent.change(spend, { target: { value: '2.50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save limits' }));

    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0].body).toEqual({ max_spend: '2.50' });
  });

  it('says when a ceiling was cut to the installation maximum', async () => {
    patchResult = () => ({
      data: { ...standing({ steps: { used: 16, ceiling: 200, origin: 'user_reduced_to_maximum', maximum: 200, approach_noticed: false } }), reduced: { steps: true, spend: false } },
    });
    renderPanel();
    const { steps } = await openForm();
    fireEvent.change(steps, { target: { value: '1000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save limits' }));

    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(/reduced to the installation maximum/);
    expect(status).toHaveTextContent('200');
  });

  it('shows the server\'s reason when a change is refused', async () => {
    patchResult = () => ({ error: { status: 409, data: { code: 'no_active_task', message: "There is no task in progress under this task's budget." } } });
    renderPanel();
    const { steps } = await openForm();
    fireEvent.change(steps, { target: { value: '30' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save limits' }));

    expect(await screen.findByRole('alert')).toHaveTextContent("There is no task in progress under this task's budget.");
  });

  it('can change the limits of a paused task too', async () => {
    serverStanding = standing({ state: 'paused', sub_state: 'awaiting_decision', reached: ['steps'] });
    renderPanel();
    const { steps } = await openForm();
    fireEvent.change(steps, { target: { value: '40' } });
    fireEvent.click(within(screen.getByTestId('task-budget-panel')).getByRole('button', { name: 'Save limits' }));

    await waitFor(() => expect(patches()).toHaveLength(1));
    expect(patches()[0].body).toEqual({ max_steps: 40 });
  });
});

// Captured before any test fakes the clock.
const realSetTimeout = globalThis.setTimeout;

describe('TaskBudgetPanel — keeping up to date', () => {
  beforeEach(() => {
    cleanup();
    requests = [];
    serverStanding = standing();
    vi.useFakeTimers();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  /** Lets $ms of fake time pass, then lets anything React scheduled on the real clock run. */
  async function settle(ms = 0, realMs = 0) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
    await act(async () => {
      await new Promise((resolve) => realSetTimeout(resolve, realMs));
    });
  }

  /** Lets the first read land and the panel show it (at most half a second of fake time). */
  async function firstRead() {
    for (let i = 0; i < 100 && !screen.queryByTestId('task-budget-state'); i++) {
      await settle(5, 20);
    }
    expect(screen.getByTestId('task-budget-state')).toBeInTheDocument();
    expect(standingReads()).toBe(1);
  }

  /** Lets $ms pass in small steps, so work the screen schedules between them runs on time. */
  async function wait(ms: number) {
    for (let passed = 0; passed < ms; passed += 100) {
      await settle(100);
    }
  }

  it('reads the standing again every 5 seconds while the conversation is processing', async () => {
    renderPanel({ processing: true });
    await firstRead();

    await wait(5300);
    expect(standingReads()).toBe(2);
    await wait(5000);
    expect(standingReads()).toBe(3);
  });

  it('reads the standing again every 5 seconds while the task is paused', async () => {
    serverStanding = standing({ state: 'paused', sub_state: 'stopped' });
    renderPanel({ processing: false });
    await firstRead();

    await wait(5300);
    expect(standingReads()).toBe(2);
    await wait(5000);
    expect(standingReads()).toBe(3);
  });

  it('does not poll a running task while the conversation is idle', async () => {
    renderPanel({ processing: false });
    await firstRead();

    await wait(15000);
    expect(standingReads()).toBe(1);
  });
});
