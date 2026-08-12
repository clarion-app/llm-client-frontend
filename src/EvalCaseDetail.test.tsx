import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { evalDashboardApi } from './evalDashboardApi';
import type { CaseDetail } from './types';

/**
 * EvalCaseDetail.tsx does not exist yet -- this file is written first, per
 * TDD, and is expected to fail at collection time because
 * `./EvalCaseDetail` cannot be resolved, mirroring EvalDashboard.test.tsx's
 * own precedent in this package for a not-yet-implemented screen. That
 * failure is correct and expected here; a later implementation phase
 * creates the module and turns these tests green.
 *
 * This screen is reachable directly, without passing through the
 * dashboard's own 403 handling first (FR-012/SC-007) -- a non-operator
 * navigating straight to /clarion-app/llm-client/eval-runs/:runId/cases/:caseResultId
 * must still be refused, via GET /eval-runs/{runId}/cases/{caseResultId}/detail's
 * own independent operator gate.
 *
 * Conventions assumed below (this test's own contract for the eventual
 * implementation, mirroring EvalDashboard.test.tsx's precedent):
 *   - root container:            data-testid="eval-case-detail"
 *   - given:                     data-testid="eval-case-detail-given"
 *   - expected behavior:         data-testid="eval-case-detail-expected-behavior"
 *   - produced response:         data-testid="eval-case-detail-produced-response"
 *   - attempted actions:         data-testid="eval-case-detail-attempted-actions"
 *   - one row per expectation:   data-testid={`eval-case-detail-expectation-${index}`}
 *   - a judgment section within an expectation row (only when present):
 *                                 data-testid={`eval-case-detail-expectation-${index}-judgment`}
 *   - not-found state:           data-testid="eval-case-detail-not-available"
 *   - access-denied state:       data-testid="eval-dashboard-access-denied" (shared with
 *     EvalDashboard.tsx/EvalRunBreakdown.tsx -- FR-012/SC-007's "same generic
 *     access-denied state" requirement, deliberately never the same visual
 *     state as not-found)
 */

vi.mock('./config', () => ({
  backend: {
    url: 'http://localhost:8000',
    token: 'test-token',
    user: { id: 'user-1', name: 'Test User', email: 'test@test.com' },
  },
  updateFrontend: () => {},
}));

let mockDetailsByKey: Record<string, CaseDetail | { __forbidden: true }> = {};

vi.mock('@clarion-app/frontend-base', () => ({
  createBackendConfig: () => ({
    backend: { url: 'http://localhost:8000', user: { id: 'user-1', name: '', email: '' } },
    updateFrontend: () => {},
  }),
  createBaseQuery: () => async (args: any) => {
    const url = typeof args === 'string' ? args : (args?.url ?? '');
    const path = String(url).split('?')[0];

    const match = path.match(/^\/eval-runs\/([^/]+)\/cases\/([^/]+)\/detail$/);
    if (match) {
      const key = `${match[1]}:${match[2]}`;
      const entry = mockDetailsByKey[key];

      if (!entry) {
        return { error: { status: 404, data: { error: 'Case result not found', code: 'case_result_not_found' } } };
      }
      if ('__forbidden' in entry) {
        return { error: { status: 403, data: { message: 'Forbidden' } } };
      }
      return { data: entry };
    }

    return { data: {} };
  },
  registerUserChannelHandler: () => {},
}));

const { EvalCaseDetail } = await import('./EvalCaseDetail');

function createTestStore() {
  return configureStore({
    reducer: {
      [evalDashboardApi.reducerPath]: evalDashboardApi.reducer,
    },
    middleware: (getDefault) => getDefault().concat(evalDashboardApi.middleware),
  });
}

function renderCaseDetail(runId: string, caseResultId: string) {
  const store = createTestStore();
  return render(
    <MemoryRouter initialEntries={[`/clarion-app/llm-client/eval-runs/${runId}/cases/${caseResultId}`]}>
      <Provider store={store}>
        <Routes>
          <Route
            path="/clarion-app/llm-client/eval-runs/:runId/cases/:caseResultId"
            element={<EvalCaseDetail />}
          />
        </Routes>
      </Provider>
    </MemoryRouter>,
  );
}

