import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { runApi } from './runApi';
import type { RunSummary, PaginatedEnvelope } from './types';

/**
 * Phase 8 (T082), User Story 6 — RunsList.tsx does not exist yet (Phase 8's
 * implementation tasks, T086-T088, are what create it and the `GET
 * /agent-runs` `runApi.ts` endpoint it will use). This file is written
 * first, per TDD, and is expected to fail at collection time because
 * `./RunsList` cannot be resolved — the dynamic import below throws before
 * any test body runs. That failure is correct and expected at this stage;
 * it is not this task's job to fix it.
 *
 * Conventions assumed below (none are pinned by the design docs beyond the
 * navigation target `/clarion-app/llm-client/runs/:id` — contracts/
 * run-read-api.md's `GET /agent-runs` shape and T087's "mirrors
 * Conversations.tsx" instruction — so these are this test's own contract
 * for the eventual implementation, mirroring RunDiagram.test.tsx's existing
 * precedent for this package):
 *   - root container:  data-testid="runs-list"
 *   - empty state:      data-testid="runs-list-empty"
 *   - a run row:         data-testid={`run-row-${run.id}`}, clickable,
 *     whose text content includes both the run's `started_at` (or a
 *     human-formatted rendering of it) and its `end_state` (lifecycle
 *     state), per T082's "each identifiable by start time and lifecycle
 *     state."
 *   - selecting a row (click) navigates to
 *     `/clarion-app/llm-client/runs/:id`, mirroring Conversations.tsx's
 *     `onClick={() => navigate(...)}` row pattern (T087).
 */

let mockRunsResponse: PaginatedEnvelope<RunSummary> = {
  data: [],
  meta: { current_page: 1, per_page: 20, total: 0, last_page: 1 },
};

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

    return { data: {} };
  },
  registerUserChannelHandler: () => {},
}));

// Dynamic import so mocks are in place before module evaluation. `./RunsList`
// does not exist at this phase — this import is expected to fail, which is
// what makes this test suite fail cleanly for the right reason (TDD).
const { RunsList } = await import('./RunsList');

function createTestStore() {
  return configureStore({
    reducer: {
      [runApi.reducerPath]: runApi.reducer,
    },
    middleware: (getDefault) => getDefault().concat(runApi.middleware),
  });
}

function renderRunsList() {
  const store = createTestStore();
  return render(
    <MemoryRouter initialEntries={['/clarion-app/llm-client/runs']}>
      <Provider store={store}>
        <Routes>
          <Route path="/clarion-app/llm-client/runs" element={<RunsList />} />
          <Route
            path="/clarion-app/llm-client/runs/:id"
            element={<div data-testid="run-diagram-route-marker">Run diagram page</div>}
          />
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
    action_count: 1,
    conversation_id: null,
    ...overrides,
  };
}

describe('RunsList', () => {
  beforeEach(() => {
    mockRunsResponse = {
      data: [],
      meta: { current_page: 1, per_page: 20, total: 0, last_page: 1 },
    };
  });

  it('renders both an interactive and a system-initiated run, each identifiable by start time and lifecycle state', async () => {
    const interactiveRun = makeRun({
      id: 'run-interactive',
      kind: 'interactive',
      end_state: 'completed',
      started_at: '2026-08-06T10:00:00.000000Z',
    });
    const systemRun = makeRun({
      id: 'run-system',
      kind: 'system_initiated',
      end_state: 'in_progress',
      ended_at: null,
      duration_ms: null,
      started_at: '2026-08-05T09:30:00.000000Z',
    });
    mockRunsResponse = {
      data: [interactiveRun, systemRun],
      meta: { current_page: 1, per_page: 20, total: 2, last_page: 1 },
    };

    renderRunsList();

    await waitFor(() => {
      expect(screen.getByTestId('run-row-run-interactive')).toBeInTheDocument();
      expect(screen.getByTestId('run-row-run-system')).toBeInTheDocument();
    });

    const interactiveRow = screen.getByTestId('run-row-run-interactive');
    expect(interactiveRow.textContent ?? '').toMatch(/2026-08-06/);
    expect(interactiveRow.textContent ?? '').toMatch(/completed/i);

    const systemRow = screen.getByTestId('run-row-run-system');
    expect(systemRow.textContent ?? '').toMatch(/2026-08-05/);
    expect(systemRow.textContent ?? '').toMatch(/in.?progress/i);
  });

  it('renders an explicit empty state for a caller with zero runs', async () => {
    mockRunsResponse = {
      data: [],
      meta: { current_page: 1, per_page: 20, total: 0, last_page: 1 },
    };

    renderRunsList();

    await waitFor(() => {
      expect(screen.getByTestId('runs-list-empty')).toBeInTheDocument();
    });

    expect(screen.queryByTestId(/^run-row-/)).not.toBeInTheDocument();
  });

  it('navigates to /clarion-app/llm-client/runs/:id when a run is selected', async () => {
    const run = makeRun({ id: 'run-to-open' });
    mockRunsResponse = {
      data: [run],
      meta: { current_page: 1, per_page: 20, total: 1, last_page: 1 },
    };

    renderRunsList();

    await waitFor(() => {
      expect(screen.getByTestId('run-row-run-to-open')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('run-row-run-to-open'));

    await waitFor(() => {
      expect(screen.getByTestId('run-diagram-route-marker')).toBeInTheDocument();
    });
  });

  it('never renders a run absent from the API response (defense against a hypothetical leak)', async () => {
    const visibleRun = makeRun({ id: 'run-visible' });
    // A run that must never be rendered because it was never part of the
    // API response the component actually fetched — the "leaked" run.
    const leakedRun = makeRun({ id: 'run-leaked-should-never-render' });
    mockRunsResponse = {
      data: [visibleRun],
      meta: { current_page: 1, per_page: 20, total: 1, last_page: 1 },
    };

    renderRunsList();

    await waitFor(() => {
      expect(screen.getByTestId('run-row-run-visible')).toBeInTheDocument();
    });

    expect(screen.queryByTestId(`run-row-${leakedRun.id}`)).not.toBeInTheDocument();
    // Only the one row the API actually returned may be present.
    expect(screen.queryAllByTestId(/^run-row-/)).toHaveLength(1);
  });
});
