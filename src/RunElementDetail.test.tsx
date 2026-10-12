import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { runApi } from './runApi';
import type { StepSummary, ActionDetail } from './types';

/**
 * Phase 4 (T035), User Story 2 — RunElementDetail.tsx does not exist yet
 * (Phase 3 only built the diagram itself; selecting a node has no detail
 * panel to open). This file is written first, per TDD, and is expected to
 * fail at collection time because `./RunElementDetail` cannot be resolved —
 * the dynamic import below throws before any test body runs. That failure
 * is correct and expected for this phase; Phase 4's implementation task
 * (T040) is what creates the module and turns these tests green.
 *
 * Conventions assumed below (none are pinned by the design docs, so these
 * are this test's own contract for the eventual implementation — matching
 * plan.md/data-model.md's separation of "a step needs no fetch, an action
 * does"):
 *   - `RunElementDetail` accepts `{ runId: string; selected: Selected | null }`
 *     where `Selected` is either `{ type: 'step'; step: StepSummary }` (the
 *     StepSummary the caller already has cached from the step list — no
 *     fetch) or `{ type: 'action'; actionId: string }` (triggers
 *     `useGetActionDetailQuery`).
 *   - root container:            data-testid="run-element-detail"
 *   - started/ended/duration:    data-testid="run-element-detail-started-at" /
 *                                 "-ended-at" / "-duration"
 *   - action content:            data-testid="run-element-detail-content"
 *   - action failure text:       data-testid="run-element-detail-failure"
 *   - truncation notice:         data-testid="run-element-detail-truncated-notice"
 */

vi.mock('./config', () => ({
  backend: {
    url: 'http://localhost:8000',
    token: 'test-token',
    user: { id: 'user-1', name: 'Test User', email: 'test@test.com' },
  },
  updateFrontend: () => {},
}));

let mockActionDetailById: Record<string, ActionDetail> = {};
let actionDetailFetchCount = 0;
let totalFetchCount = 0;

vi.mock('@clarion-app/frontend-base', () => ({
  createBackendConfig: () => ({
    backend: { url: 'http://localhost:8000', user: { id: 'user-1', name: '', email: '' } },
    updateFrontend: () => {},
  }),
  createBaseQuery: () => async (args: any) => {
    totalFetchCount += 1;

    const url = typeof args === 'string' ? args : (args?.url ?? '');
    const path = String(url).split('?')[0];

    // GET /agent-runs/{runId}/actions/{actionId} — the one endpoint that
    // returns `content` (contracts/run-read-api.md). Deliberately does NOT
    // match the /children suffix used by the summary/lazy-expand endpoints.
    const actionDetailMatch = path.match(/^\/agent-runs\/[^/]+\/actions\/([^/]+)$/);
    if (actionDetailMatch) {
      actionDetailFetchCount += 1;
      const actionId = actionDetailMatch[1];
      const detail = mockActionDetailById[actionId];
      if (!detail) {
        return { error: { status: 404, data: { error: 'Run not found', code: 'run_not_found' } } };
      }
      return { data: detail };
    }

    return { data: {} };
  },
  registerUserChannelHandler: () => {},
}));

// Dynamic import so mocks are in place before module evaluation. `./RunElementDetail`
// does not exist at this phase — this import is expected to fail, which is
// what makes this test suite fail cleanly for the right reason (TDD).
const { RunElementDetail } = await import('./RunElementDetail');

function createTestStore() {
  return configureStore({
    reducer: {
      [runApi.reducerPath]: runApi.reducer,
    },
    middleware: (getDefault) => getDefault().concat(runApi.middleware),
  });
}

function renderDetail(runId: string, selected: React.ComponentProps<typeof RunElementDetail>['selected']) {
  const store = createTestStore();
  return render(
    <Provider store={store}>
      <RunElementDetail runId={runId} selected={selected} />
    </Provider>,
  );
}

