import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import { runApi } from './runApi';
import { delegationApi } from './delegationApi';
import { conversationApi } from './conversationApi';
import type { RunSummary, StepSummary } from './types';

/**
 * A run's task budget, in the run diagram.
 *
 * The run summary's `task_budget` shows a badge in the diagram's header,
 * data-testid="run-task-budget-badge": "Paused at budget ceiling" for a task
 * paused awaiting its decision, "Stopped at budget ceiling" for one paused
 * and stopped or halted, "Concluded at budget ceiling" for one concluded;
 * none for any other state, nor when the run has no task budget. The badge
 * takes the place of the generic "Waiting for you" / "Stopped — waiting for
 * your answer" badges, which the budget prompt would otherwise also raise.
 *
 * A run with a task budget has a collapsible "Task budget" section
 * (data-testid="run-task-budget-section", a button named "Task budget"
 * toggling it), collapsed at first: only once expanded does it read the
 * run's task budget record through
 * `getRunTaskBudget` and lists the standing sentence and each event, oldest
 * first, by its kind (Opened, Ceiling changed, Approach notice, Ceiling
 * reached, Prompt raised, Decision, Prompt stopped, Prompt withdrawn,
 * Allowance granted, Report, Halted, Ended). A run with no task budget has
 * no section and never reads a record.
 */

vi.mock('./config', () => ({
  backend: {
    url: 'http://localhost:8000',
    token: 'test-token',
    user: { id: 'user-1', name: 'Test User', email: 'test@test.com' },
  },
  updateFrontend: () => {},
}));

let mockRun: RunSummary;
let mockSteps: StepSummary[] = [];
let recordReads: string[] = [];
let mockRecord: any = null;

function paginate<T>(items: T[]) {
  return { data: items, meta: { current_page: 1, per_page: 100, total: items.length, last_page: 1 } };
}

vi.mock('@clarion-app/frontend-base', () => ({
  createBackendConfig: () => ({
    backend: { url: 'http://localhost:8000', user: { id: 'user-1', name: '', email: '' } },
    updateFrontend: () => {},
  }),
  createBaseQuery: () => async (args: any) => {
    const url = typeof args === 'string' ? args : (args?.url ?? '');
    const path = String(url).split('?')[0];

    const record = path.match(/^\/agent-runs\/([^/]+)\/task-budget$/);
    if (record) {
      recordReads.push(record[1]);
      return { data: mockRecord };
    }
    if (/^\/agent-runs\/[^/]+\/steps\/[^/]+\/actions$/.test(path)) {
      return { data: paginate([]) };
    }
    if (/^\/agent-runs\/[^/]+\/delegations$/.test(path)) {
      return { data: [] };
    }
    if (/^\/agent-runs\/[^/]+\/steps$/.test(path)) {
      return { data: paginate(mockSteps) };
    }
    if (/^\/agent-runs\/[^/]+$/.test(path)) {
      return { data: mockRun };
    }
    return { data: {} };
  },
  registerUserChannelHandler: () => {},
}));

const { RunDiagram } = await import('./RunDiagram');

function renderDiagram(runId = 'run-1') {
  const store = configureStore({
    reducer: {
      [runApi.reducerPath]: runApi.reducer,
      [delegationApi.reducerPath]: delegationApi.reducer,
      [conversationApi.reducerPath]: conversationApi.reducer,
    },
    middleware: (getDefault) => getDefault().concat(runApi.middleware, delegationApi.middleware, conversationApi.middleware),
  });
  return render(
    <MemoryRouter>
      <Provider store={store}>
        <RunDiagram runId={runId} />
      </Provider>
    </MemoryRouter>,
  );
}

function budget(state: string, subState: string | null = null) {
  return {
    state,
    sub_state: subState,
    steps_used: 20,
    max_steps: 20,
    spend_used: '0.4120000000',
    max_spend: '1.0000000000',
    currency: 'USD',
    approximate: false,
    incomplete: false,
  };
}

function makeRun(overrides: Record<string, any> = {}): RunSummary {
  return {
    id: 'run-1',
    kind: 'interactive',
    end_state: 'in_progress',
    end_reason: null,
    started_at: '2026-10-12T09:00:00.000000Z',
    ended_at: null,
    duration_ms: null,
    step_count: 0,
    action_count: 0,
    conversation_id: 'conv-1',
    ...overrides,
  } as RunSummary;
}

const LABEL = "This task's budget: 20 of 20 steps, 0.41 of 1.00 USD";

function event(kind: string, at: string) {
  return { id: `ev-${kind}`, kind, payload: {}, actor_user_id: null, created_at: at };
}

