import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { evalDashboardApi } from './evalDashboardApi';
import type { PaginatedEnvelope } from './types';

/**
 * EvalRunBreakdown.tsx does not exist yet -- this file is written first,
 * per TDD, and is expected to fail at collection time because
 * `./EvalRunBreakdown` cannot be resolved, mirroring EvalDashboard.test.tsx's
 * own precedent in this package for a not-yet-implemented screen. That
 * failure is correct and expected here; a later implementation phase
 * creates the module and turns these tests green.
 *
 * This screen is reachable directly, without passing through the
 * dashboard's own 403 handling first (FR-012/SC-007) -- a non-operator
 * navigating straight to /clarion-app/llm-client/eval-runs/:runId must
 * still be refused, since GET /eval-runs/{runId} and
 * GET /eval-runs/{runId}/cases are each independently operator-gated.
 *
 * Conventions assumed below (this test's own contract for the eventual
 * implementation, mirroring EvalDashboard.test.tsx/RunsList.test.tsx's
 * precedent):
 *   - root container:      data-testid="eval-run-breakdown"
 *   - one row per case:    data-testid={`eval-run-breakdown-case-row-${id}`},
 *     each containing its own data-testid={`eval-outcome-badge-${outcome}`}
 *   - clicking a row navigates to
 *     /clarion-app/llm-client/eval-runs/:runId/cases/:caseResultId
 *   - not-found state:     data-testid="eval-run-breakdown-not-available"
 *   - access-denied state: data-testid="eval-dashboard-access-denied" (shared
 *     with EvalDashboard.tsx -- FR-012/SC-007's "same generic access-denied
 *     state" requirement, deliberately never the same visual state as
 *     not-found)
 */

interface MockRunDetail {
  id: string;
  agent_label: string;
  status: string;
  case_count: number;
  completed_count: number;
  remaining_count: number;
  outcome_counts: {
    pass: number;
    fail: number;
    needs_human_review: number;
    errored: number;
    unjudged: number;
  };
}

interface MockCaseResult {
  id: string;
  eval_case_id: string;
  outcome: string;
  outcome_override: string | null;
}

vi.mock('./config', () => ({
  backend: {
    url: 'http://localhost:8000',
    token: 'test-token',
    user: { id: 'user-1', name: 'Test User', email: 'test@test.com' },
  },
  updateFrontend: () => {},
}));

let mockRunsById: Record<string, MockRunDetail | { __forbidden: true }> = {};
let mockCasesByRunId: Record<string, PaginatedEnvelope<MockCaseResult> | { __forbidden: true }> = {};

