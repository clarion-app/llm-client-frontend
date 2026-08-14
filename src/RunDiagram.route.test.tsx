import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { runApi } from './runApi';
import { delegationApi } from './delegationApi';
import type { RunSummary, StepSummary, PaginatedEnvelope } from './types';

/**
 * US6 Acceptance Scenario 2 / SC-010, exercised through the route table the
 * package manifest actually declares — not through a hand-passed prop.
 *
 * `package.json`'s `customFields.clarion.routes` registers
 * `/clarion-app/llm-client/runs/:id` → `<RunDiagram />` **with no props**
 * (the host app generates its route table verbatim from that manifest, see
 * `frontend/vite-plugins/dynamicRoutes.ts`), so the run id can only reach the
 * component through the `:id` route param. Every other RunDiagram test file
 * renders `<RunDiagram runId="..." />` directly, and `RunsList.test.tsx`'s
 * navigation test stubs the destination route with a marker element — so
 * nothing in the suite covered the path the deployed app actually takes.
 * These two cases do.
 */

let mockRunsResponse: PaginatedEnvelope<RunSummary> = {
  data: [],
  meta: { current_page: 1, per_page: 20, total: 0, last_page: 1 },
};
let mockRun: RunSummary | null = null;
let mockSteps: StepSummary[] = [];

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

    if (/^\/agent-runs$/.test(path)) {
      return { data: mockRunsResponse };
    }

    if (/^\/agent-runs\/[^/]+\/steps\/[^/]+\/actions$/.test(path)) {
      return { data: { data: [], meta: { current_page: 1, per_page: 50, total: 0, last_page: 1 } } };
    }

    if (/^\/agent-runs\/[^/]+\/delegations$/.test(path)) {
      return { data: [] };
    }

    if (/^\/agent-runs\/[^/]+\/steps$/.test(path)) {
      return {
        data: {
          data: mockSteps,
          meta: { current_page: 1, per_page: 100, total: mockSteps.length, last_page: 1 },
        },
      };
    }

    const runMatch = path.match(/^\/agent-runs\/([^/]+)$/);
    if (runMatch) {
      if (mockRun === null || runMatch[1] !== mockRun.id) {
        return { error: { status: 404, data: { error: 'Run not found', code: 'run_not_found' } } };
      }
      return { data: mockRun };
    }

    return { data: {} };
  },
  registerUserChannelHandler: () => {},
}));

const { RunDiagram } = await import('./RunDiagram');
const { RunsList } = await import('./RunsList');

function createTestStore() {
  return configureStore({
    reducer: {
      [runApi.reducerPath]: runApi.reducer,
      [delegationApi.reducerPath]: delegationApi.reducer,
    },
    middleware: (getDefault) => getDefault().concat(runApi.middleware, delegationApi.middleware),
  });
}

/** The manifest's two routes, wired exactly as `customFields.clarion.routes` declares them. */
function renderManifestRoutes(initialEntry: string) {
  const store = createTestStore();
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Provider store={store}>
        <Routes>
          <Route path="/clarion-app/llm-client/runs" element={<RunsList />} />
          <Route path="/clarion-app/llm-client/runs/:id" element={<RunDiagram />} />
        </Routes>
      </Provider>
    </MemoryRouter>,
  );
}

function makeRun(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    id: 'run-1',
    kind: 'interactive',
    end_state: 'completed',
    end_reason: null,
    started_at: '2026-08-06T10:00:00.000000Z',
    ended_at: '2026-08-06T10:00:10.000000Z',
    duration_ms: 10000,
    step_count: 1,
    action_count: 0,
    conversation_id: null,
    ...overrides,
  };
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
    action_count: 0,
    ...overrides,
  };
}

describe('RunDiagram via its declared route', () => {
  beforeEach(() => {
    mockRun = makeRun();
    mockSteps = [makeStep()];
    mockRunsResponse = {
      data: [],
      meta: { current_page: 1, per_page: 20, total: 0, last_page: 1 },
    };
  });

  it('renders the run named by the :id route param when mounted with no props', async () => {
    mockRun = makeRun({ id: 'run-from-route' });
    mockSteps = [makeStep({ id: 'step-a', run_id: 'run-from-route' })];

    renderManifestRoutes('/clarion-app/llm-client/runs/run-from-route');

    await waitFor(() => {
      expect(screen.getByTestId('run-diagram')).toBeInTheDocument();
    });

    // The diagram resolved the id from the route, not from a prop: the step
    // list for that specific run rendered, rather than the uniform
    // "not available" state a missing/unknown id produces.
    await waitFor(() => {
      expect(screen.getByTestId('run-step-step-a')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('run-diagram-not-available')).not.toBeInTheDocument();
  });

  it('opens the selected run\'s diagram when a row in the runs list is clicked (SC-010)', async () => {
    mockRun = makeRun({ id: 'run-to-open' });
    mockSteps = [makeStep({ id: 'step-b', run_id: 'run-to-open' })];
    mockRunsResponse = {
      data: [makeRun({ id: 'run-to-open' })],
      meta: { current_page: 1, per_page: 20, total: 1, last_page: 1 },
    };

    renderManifestRoutes('/clarion-app/llm-client/runs');

    await waitFor(() => {
      expect(screen.getByTestId('run-row-run-to-open')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('run-row-run-to-open'));

    await waitFor(() => {
      expect(screen.getByTestId('run-step-step-b')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('run-diagram-not-available')).not.toBeInTheDocument();
  });
});
