import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { evalDashboardApi } from './evalDashboardApi';
import type { AgentQualityOverview } from './types';

/**
 * EvalDashboard.tsx does not exist yet -- this file is written first, per
 * TDD, and is expected to fail at collection time because `./EvalDashboard`
 * cannot be resolved, mirroring RunDiagram.test.tsx/RunsList.test.tsx's own
 * precedent in this package for a not-yet-implemented screen. That failure
 * is correct and expected here; a later implementation phase creates the
 * module and turns these tests green.
 *
 * Conventions assumed below (none are pinned by the design docs beyond the
 * route `/clarion-app/llm-client/eval-dashboard/:agentLabel`, so these are
 * this test's own contract for the eventual implementation, mirroring
 * RunDiagram.test.tsx's own precedent for this package):
 *   - root container:        data-testid="eval-dashboard"
 *   - pass-rate figure:       data-testid="eval-dashboard-pass-rate"
 *   - trend chart child:      data-testid="eval-trend-chart" (rendered by EvalTrendChart)
 *   - failures list child:    data-testid="eval-persistent-failures-list" (rendered by EvalPersistentFailuresList)
 *   - empty state child:      data-testid="eval-dashboard-empty-state" (rendered by EvalDashboardEmptyState)
 *   - access-denied state:    data-testid="eval-dashboard-access-denied"
 */

vi.mock('./config', () => ({
  backend: {
    url: 'http://localhost:8000',
    token: 'test-token',
    user: { id: 'user-1', name: 'Test User', email: 'test@test.com' },
  },
  updateFrontend: () => {},
}));

let mockOverviewsByAgent: Record<string, AgentQualityOverview | { __forbidden: true }> = {};

vi.mock('@clarion-app/frontend-base', () => ({
  createBackendConfig: () => ({
    backend: { url: 'http://localhost:8000', user: { id: 'user-1', name: '', email: '' } },
    updateFrontend: () => {},
  }),
  createBaseQuery: () => async (args: any) => {
    const url = typeof args === 'string' ? args : (args?.url ?? '');
    const path = String(url).split('?')[0];

    const match = path.match(/^\/agent-eval-dashboard\/([^/]+)$/);
    if (match) {
      const agentLabel = decodeURIComponent(match[1]);
      const entry = mockOverviewsByAgent[agentLabel];

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

// Dynamic import so mocks are in place before module evaluation. `./EvalDashboard`
// does not exist at this phase -- this import is expected to fail, which is
// what makes this test suite fail cleanly for the right reason (TDD).
const { EvalDashboard } = await import('./EvalDashboard');

function createTestStore() {
  return configureStore({
    reducer: {
      [evalDashboardApi.reducerPath]: evalDashboardApi.reducer,
    },
    middleware: (getDefault) => getDefault().concat(evalDashboardApi.middleware),
  });
}

/** Renders EvalDashboard with no props, resolving agentLabel purely from the route param. */
function renderDashboard(agentLabel: string) {
  const store = createTestStore();
  return render(
    <MemoryRouter initialEntries={[`/clarion-app/llm-client/eval-dashboard/${agentLabel}`]}>
      <Provider store={store}>
        <Routes>
          <Route path="/clarion-app/llm-client/eval-dashboard/:agentLabel" element={<EvalDashboard />} />
        </Routes>
      </Provider>
    </MemoryRouter>,
  );
}

function makeOverview(overrides: Partial<AgentQualityOverview> = {}): AgentQualityOverview {
  return {
    agent_label: 'quality-agent',
    current_pass_rate: {
      run_id: 'run-1',
      pass_rate: 0.92,
      pass_count: 46,
      fail_count: 3,
      errored_count: 1,
      needs_human_review_count: 2,
      unjudged_count: 0,
      completed_at: '2026-08-10T14:03:00Z',
    },
    trend: {
      window_days: 30,
      buckets: [
        { period_date: '2026-08-01', pass_count: 5, fail_count: 1, needs_human_review_count: 0, errored_count: 0, unjudged_count: 0, total_count: 6 },
      ],
    },
    persistent_failures: [
      { eval_case_id: 'case-1', fail_count: 8, total_count: 10, fail_rate: 0.8 },
    ],
    ...overrides,
  };
}

describe('EvalDashboard', () => {
  beforeEach(() => {
    mockOverviewsByAgent = {};
  });

  it('renders current pass rate, trend, and persistent failures from the overview response, resolving agentLabel from the route param with no prop supplied', async () => {
    mockOverviewsByAgent['quality-agent'] = makeOverview();

    renderDashboard('quality-agent');

    await waitFor(() => {
      expect(screen.getByTestId('eval-dashboard')).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(screen.getByTestId('eval-dashboard-pass-rate')).toBeInTheDocument();
    });
    expect(screen.getByTestId('eval-trend-chart')).toBeInTheDocument();
    expect(screen.getByTestId('eval-persistent-failures-list')).toBeInTheDocument();
    expect(screen.queryByTestId('eval-dashboard-empty-state')).not.toBeInTheDocument();
  });

  it('resolves a different agentLabel purely from the route -- never a hardcoded value', async () => {
    mockOverviewsByAgent['agent-a'] = makeOverview({ agent_label: 'agent-a', current_pass_rate: null, trend: { window_days: 30, buckets: [] }, persistent_failures: [] });
    mockOverviewsByAgent['agent-b'] = makeOverview({ agent_label: 'agent-b' });

    renderDashboard('agent-b');

    await waitFor(() => {
      expect(screen.getByTestId('eval-dashboard-pass-rate')).toBeInTheDocument();
    });
  });

  it('renders EvalDashboardEmptyState instead of the trend/failures sections when current_pass_rate is null', async () => {
    mockOverviewsByAgent['empty-agent'] = makeOverview({
      current_pass_rate: null,
      trend: { window_days: 30, buckets: [] },
      persistent_failures: [],
    });

    renderDashboard('empty-agent');

    await waitFor(() => {
      expect(screen.getByTestId('eval-dashboard-empty-state')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('eval-trend-chart')).not.toBeInTheDocument();
    expect(screen.queryByTestId('eval-persistent-failures-list')).not.toBeInTheDocument();
  });

  it('renders a generic access-denied state on a 403 response, never a partial dashboard', async () => {
    mockOverviewsByAgent['forbidden-agent'] = { __forbidden: true };

    renderDashboard('forbidden-agent');

    await waitFor(() => {
      expect(screen.getByTestId('eval-dashboard-access-denied')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('eval-dashboard-pass-rate')).not.toBeInTheDocument();
    expect(screen.queryByTestId('eval-trend-chart')).not.toBeInTheDocument();
    expect(screen.queryByTestId('eval-persistent-failures-list')).not.toBeInTheDocument();
    expect(screen.queryByTestId('eval-dashboard-empty-state')).not.toBeInTheDocument();
  });
});
