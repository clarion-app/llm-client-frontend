import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import type { AgentSearchEntry, AgentSearchEnvelope } from './types';

/**
 * spec.md US3 (Phase 4, 094-agent-search-listing), FR-009, SC-002,
 * quickstart.md step 11 — proves the Prev/Next page-navigation controls
 * T025 adds to `AgentBrowser.tsx` fetch incrementally, one page at a time,
 * rather than re-fetching page 1 or fetching everything at once. Mirrors
 * `RunDiagram.pagination.test.tsx`'s own technique exactly (tasks.md
 * Grounding note 10): a mocked `createBaseQuery` that actually slices a
 * 120-entry fixture by the `page` query parameter (not a "return
 * everything as one page" mock), plus an instrumented request log.
 *
 * Written first, confirmed to FAIL — `AgentBrowser.tsx` has no
 * page-navigation controls yet (T018/T019 only ever render page 1; the
 * `page` local-state slot exists but nothing exposes it to the user,
 * tasks.md's Ordering grounding note). This file's own `data-testid`s
 * (`agent-browser-prev-page` / `agent-browser-next-page`) are the exact
 * names T025's implementation targets (tasks.md T025).
 */

let mockAgentPool: AgentSearchEntry[] = [];
const requestLog: string[] = [];

const AGENTS_PER_PAGE = 20;

vi.mock('./config', () => ({
  backend: {
    url: 'http://localhost:8000',
    token: 'test-token',
    user: { id: 'user-1', name: 'Test User', email: 'test@test.com' },
  },
  updateFrontend: () => {},
}));