describe('RunDiagram — the run\'s task budget badge', () => {
  beforeEach(() => {
    cleanup();
    mockSteps = [];
    recordReads = [];
    mockRecord = { standing: null, events: [] };
  });

  it.each([
    ['paused awaiting a decision', 'Paused at budget ceiling', budget('paused', 'awaiting_decision')],
    ['paused and stopped', 'Stopped at budget ceiling', budget('paused', 'stopped')],
    ['halted', 'Stopped at budget ceiling', budget('halted')],
    ['concluded', 'Concluded at budget ceiling', budget('concluded', null)],
  ])('a run whose task is %s shows "%s"', async (_label, text, taskBudget) => {
    mockRun = makeRun({ task_budget: taskBudget });
    renderDiagram();

    expect(await screen.findByTestId('run-task-budget-badge')).toHaveTextContent(text);
  });

  it.each([
    ['running', budget('running')],
    ['completed', budget('completed')],
    ['ended', budget('ended')],
    ['absent', null],
  ])('a run whose task is %s shows no budget badge', async (_label, taskBudget) => {
    mockRun = makeRun({ task_budget: taskBudget, end_state: 'completed' });
    renderDiagram();

    await screen.findByTestId('run-status-badge');
    expect(screen.queryByTestId('run-task-budget-badge')).toBeNull();
  });

  it('the budget badge takes the place of the generic waiting badge', async () => {
    mockRun = makeRun({ task_budget: budget('paused', 'awaiting_decision'), awaiting_user: true, question_stopped: false });
    renderDiagram();

    await screen.findByTestId('run-task-budget-badge');
    expect(screen.queryByTestId('run-awaiting-user-badge')).toBeNull();
    expect(screen.queryByTestId('run-question-stopped-badge')).toBeNull();
  });

  it('the budget badge takes the place of the generic stopped badge', async () => {
    mockRun = makeRun({ task_budget: budget('paused', 'stopped'), awaiting_user: true, question_stopped: true });
    renderDiagram();

    expect(await screen.findByTestId('run-task-budget-badge')).toHaveTextContent('Stopped at budget ceiling');
    expect(screen.queryByTestId('run-question-stopped-badge')).toBeNull();
    expect(screen.queryByTestId('run-awaiting-user-badge')).toBeNull();
  });

  it('an agent question still shows the generic badge on a run with a running task', async () => {
    mockRun = makeRun({ task_budget: budget('running'), awaiting_user: true, question_stopped: false });
    renderDiagram();

    expect(await screen.findByTestId('run-awaiting-user-badge')).toHaveTextContent('Waiting for you');
    expect(screen.queryByTestId('run-task-budget-badge')).toBeNull();
  });
});

describe('RunDiagram — the task budget section', () => {
  beforeEach(() => {
    cleanup();
    mockSteps = [];
    recordReads = [];
    mockRecord = {
      standing: { state: 'paused', sub_state: 'stopped', label: LABEL },
      events: [
        event('opened', '2026-10-12T09:00:00.000000Z'),
        event('ceiling_changed', '2026-10-12T09:01:00.000000Z'),
        event('approach_notice', '2026-10-12T09:02:00.000000Z'),
        event('ceiling_reached', '2026-10-12T09:03:00.000000Z'),
        event('prompt_raised', '2026-10-12T09:03:00.100000Z'),
        event('decision', '2026-10-12T09:04:00.000000Z'),
        event('prompt_stopped', '2026-10-12T09:05:00.000000Z'),
        event('allowance_granted', '2026-10-12T09:06:00.000000Z'),
        event('report', '2026-10-12T09:07:00.000000Z'),
        event('prompt_withdrawn', '2026-10-12T09:08:00.000000Z'),
        event('halted', '2026-10-12T09:09:00.000000Z'),
        event('ended', '2026-10-12T09:10:00.000000Z'),
      ],
    };
  });

  it('is collapsed at first and lists the task\'s events, oldest first, once expanded', async () => {
    mockRun = makeRun({ task_budget: budget('paused', 'stopped') });
    renderDiagram();

    const section = await screen.findByTestId('run-task-budget-section');
    const toggle = within(section).getByRole('button', { name: 'Task budget' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(within(section).queryAllByRole('listitem')).toHaveLength(0);
    expect(recordReads, 'the record is read only once the section is opened').toEqual([]);

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await waitFor(() => expect(within(section).getAllByRole('listitem')).toHaveLength(12));
    expect(recordReads).toContain('run-1');
    expect(within(section).getByText(LABEL)).toBeInTheDocument();
    expect(within(section).getAllByRole('listitem').map((item) => item.textContent ?? '')).toEqual([
      expect.stringContaining('Opened'),
      expect.stringContaining('Ceiling changed'),
      expect.stringContaining('Approach notice'),
      expect.stringContaining('Ceiling reached'),
      expect.stringContaining('Prompt raised'),
      expect.stringContaining('Decision'),
      expect.stringContaining('Prompt stopped'),
      expect.stringContaining('Allowance granted'),
      expect.stringContaining('Report'),
      expect.stringContaining('Prompt withdrawn'),
      expect.stringContaining('Halted'),
      expect.stringContaining('Ended'),
    ]);
  });

  it('a run with no task budget has no section and reads no record', async () => {
    mockRun = makeRun({ task_budget: null, end_state: 'completed' });
    renderDiagram();

    await screen.findByTestId('run-status-badge');
    expect(screen.queryByTestId('run-task-budget-section')).toBeNull();
    expect(recordReads).toEqual([]);
  });
});
