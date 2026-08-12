import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { evalDashboardApi } from './evalDashboardApi';
import type { AgentQualityOverview, CaseDetail, EvalCaseResultSummary, EvalRunDetail, PaginatedEnvelope } from './types';

/**
 * Mirrors RunDiagram.route.test.tsx exactly (research.md D9): renders the
 * manifest's own three eval-dashboard routes — the same
 * path/element pairs package.json's customFields.clarion.routes actually
 * declares — via MemoryRouter, never with a hand-passed agentLabel/runId/
 * caseResultId prop. The host app generates its route table verbatim from
 * that manifest (frontend/vite-plugins/dynamicRoutes.ts), so this is the
 * only test in the package that proves all three components resolve their
 * identifier purely from the route, the exact way the deployed app will
 * mount them.
 */

let mockOverviewsByAgent: Record<string, AgentQualityOverview> = {};
let mockRunsById: Record<string, EvalRunDetail> = {};
let mockCasesByRunId: Record<string, PaginatedEnvelope<EvalCaseResultSummary>> = {};
let mockCaseDetailsByKey: Record<string, CaseDetail> = {};

vi.mock('./config', () => ({
  backend: {
    url: 'http://localhost:8000',
    token: 'test-token',
    user: { id: 'user-1', name: 'Test User', email: 'test@test.com' },
  },
  updateFrontend: () => {},
}));

vi.mock('@clarion-app/frontend-base', () => ({
  createBackendConfig: () => ({
    backend: { url: 'http://localhost:8000', user: { id: 'user-1', name: '', email: '' } },
    updateFrontend: () => {},
  }),
  createBaseQuery: () => async (args: any) => {
    const url = typeof args === 'string' ? args : (args?.url ?? '');
    const path = String(url).split('?')[0];

    const overviewMatch = path.match(/^\/agent-eval-dashboard\/([^/]+)$/);
    if (overviewMatch) {
      const entry = mockOverviewsByAgent[decodeURIComponent(overviewMatch[1])];
      if (!entry) return { error: { status: 404, data: { message: 'Not found.' } } };
      return { data: entry };
    }

    const caseDetailMatch = path.match(/^\/eval-runs\/([^/]+)\/cases\/([^/]+)\/detail$/);
    if (caseDetailMatch) {
      const entry = mockCaseDetailsByKey[`${caseDetailMatch[1]}:${caseDetailMatch[2]}`];
      if (!entry) return { error: { status: 404, data: { error: 'Case result not found', code: 'case_result_not_found' } } };
      return { data: entry };
    }

    const casesMatch = path.match(/^\/eval-runs\/([^/]+)\/cases$/);
    if (casesMatch) {
      const entry = mockCasesByRunId[casesMatch[1]];
      if (!entry) return { error: { status: 404, data: { message: 'Not found.' } } };
      return { data: entry };
    }

    const runMatch = path.match(/^\/eval-runs\/([^/]+)$/);
    if (runMatch) {
      const entry = mockRunsById[runMatch[1]];
      if (!entry) return { error: { status: 404, data: { message: 'Not found.' } } };
      return { data: entry };
    }

    return { data: {} };
  },
  registerUserChannelHandler: () => {},
}));

const { EvalDashboard } = await import('./EvalDashboard');
const { EvalRunBreakdown } = await import('./EvalRunBreakdown');
const { EvalCaseDetail } = await import('./EvalCaseDetail');

function createTestStore() {
  return configureStore({
    reducer: { [evalDashboardApi.reducerPath]: evalDashboardApi.reducer },
    middleware: (getDefault) => getDefault().concat(evalDashboardApi.middleware),
  });
}

/** The manifest's three eval-dashboard routes, wired exactly as customFields.clarion.routes declares them. */
function renderManifestRoutes(initialEntry: string) {
  const store = createTestStore();
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Provider store={store}>
        <Routes>
          <Route path="/clarion-app/llm-client/eval-dashboard/:agentLabel" element={<EvalDashboard />} />
          <Route path="/clarion-app/llm-client/eval-runs/:runId" element={<EvalRunBreakdown />} />
          <Route path="/clarion-app/llm-client/eval-runs/:runId/cases/:caseResultId" element={<EvalCaseDetail />} />
        </Routes>
      </Provider>
    </MemoryRouter>,
  );
}

function makeOverview(overrides: Partial<AgentQualityOverview> = {}): AgentQualityOverview {
  return {
    agent_label: 'route-agent',
    current_pass_rate: {
      run_id: 'route-run-1',
      pass_rate: 1,
      pass_count: 1,
      fail_count: 0,
      errored_count: 0,
      needs_human_review_count: 0,
      unjudged_count: 0,
      completed_at: '2026-08-10T00:00:00Z',
    },
    trend: { window_days: 30, buckets: [] },
    persistent_failures: [],
    ...overrides,
  };
}