function pageFromUrl(url: string): number {
  const queryString = url.split('?')[1];
  if (!queryString) return 1;
  const params = new URLSearchParams(queryString);
  const page = Number(params.get('page'));
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function queryFromUrl(url: string): string | null {
  const queryString = url.split('?')[1];
  if (!queryString) return null;
  return new URLSearchParams(queryString).get('q');
}

/** Slices a filtered pool by page, matching the backend's paginated envelope shape (data-model.md §4/§5). */
function buildSearchResponse(url: string): AgentSearchEnvelope {
  const q = queryFromUrl(url);
  const filtered = q
    ? mockAgentPool.filter((agent) => agent.name.toLowerCase().includes(q.toLowerCase()))
    : mockAgentPool;

  const page = pageFromUrl(url);
  const start = (page - 1) * AGENTS_PER_PAGE;
  const data = filtered.slice(start, start + AGENTS_PER_PAGE);

  return {
    data,
    meta: {
      current_page: page,
      per_page: AGENTS_PER_PAGE,
      total: filtered.length,
      last_page: Math.max(1, Math.ceil(filtered.length / AGENTS_PER_PAGE)),
    },
    total_unfiltered: mockAgentPool.length,
  };
}

vi.mock('@clarion-app/frontend-base', () => ({
  createBackendConfig: () => ({
    backend: { url: 'http://localhost:8000', user: { id: 'user-1', name: '', email: '' } },
    updateFrontend: () => {},
  }),
  createBaseQuery: () => async (args: any) => {
    const url = typeof args === 'string' ? args : (args?.url ?? '');
    const path = String(url).split('?')[0];

    if (/^\/agents\/search$/.test(path)) {
      requestLog.push(String(url));
      return { data: buildSearchResponse(String(url)) };
    }

    return { data: {} };
  },
  registerUserChannelHandler: () => {},
}));

// Dynamic import so mocks are in place before module evaluation (matches
// AgentBrowser.test.tsx's / RunDiagram.pagination.test.tsx's pattern).
const { agentBrowserApi } = await import('./agentBrowserApi');
const { AgentBrowser } = await import('./AgentBrowser');

function createTestStore() {
  return configureStore({
    reducer: {
      [agentBrowserApi.reducerPath]: agentBrowserApi.reducer,
    },
    middleware: (getDefault) => getDefault().concat(agentBrowserApi.middleware),
  });
}

function renderAgentBrowser() {
  const store = createTestStore();
  return render(
    <MemoryRouter>
      <Provider store={store}>
        <AgentBrowser />
      </Provider>
    </MemoryRouter>,
  );
}

function makeAgent(overrides: Partial<AgentSearchEntry> = {}): AgentSearchEntry {
  return {
    id: 'agent-1',
    name: 'Agent',
    is_active: true,
    can_use: true,
    current_version_number: 1,
    ...overrides,
  };
}

/** 120 agents, zero-padded so alphabetical ordering (the backend's own orderBy('name')) is deterministic and predictable across pages. */
function buildLargePool(): AgentSearchEntry[] {
  return Array.from({ length: 120 }, (_, i) =>
    makeAgent({ id: `agent-${String(i).padStart(3, '0')}`, name: `agent-${String(i).padStart(3, '0')}` }),
  );
}

describe('AgentBrowser — pagination controls (US3, FR-009, SC-002)', () => {
  beforeEach(() => {
    mockAgentPool = [];
    requestLog.length = 0;
  });

  it('renders only page 1 (20 of 120) on first load, and disables the previous-page control', async () => {
    mockAgentPool = buildLargePool();

    renderAgentBrowser();

    await waitFor(() => {
      expect(screen.getByTestId('agent-row-agent-000')).toBeInTheDocument();
      expect(screen.getByTestId('agent-row-agent-019')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('agent-row-agent-020')).not.toBeInTheDocument();
    expect(screen.queryByTestId('agent-row-agent-119')).not.toBeInTheDocument();

    const prevButton = screen.getByTestId('agent-browser-prev-page');
    expect(prevButton).toBeDisabled();

    const nextButton = screen.getByTestId('agent-browser-next-page');
    expect(nextButton).not.toBeDisabled();
  });

  it('clicking next-page issues a request for page 2 specifically, not a re-fetch of page 1 or a fetch of everything at once', async () => {
    mockAgentPool = buildLargePool();

    renderAgentBrowser();

    await waitFor(() => {
      expect(screen.getByTestId('agent-row-agent-000')).toBeInTheDocument();
    });

    requestLog.length = 0;

    const nextButton = screen.getByTestId('agent-browser-next-page');
    fireEvent.click(nextButton);

    await waitFor(() => {
      expect(screen.getByTestId('agent-row-agent-020')).toBeInTheDocument();
    });

    // Page-1-only rows are gone — Prev/Next replaces the visible page, it
    // does not accumulate every page ever fetched.
    expect(screen.queryByTestId('agent-row-agent-000')).not.toBeInTheDocument();
    expect(screen.getByTestId('agent-row-agent-039')).toBeInTheDocument();
    expect(screen.queryByTestId('agent-row-agent-040')).not.toBeInTheDocument();

    // Exactly one new request went out, and it named page 2 — never a
    // re-fetch of page 1 (no page param / page=1) and never all 120 rows
    // at once (the mock itself only ever answers 20 rows per request, so
    // this also indirectly proves no single request asked for more).
    expect(requestLog).toHaveLength(1);
    expect(pageFromUrl(requestLog[0])).toBe(2);
  });

  it('disables the next-page control once on the last page', async () => {
    mockAgentPool = buildLargePool(); // 120 / 20 = 6 pages

    renderAgentBrowser();

    await waitFor(() => {
      expect(screen.getByTestId('agent-row-agent-000')).toBeInTheDocument();
    });

    const nextButton = screen.getByTestId('agent-browser-next-page');

    // Click through pages 2-6 one at a time. Prev/Next replaces the visible
    // page rather than accumulating every page ever fetched (proven by the
    // earlier test in this file), so agent-119 (page 6 only) isn't in the
    // DOM until the final click — each intermediate click is instead
    // verified via the request log, which names the page it actually asked
    // for.
    for (let clicks = 0; clicks < 5; clicks++) {
      requestLog.length = 0;
      fireEvent.click(screen.getByTestId('agent-browser-next-page'));
      const expectedPage = clicks + 2;
      await waitFor(() => {
        expect(requestLog).toHaveLength(1);
        expect(pageFromUrl(requestLog[0])).toBe(expectedPage);
      });
    }

    await waitFor(() => {
      expect(screen.getByTestId('agent-row-agent-119')).toBeInTheDocument();
    });

    expect(screen.getByTestId('agent-browser-prev-page')).not.toBeDisabled();
    expect(nextButton).toBeDisabled();
  });

  it('resets the visible page back to 1 when the search is narrowed while on page 3+', async () => {
    // 45 of the 120 carry a distinctive marker so the narrowed result
    // spans 3 pages (ceil(45/20) = 3) at the same 20/page size, and the
    // unfiltered list itself has 6 pages, so page 3 is reachable in both.
    const pool = buildLargePool().map((agent, i) =>
      i < 45 ? { ...agent, name: `widget-${agent.name}` } : agent,
    );
    mockAgentPool = pool;

    renderAgentBrowser();

    await waitFor(() => {
      expect(screen.getByTestId('agent-row-agent-000')).toBeInTheDocument();
    });

    // Navigate to page 3 of the full, unfiltered list.
    fireEvent.click(screen.getByTestId('agent-browser-next-page'));
    await waitFor(() => {
      expect(screen.getByTestId('agent-browser-prev-page')).not.toBeDisabled();
    });
    fireEvent.click(screen.getByTestId('agent-browser-next-page'));

    await waitFor(() => {
      // Page 3 of the full 120 holds ids 040-059.
      expect(screen.getByTestId('agent-row-agent-040')).toBeInTheDocument();
    });

    requestLog.length = 0;

    const searchInput = screen.getByTestId('agent-browser-search-input');
    fireEvent.change(searchInput, { target: { value: 'widget' } });

    await waitFor(() => {
      // Page 1 of the narrowed ("widget") set is visible again.
      expect(screen.getByTestId('agent-row-agent-000')).toBeInTheDocument();
    });

    // The reset request (if any went out beyond the initial narrowed
    // fetch) must have asked for page 1, never a stale page 3.
    requestLog.forEach((url) => {
      expect(pageFromUrl(url)).toBe(1);
    });

    expect(screen.getByTestId('agent-browser-prev-page')).toBeDisabled();
  });
});
