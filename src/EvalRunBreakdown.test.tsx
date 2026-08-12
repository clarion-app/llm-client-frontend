import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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

interface MockRunConsumption {
  total_cost: number | null;
  cost_currency: string | null;
  cost_unpriced: boolean;
  total_tokens: number;
  tool_invocation_count: number;
  total_duration_ms: number;
  judging: {
    total_cost: number | null;
    total_tokens: number;
    invocation_count: number;
    cost_unpriced: boolean;
  };
}

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
  consumption: MockRunConsumption;
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
  const view = render(
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
  return { ...view, store };
}

function makeConsumption(overrides: Partial<MockRunConsumption> = {}): MockRunConsumption {
  return {
    total_cost: 0.42,
    cost_currency: 'USD',
    cost_unpriced: false,
    total_tokens: 150,
    tool_invocation_count: 3,
    total_duration_ms: 4200,
    judging: {
      total_cost: 0.05,
      total_tokens: 20,
      invocation_count: 1,
      cost_unpriced: false,
    },
    ...overrides,
  };
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
    consumption: makeConsumption(),
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

  // -----------------------------------------------------------------
  // Weighing quality against cost — the consumption block already
  // carried by getRunDetail is rendered alongside the outcome counts,
  // not on a separate screen.
  // -----------------------------------------------------------------

  it('renders the consumption block alongside the outcome counts, not on a separate screen', async () => {
    mockRunsById['run-1'] = makeRunDetail({
      consumption: makeConsumption({
        total_cost: 1.23,
        total_tokens: 4500,
        tool_invocation_count: 7,
        total_duration_ms: 9000,
        judging: { total_cost: 0.11, total_tokens: 300, invocation_count: 2, cost_unpriced: false },
      }),
    });
    mockCasesByRunId['run-1'] = makeCasesEnvelope([
      { id: 'result-1', eval_case_id: 'case-1', outcome: 'pass', outcome_override: null },
    ]);

    renderBreakdown('run-1');

    await waitFor(() => {
      expect(screen.getByTestId('eval-run-breakdown')).toBeInTheDocument();
    });

    const consumption = await screen.findByTestId('eval-run-breakdown-consumption');
    expect(consumption).toBeInTheDocument();
    expect(within(consumption).getByTestId('eval-run-breakdown-consumption-total-cost')).toHaveTextContent('1.23');
    expect(within(consumption).getByTestId('eval-run-breakdown-consumption-total-tokens')).toHaveTextContent('4500');
    expect(within(consumption).getByTestId('eval-run-breakdown-consumption-tool-invocation-count')).toHaveTextContent('7');
    expect(within(consumption).getByTestId('eval-run-breakdown-consumption-total-duration-ms')).toHaveTextContent('9000');
    expect(within(consumption).getByTestId('eval-run-breakdown-consumption-judging-total-cost')).toHaveTextContent('0.11');
    expect(within(consumption).getByTestId('eval-run-breakdown-consumption-judging-total-tokens')).toHaveTextContent('300');
    expect(within(consumption).getByTestId('eval-run-breakdown-consumption-judging-invocation-count')).toHaveTextContent('2');

    // Rendered in the same root container as the outcome counts, never a
    // second screen the operator has to navigate to separately.
    expect(within(screen.getByTestId('eval-run-breakdown')).getByTestId('eval-run-breakdown-consumption')).toBeInTheDocument();
    expect(within(screen.getByTestId('eval-run-breakdown')).getByTestId('eval-run-breakdown-outcome-counts')).toBeInTheDocument();
  });

  it('shows growing partial consumption for a run still in progress, with no separate zero/absent state', async () => {
    mockRunsById['run-1'] = makeRunDetail({
      status: 'in_progress',
      completed_count: 1,
      remaining_count: 3,
      consumption: makeConsumption({ total_cost: 0.1, total_tokens: 150 }),
    });
    mockCasesByRunId['run-1'] = makeCasesEnvelope([
      { id: 'result-1', eval_case_id: 'case-1', outcome: 'pass', outcome_override: null },
    ]);

    renderBreakdown('run-1');

    const consumption = await screen.findByTestId('eval-run-breakdown-consumption');
    expect(within(consumption).getByTestId('eval-run-breakdown-consumption-total-tokens')).toHaveTextContent('150');
  });

  it('updates the rendered consumption figures live when EvalRunUpdated patches the cached run detail, without a manual reload', async () => {
    mockRunsById['run-1'] = makeRunDetail({
      status: 'in_progress',
      completed_count: 1,
      remaining_count: 3,
      consumption: makeConsumption({ total_cost: 0.1, total_tokens: 150 }),
    });
    mockCasesByRunId['run-1'] = makeCasesEnvelope([
      { id: 'result-1', eval_case_id: 'case-1', outcome: 'pass', outcome_override: null },
    ]);

    const { store } = renderBreakdown('run-1');

    const consumption = await screen.findByTestId('eval-run-breakdown-consumption');
    expect(within(consumption).getByTestId('eval-run-breakdown-consumption-total-tokens')).toHaveTextContent('150');

    // The exact patch shape evalDashboardRealtime.ts applies on a live
    // EvalRunUpdated push: Object.assign(draft, run) against the cached
    // getRunDetail entry — reused here directly rather than re-driving a
    // full realtime subscription, since that mechanism is already proven
    // by evalDashboardRealtime.test.ts; this test only proves the screen
    // reflects the patched cache without a reload.
    store.dispatch(
      evalDashboardApi.util.updateQueryData('getRunDetail', 'run-1', (draft) => {
        Object.assign(draft, makeRunDetail({
          status: 'in_progress',
          completed_count: 2,
          remaining_count: 2,
          consumption: makeConsumption({ total_cost: 0.2, total_tokens: 300 }),
        }));
      }),
    );

    await waitFor(() => {
      expect(within(screen.getByTestId('eval-run-breakdown-consumption')).getByTestId('eval-run-breakdown-consumption-total-tokens')).toHaveTextContent('300');
    });
  });
});