function makeRunDetail(overrides: Partial<EvalRunDetail> = {}): EvalRunDetail {
  return {
    id: 'route-run-1',
    suite_id: 'suite-1',
    agent_label: 'route-agent',
    status: 'completed',
    case_count: 1,
    completed_count: 1,
    remaining_count: 0,
    started_at: '2026-08-10T00:00:00Z',
    completed_at: '2026-08-10T00:01:00Z',
    failure_reason: null,
    overall: 'pass',
    outcome_counts: { pass: 1, fail: 0, needs_human_review: 0, errored: 0, unjudged: 0 },
    consumption: {
      total_cost: 0.1,
      cost_currency: 'USD',
      cost_unpriced: false,
      total_tokens: 10,
      tool_invocation_count: 0,
      total_duration_ms: 100,
      judging: { total_cost: 0, total_tokens: 0, invocation_count: 0, cost_unpriced: false },
    },
    ...overrides,
  } as EvalRunDetail;
}

function makeCaseDetail(overrides: Partial<CaseDetail> = {}): CaseDetail {
  return {
    id: 'route-case-result-1',
    run_id: 'route-run-1',
    eval_case_id: 'route-case-1',
    eval_case_version_id: 'route-version-1',
    given: 'Say the word echo',
    expected_behavior: 'Answer with the single word echo.',
    outcome: 'pass',
    outcome_override: null,
    produced_response: 'echo',
    attempted_actions: [],
    expectation_results: [],
    error_message: null,
    created_at: '2026-08-10T00:00:30Z',
    ...overrides,
  } as CaseDetail;
}

describe('eval-dashboard routes, rendered exactly as the manifest declares them', () => {
  beforeEach(() => {
    mockOverviewsByAgent = {};
    mockRunsById = {};
    mockCasesByRunId = {};
    mockCaseDetailsByKey = {};
  });

  it('EvalDashboard resolves agentLabel from the :agentLabel route param, mounted with no props', async () => {
    mockOverviewsByAgent['route-agent-from-url'] = makeOverview({ agent_label: 'route-agent-from-url' });

    renderManifestRoutes('/clarion-app/llm-client/eval-dashboard/route-agent-from-url');

    await waitFor(() => {
      expect(screen.getByTestId('eval-dashboard')).toBeInTheDocument();
    });
    expect(screen.getByTestId('eval-dashboard-pass-rate')).toBeInTheDocument();
    expect(screen.queryByTestId('eval-dashboard-not-available')).not.toBeInTheDocument();
  });

  it('EvalRunBreakdown resolves runId from the :runId route param, mounted with no props', async () => {
    mockRunsById['route-run-from-url'] = makeRunDetail({ id: 'route-run-from-url' });
    mockCasesByRunId['route-run-from-url'] = {
      data: [{ id: 'result-1', eval_case_id: 'case-1', outcome: 'pass', outcome_override: null }],
      meta: { current_page: 1, per_page: 25, total: 1, last_page: 1 },
    };

    renderManifestRoutes('/clarion-app/llm-client/eval-runs/route-run-from-url');

    await waitFor(() => {
      expect(screen.getByTestId('eval-run-breakdown')).toBeInTheDocument();
    });
    expect(screen.getByTestId('eval-run-breakdown-case-row-result-1')).toBeInTheDocument();
    expect(screen.queryByTestId('eval-run-breakdown-not-available')).not.toBeInTheDocument();
  });

  it('EvalCaseDetail resolves runId/caseResultId from the route, mounted with no props', async () => {
    mockCaseDetailsByKey['route-run-from-url:route-case-result-from-url'] = makeCaseDetail({
      id: 'route-case-result-from-url',
      run_id: 'route-run-from-url',
    });

    renderManifestRoutes('/clarion-app/llm-client/eval-runs/route-run-from-url/cases/route-case-result-from-url');

    await waitFor(() => {
      expect(screen.getByTestId('eval-case-detail')).toBeInTheDocument();
    });
    expect(screen.getByTestId('eval-case-detail-given')).toHaveTextContent('Say the word echo');
    expect(screen.queryByTestId('eval-case-detail-not-available')).not.toBeInTheDocument();
  });

  it('drills from the dashboard to the run to the case using only the routes the manifest declares (SC-003)', async () => {
    mockOverviewsByAgent['drill-agent'] = makeOverview({
      agent_label: 'drill-agent',
      current_pass_rate: {
        run_id: 'drill-run-1',
        pass_rate: 1,
        pass_count: 1,
        fail_count: 0,
        errored_count: 0,
        needs_human_review_count: 0,
        unjudged_count: 0,
        completed_at: '2026-08-10T00:00:00Z',
      },
    });
    mockRunsById['drill-run-1'] = makeRunDetail({ id: 'drill-run-1', agent_label: 'drill-agent' });
    mockCasesByRunId['drill-run-1'] = {
      data: [{ id: 'drill-result-1', eval_case_id: 'drill-case-1', outcome: 'pass', outcome_override: null }],
      meta: { current_page: 1, per_page: 25, total: 1, last_page: 1 },
    };
    mockCaseDetailsByKey['drill-run-1:drill-result-1'] = makeCaseDetail({
      id: 'drill-result-1',
      run_id: 'drill-run-1',
    });

    renderManifestRoutes('/clarion-app/llm-client/eval-dashboard/drill-agent');

    await waitFor(() => {
      expect(screen.getByTestId('eval-dashboard-current-run-link')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('eval-dashboard-current-run-link'));

    await waitFor(() => {
      expect(screen.getByTestId('eval-run-breakdown-case-row-drill-result-1')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('eval-run-breakdown-case-row-drill-result-1'));

    await waitFor(() => {
      expect(screen.getByTestId('eval-case-detail')).toBeInTheDocument();
    });
  });
});