function makeDetail(overrides: Partial<CaseDetail> = {}): CaseDetail {
  return {
    id: 'result-1',
    run_id: 'run-1',
    eval_case_id: 'case-1',
    eval_case_version_id: 'version-1',
    given: 'A customer asks to cancel their subscription.',
    expected_behavior: 'The agent offers to cancel and confirms before doing so.',
    outcome: 'fail',
    outcome_override: null,
    produced_response: 'Your subscription has been cancelled.',
    attempted_actions: [{ tool: 'cancel_subscription', arguments: {} }],
    expectation_results: [
      {
        kind: 'rubric_judgment',
        criteria: 'Confirms before cancelling.',
        met: false,
        score: 3,
        status: 'judged',
        judgment_id: 'judgment-1',
        judgment: {
          score: 3,
          justification: 'The agent cancelled immediately without asking for confirmation.',
          overridden: false,
          overridden_by: null,
          overridden_at: null,
        },
      },
    ],
    error_message: null,
    created_at: '2026-08-10T14:02:58Z',
    ...overrides,
  };
}

describe('EvalCaseDetail', () => {
  beforeEach(() => {
    mockDetailsByKey = {};
  });

  it('renders given, expected_behavior, produced_response, and attempted_actions from the case detail response', async () => {
    mockDetailsByKey['run-1:result-1'] = makeDetail();

    renderCaseDetail('run-1', 'result-1');

    await waitFor(() => {
      expect(screen.getByTestId('eval-case-detail')).toBeInTheDocument();
    });

    expect(screen.getByTestId('eval-case-detail-given')).toHaveTextContent('A customer asks to cancel their subscription.');
    expect(screen.getByTestId('eval-case-detail-expected-behavior')).toHaveTextContent(
      'The agent offers to cancel and confirms before doing so.',
    );
    expect(screen.getByTestId('eval-case-detail-produced-response')).toHaveTextContent(
      'Your subscription has been cancelled.',
    );
    expect(screen.getByTestId('eval-case-detail-attempted-actions')).toHaveTextContent('cancel_subscription');
  });

  it('renders a rubric_judgment expectation\'s nested judgment.justification', async () => {
    mockDetailsByKey['run-1:result-1'] = makeDetail();

    renderCaseDetail('run-1', 'result-1');

    await waitFor(() => {
      expect(screen.getByTestId('eval-case-detail-expectation-0')).toBeInTheDocument();
    });

    const judgmentSection = screen.getByTestId('eval-case-detail-expectation-0-judgment');
    expect(judgmentSection).toHaveTextContent('The agent cancelled immediately without asking for confirmation.');
  });

  it('renders no judgment section for a checkable expectation carrying no judgment key', async () => {
    mockDetailsByKey['run-1:result-1'] = makeDetail({
      expectation_results: [
        {
          kind: 'text_match',
          criteria: '',
          met: true,
        },
      ],
    });

    renderCaseDetail('run-1', 'result-1');

    await waitFor(() => {
      expect(screen.getByTestId('eval-case-detail-expectation-0')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('eval-case-detail-expectation-0-judgment')).not.toBeInTheDocument();
  });

  it('renders a generic "not available" state for a 404', async () => {
    renderCaseDetail('run-1', 'missing-result');

    await waitFor(() => {
      expect(screen.getByTestId('eval-case-detail-not-available')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('eval-case-detail')).not.toBeInTheDocument();
  });

  it('renders the same generic access-denied state as EvalDashboard.tsx/EvalRunBreakdown.tsx on a 403, reachable directly without the dashboard\'s own gate', async () => {
    mockDetailsByKey['run-1:result-1'] = { __forbidden: true };

    renderCaseDetail('run-1', 'result-1');

    await waitFor(() => {
      expect(screen.getByTestId('eval-dashboard-access-denied')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('eval-case-detail')).not.toBeInTheDocument();
    expect(screen.queryByTestId('eval-case-detail-not-available')).not.toBeInTheDocument();
  });
});