function makeStep(overrides: Partial<StepSummary> = {}): StepSummary {
  return {
    id: 'step-1',
    run_id: 'run-1',
    position: 1,
    end_state: 'completed',
    end_reason: null,
    started_at: '2026-08-06T10:00:00.000000Z',
    ended_at: '2026-08-06T10:00:05.000000Z',
    duration_ms: 5000,
    wait_ms: null,
    attempt_count: 1,
    action_count: 1,
    ...overrides,
  };
}

function makeActionDetail(overrides: Partial<ActionDetail> = {}): ActionDetail {
  return {
    id: 'action-1',
    run_id: 'run-1',
    step_id: 'step-1',
    parent_action_id: null,
    action_type: 'tool_invocation',
    target: 'search_operations',
    outcome: 'success',
    failure_reason: null,
    started_at: '2026-08-06T10:00:01.000000Z',
    ended_at: '2026-08-06T10:00:02.000000Z',
    duration_ms: 1000,
    has_children: false,
    content: '{"query": "example"}',
    content_truncated: false,
    ...overrides,
  };
}

describe('RunElementDetail', () => {
  beforeEach(() => {
    mockActionDetailById = {};
    actionDetailFetchCount = 0;
    totalFetchCount = 0;
  });

  it('shows a selected step\'s start/end/duration from the already-cached StepSummary, with no new network request (US2 Scenario 1)', async () => {
    const step = makeStep({
      id: 'step-1',
      started_at: '2026-08-06T10:00:00.000000Z',
      ended_at: '2026-08-06T10:00:05.000000Z',
      duration_ms: 5000,
    });

    renderDetail('run-1', { type: 'step', step });

    await waitFor(() => {
      expect(screen.getByTestId('run-element-detail')).toBeInTheDocument();
    });

    expect(screen.getByTestId('run-element-detail-started-at').textContent ?? '').toContain(
      '2026-08-06T10:00:00.000000Z',
    );
    expect(screen.getByTestId('run-element-detail-ended-at').textContent ?? '').toContain(
      '2026-08-06T10:00:05.000000Z',
    );
    expect(screen.getByTestId('run-element-detail-duration').textContent ?? '').toMatch(/5000|5\s*s/i);

    // The StepSummary was already in memory — selecting a step must not
    // trigger any fetch at all, let alone one for action content.
    expect(totalFetchCount).toBe(0);
  });

  it('fetches and shows a selected action\'s content, result, and timing (US2 Scenario 2)', async () => {
    mockActionDetailById['action-1'] = makeActionDetail({
      id: 'action-1',
      content: '{"query": "search term"}\n\nresult: 3 matches found',
      content_truncated: false,
      started_at: '2026-08-06T10:00:01.000000Z',
      ended_at: '2026-08-06T10:00:02.500000Z',
      duration_ms: 1500,
    });

    renderDetail('run-1', { type: 'action', actionId: 'action-1' });

    await waitFor(() => {
      expect(screen.getByTestId('run-element-detail-content').textContent ?? '').toContain('3 matches found');
    });

    expect(screen.getByTestId('run-element-detail-started-at').textContent ?? '').toContain(
      '2026-08-06T10:00:01.000000Z',
    );
    expect(screen.getByTestId('run-element-detail-ended-at').textContent ?? '').toContain(
      '2026-08-06T10:00:02.500000Z',
    );
    expect(screen.getByTestId('run-element-detail-duration').textContent ?? '').toMatch(/1500|1\.5\s*s/i);

    expect(actionDetailFetchCount).toBe(1);
  });

  it('shows a failed action\'s recorded failure text (US2 Scenario 3)', async () => {
    mockActionDetailById['action-fail'] = makeActionDetail({
      id: 'action-fail',
      outcome: 'failure',
      failure_reason: 'Operation timed out after 30s',
      content: '{"query": "example"}',
      content_truncated: false,
    });

    renderDetail('run-1', { type: 'action', actionId: 'action-fail' });

    await waitFor(() => {
      expect(screen.getByTestId('run-element-detail-failure')).toBeInTheDocument();
    });

    expect(screen.getByTestId('run-element-detail-failure').textContent ?? '').toContain(
      'Operation timed out after 30s',
    );
  });

  it('shows no error/failure text for a succeeded action (US2 Scenario 4)', async () => {
    mockActionDetailById['action-ok'] = makeActionDetail({
      id: 'action-ok',
      outcome: 'success',
      failure_reason: null,
      content: '{"query": "example"}',
      content_truncated: false,
    });

    renderDetail('run-1', { type: 'action', actionId: 'action-ok' });

    await waitFor(() => {
      expect(screen.getByTestId('run-element-detail-content')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('run-element-detail-failure')).not.toBeInTheDocument();
  });

  it('renders a visible "content was limited" notice when content_truncated is true, rather than presenting the content as complete (US2 Scenario 5, FR-007)', async () => {
    mockActionDetailById['action-truncated'] = makeActionDetail({
      id: 'action-truncated',
      content: 'partial content...\n\n[TRUNCATED: original content exceeded cap]',
      content_truncated: true,
    });

    renderDetail('run-1', { type: 'action', actionId: 'action-truncated' });

    await waitFor(() => {
      expect(screen.getByTestId('run-element-detail-truncated-notice')).toBeInTheDocument();
    });

    expect(screen.getByTestId('run-element-detail-truncated-notice').textContent ?? '').toMatch(
      /truncat|limit|cut off|capped/i,
    );
  });

  it('renders no truncation notice when content_truncated is false', async () => {
    mockActionDetailById['action-complete'] = makeActionDetail({
      id: 'action-complete',
      content: 'complete, untruncated content',
      content_truncated: false,
    });

    renderDetail('run-1', { type: 'action', actionId: 'action-complete' });

    await waitFor(() => {
      expect(screen.getByTestId('run-element-detail-content')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('run-element-detail-truncated-notice')).not.toBeInTheDocument();
  });
});

/**
 * An `ask_user` action's content is the question snapshot. When it parses
 * as one (it carries `outcome` and `policy`), a structured summary of how
 * the question was to be handled and how it ended is shown above the raw
 * content, data-testid="run-element-detail-question-summary":
 *
 *   - "-question-outcome": answered_late "Answered after work stopped";
 *     expired_assumed "Expired — proceeded assuming {assumption}"; stopped
 *     "Expired — work stopped"; discarded "Discarded — conversation ended
 *     or deleted";
 *   - "-question-policy": "Proceed on assumption" or "Stop until answered",
 *     naming the question as consequential when it was;
 *   - "-question-assumption": the assumption — chosen options as
 *     "{number}. {text}" joined ", ", own words in quotes — absent when
 *     there is none;
 *   - "-question-period": the effective waiting period in minutes.
 *
 * Content that is cut to size (no longer JSON), a snapshot written before
 * policies existed (no `outcome`), and any other action's content are shown
 * raw, with no summary.
 */
describe('RunElementDetail — an ask_user question\'s record', () => {
  beforeEach(() => {
    mockActionDetailById = {};
    actionDetailFetchCount = 0;
    totalFetchCount = 0;
  });

  const proceedPolicy = {
    if_unanswered: 'proceed_on_assumption',
    consequential: false,
    requested_wait_minutes: 60,
    effective_wait_minutes: 60,
    assumed_answer: { raw_reply: '1, 3', is_selection: true, selected: [{ number: 1, text: 'Backend' }, { number: 3, text: 'Docs' }] },
  };

  const stopPolicy = {
    if_unanswered: 'stop',
    consequential: true,
    requested_wait_minutes: 30,
    effective_wait_minutes: 60,
    assumed_answer: null,
  };

  function snapshot(overrides: Record<string, unknown>): string {
    return JSON.stringify({
      question_id: 'question-1',
      outcome: 'pending',
      stopped_at: null,
      stopped_ms: null,
      policy: proceedPolicy,
      question: 'Which part should I change first?',
      choices: ['Backend', 'Frontend', 'Docs'],
      allow_multiple: true,
      asked_at: '2026-10-12T09:00:00Z',
      expires_at: '2026-10-12T10:00:00Z',
      resolution: 'pending',
      resolved_at: null,
      waited_ms: null,
      answer: null,
      presentation: { mode: 'rich', fallback_reason: null },
      ...overrides,
    });
  }

  function askDetail(id: string, content: string, overrides: Partial<ActionDetail> = {}): ActionDetail {
    return makeActionDetail({
      id,
      target: 'ask_user',
      outcome: 'success',
      failure_reason: null,
      content,
      content_truncated: false,
      ...overrides,
    });
  }

  async function showAction(detail: ActionDetail) {
    mockActionDetailById[detail.id] = detail;
    renderDetail('run-1', { type: 'action', actionId: detail.id });
    await waitFor(() => {
      expect(screen.getByTestId('run-element-detail-content')).toBeInTheDocument();
    });
  }

  function textOf(testId: string): string {
    return screen.getByTestId(testId).textContent ?? '';
  }

  it('shows an answer after the stop, the policy and the period, above the raw content', async () => {
    const content = snapshot({
      outcome: 'answered_late',
      resolution: 'answered',
      stopped_at: '2026-10-12T10:01:00Z',
      stopped_ms: 5340000,
      policy: stopPolicy,
      resolved_at: '2026-10-12T11:30:00Z',
      answer: { raw_reply: '2', selected: [{ number: 2, text: 'Frontend' }], method: 'typed_reply' },
    });
    await showAction(askDetail('action-late', content));

    expect(textOf('run-element-detail-question-outcome')).toBe('Answered after work stopped');
    expect(textOf('run-element-detail-question-policy')).toContain('Stop until answered');
    expect(textOf('run-element-detail-question-policy')).toMatch(/consequential/i);
    expect(screen.queryByTestId('run-element-detail-question-assumption')).toBeNull();
    expect(textOf('run-element-detail-question-period')).toContain('60 minutes');

    const summary = screen.getByTestId('run-element-detail-question-summary');
    const raw = screen.getByTestId('run-element-detail-content');
    expect(summary.compareDocumentPosition(raw) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(raw.textContent).toBe(content);
  });

  it('shows what was assumed when the question proceeded on its assumption', async () => {
    await showAction(
      askDetail(
        'action-assumed',
        snapshot({ outcome: 'expired_assumed', resolution: 'expired_assumed', resolved_at: '2026-10-12T10:01:00Z' }),
        { outcome: 'failure', failure_reason: 'question expired_assumed' },
      ),
    );

    expect(textOf('run-element-detail-question-outcome')).toBe('Expired — proceeded assuming 1. Backend, 3. Docs');
    expect(textOf('run-element-detail-question-policy')).toContain('Proceed on assumption');
    expect(textOf('run-element-detail-question-policy')).not.toMatch(/consequential/i);
    expect(textOf('run-element-detail-question-assumption')).toContain('1. Backend, 3. Docs');
    expect(textOf('run-element-detail-question-period')).toContain('60 minutes');
  });

  it('quotes an assumption given in the agent\'s own words', async () => {
    await showAction(
      askDetail(
        'action-own-words',
        snapshot({
          outcome: 'expired_assumed',
          resolution: 'expired_assumed',
          choices: [],
          policy: {
            ...proceedPolicy,
            requested_wait_minutes: 120,
            effective_wait_minutes: 120,
            assumed_answer: { raw_reply: 'Autumn release', is_selection: false, selected: [] },
          },
        }),
        { outcome: 'failure', failure_reason: 'question expired_assumed' },
      ),
    );

    expect(textOf('run-element-detail-question-outcome')).toBe('Expired — proceeded assuming "Autumn release"');
    expect(textOf('run-element-detail-question-assumption')).toContain('"Autumn release"');
    expect(textOf('run-element-detail-question-period')).toContain('120 minutes');
  });

  it('names a one-minute waiting period in the singular', async () => {
    await showAction(
      askDetail(
        'action-one-minute',
        snapshot({
          outcome: 'expired_assumed',
          resolution: 'expired_assumed',
          choices: [],
          policy: {
            ...proceedPolicy,
            requested_wait_minutes: 1,
            effective_wait_minutes: 1,
            assumed_answer: { raw_reply: 'Autumn release', is_selection: false, selected: [] },
          },
        }),
        { outcome: 'failure', failure_reason: 'question expired_assumed' },
      ),
    );

    expect(textOf('run-element-detail-question-period')).toBe('Waiting period: 1 minute');
  });

  it('shows a stopped question as expired with its work stopped', async () => {
    await showAction(
      askDetail(
        'action-stopped',
        snapshot({ outcome: 'stopped', resolution: 'stopped', stopped_at: '2026-10-12T10:01:00Z', stopped_ms: 0, policy: stopPolicy }),
        { outcome: 'awaiting_confirmation', ended_at: null, duration_ms: null },
      ),
    );

    expect(textOf('run-element-detail-question-outcome')).toBe('Expired — work stopped');
    expect(textOf('run-element-detail-question-policy')).toContain('Stop until answered');
  });

  it('shows a discarded stopped question as discarded', async () => {
    await showAction(
      askDetail(
        'action-discarded',
        snapshot({
          outcome: 'discarded',
          resolution: 'withdrawn',
          stopped_at: '2026-10-12T10:01:00Z',
          stopped_ms: 1800000,
          resolved_at: '2026-10-12T10:31:00Z',
          policy: { ...stopPolicy, consequential: false },
        }),
        { outcome: 'failure', failure_reason: 'question withdrawn' },
      ),
    );

    expect(textOf('run-element-detail-question-outcome')).toBe('Discarded — conversation ended or deleted');
    expect(textOf('run-element-detail-question-policy')).not.toMatch(/consequential/i);
  });

  it('shows a record cut to size raw, with no summary', async () => {
    const cut = snapshot({ outcome: 'stopped', policy: stopPolicy }).slice(0, 200) + '\n\n[TRUNCATED: original content exceeded cap]';
    await showAction(askDetail('action-cut', cut, { content_truncated: true }));

    expect(screen.queryByTestId('run-element-detail-question-summary')).toBeNull();
    expect(textOf('run-element-detail-content')).toBe(cut);
    expect(screen.getByTestId('run-element-detail-truncated-notice')).toBeInTheDocument();
  });

  it('shows a record written before policies existed raw, with no summary', async () => {
    const older = JSON.stringify({
      question_id: 'question-1',
      question: 'Which part should I change first?',
      choices: ['Backend', 'Frontend', 'Docs'],
      allow_multiple: false,
      asked_at: '2026-10-12T09:00:00Z',
      expires_at: '2026-10-13T09:00:00Z',
      resolution: 'expired',
      resolved_at: '2026-10-13T09:01:00Z',
      waited_ms: 86460000,
      answer: null,
      presentation: { mode: 'plain', fallback_reason: null },
    });
    await showAction(askDetail('action-older', older, { outcome: 'failure', failure_reason: 'question expired' }));

    expect(screen.queryByTestId('run-element-detail-question-summary')).toBeNull();
    expect(textOf('run-element-detail-content')).toBe(older);
  });

  it('shows no question summary for any other action', async () => {
    const content = snapshot({ outcome: 'stopped', policy: stopPolicy });
    await showAction(makeActionDetail({ id: 'action-other', target: 'execute_operation', content }));

    expect(screen.queryByTestId('run-element-detail-question-summary')).toBeNull();
    expect(textOf('run-element-detail-content')).toBe(content);
  });
});
