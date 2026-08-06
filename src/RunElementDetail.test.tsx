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