vi.mock('@clarion-app/frontend-base', () => ({
  createBackendConfig: () => ({
    backend: { url: 'http://localhost:8000', user: { id: 'user-1', name: '', email: '' } },
    updateFrontend: () => {},
  }),
  createBaseQuery: () => async (args: any) => {
    const url = typeof args === 'string' ? args : (args?.url ?? '');
    const path = String(url).split('?')[0];

    const casesMatch = path.match(/^\/eval-runs\/([^/]+)\/cases$/);
    if (casesMatch) {
      const entry = mockCasesByRunId[casesMatch[1]];
      if (!entry) {
        return { error: { status: 404, data: { message: 'Not found.' } } };
      }
      if ('__forbidden' in entry) {
        return { error: { status: 403, data: { message: 'Forbidden' } } };
      }
      return { data: entry };
    }

    const runMatch = path.match(/^\/eval-runs\/([^/]+)$/);
    if (runMatch) {
      const entry = mockRunsById[runMatch[1]];
      if (!entry) {
        return { error: { status: 404, data: { message: 'Not found.' } } };
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

const { EvalRunBreakdown } = await import('./EvalRunBreakdown');

function createTestStore() {
  return configureStore({
    reducer: {
      [evalDashboardApi.reducerPath]: evalDashboardApi.reducer,
    },
    middleware: (getDefault) => getDefault().concat(evalDashboardApi.middleware),
  });
}

function renderBreakdown(runId: string) {
  const store = createTestStore();
  return render(
    <MemoryRouter initialEntries={[`/clarion-app/llm-client/eval-runs/${runId}`]}>
      <Provider store={store}>
        <Routes>
          <Route path="/clarion-app/llm-client/eval-runs/:runId" element={<EvalRunBreakdown />} />
          <Route
            path="/clarion-app/llm-client/eval-runs/:runId/cases/:caseResultId"
            element={<div data-testid="eval-case-detail-route-marker">Case detail page</div>}
          />
        </Routes>
      </Provider>
    </MemoryRouter>,
  );
}

function makeRunDetail(overrides: Partial<MockRunDetail> = {}): MockRunDetail {
  return {
    id: 'run-1',
    agent_label: 'quality-agent',
    status: 'completed',
    case_count: 2,
    completed_count: 2,
    remaining_count: 0,
    outcome_counts: { pass: 1, fail: 1, needs_human_review: 0, errored: 0, unjudged: 0 },
    ...overrides,
  };
}

function makeCasesEnvelope(cases: MockCaseResult[]): PaginatedEnvelope<MockCaseResult> {
  return {
    data: cases,
    meta: { current_page: 1, per_page: 25, total: cases.length, last_page: 1 },
  };
}

describe('EvalRunBreakdown', () => {
  beforeEach(() => {
    mockRunsById = {};
    mockCasesByRunId = {};
  });

  it('renders a run\'s per-case results, each with its own EvalOutcomeBadge', async () => {
    mockRunsById['run-1'] = makeRunDetail();
    mockCasesByRunId['run-1'] = makeCasesEnvelope([
      { id: 'result-1', eval_case_id: 'case-1', outcome: 'pass', outcome_override: null },
      { id: 'result-2', eval_case_id: 'case-2', outcome: 'fail', outcome_override: null },
    ]);

    renderBreakdown('run-1');

    await waitFor(() => {
      expect(screen.getByTestId('eval-run-breakdown')).toBeInTheDocument();
    });

    const rowOne = await screen.findByTestId('eval-run-breakdown-case-row-result-1');
    expect(rowOne.querySelector('[data-testid="eval-outcome-badge-pass"]')).not.toBeNull();

    const rowTwo = screen.getByTestId('eval-run-breakdown-case-row-result-2');
    expect(rowTwo.querySelector('[data-testid="eval-outcome-badge-fail"]')).not.toBeNull();
  });

  it('navigates to the case detail route when a case row is selected', async () => {
    mockRunsById['run-1'] = makeRunDetail();
    mockCasesByRunId['run-1'] = makeCasesEnvelope([
      { id: 'result-1', eval_case_id: 'case-1', outcome: 'pass', outcome_override: null },
    ]);

    renderBreakdown('run-1');

    const row = await screen.findByTestId('eval-run-breakdown-case-row-result-1');
    fireEvent.click(row);

    await waitFor(() => {
      expect(screen.getByTestId('eval-case-detail-route-marker')).toBeInTheDocument();
    });
  });

  it('renders a generic "not available" state for a 404, never a partial breakdown', async () => {
    renderBreakdown('missing-run');

    await waitFor(() => {
      expect(screen.getByTestId('eval-run-breakdown-not-available')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('eval-run-breakdown')).not.toBeInTheDocument();
  });

  it('renders the same generic access-denied state as EvalDashboard.tsx on a 403 from either query, never a partial breakdown and never the not-found state', async () => {
    mockRunsById['run-1'] = { __forbidden: true };
    mockCasesByRunId['run-1'] = { __forbidden: true };

    renderBreakdown('run-1');

    await waitFor(() => {
      expect(screen.getByTestId('eval-dashboard-access-denied')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('eval-run-breakdown')).not.toBeInTheDocument();
    expect(screen.queryByTestId('eval-run-breakdown-not-available')).not.toBeInTheDocument();
  });
});
