import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import type { AgentSearchEntry, AgentSearchEnvelope } from './types';

/**
 * spec.md US1+US2 (Phase 3, 094-agent-search-listing), contracts/
 * frontend-agent-browser.md, research.md D5-D7 — the base loading/error/
 * empty-account states (T008, US1), mirroring `RunsList.tsx`'s own
 * loading/error/empty branch structure (tasks.md Grounding note 12). US2's
 * search-behavior/no-match extension (T009) is appended below, in this
 * same file, sequenced after T008's own describe block.
 *
 * Neither `./AgentBrowser` nor `./agentBrowserApi` exists yet (Phase 3's
 * own implementation, T017-T019, comes after these tests). This file is
 * written first, per TDD, and is expected to fail at collection time
 * because the dynamic imports below cannot resolve those modules —
 * mirroring `RunsList.test.tsx`'s own "written before the file exists"
 * precedent for this package.
 *
 * The mocked `createBaseQuery` below filters a fixture pool
 * (`mockAgentPool`) by the `q` query parameter, the same way the real
 * backend does (data-model.md §4) — so a search-box interaction's
 * resulting request must be answered with a genuinely narrower result for
 * T009's assertions to be meaningful, rather than a static canned response.
 */

let mockAgentPool: AgentSearchEntry[] = [];
let shouldError = false;

vi.mock('./config', () => ({
  backend: {
    url: 'http://localhost:8000',
    token: 'test-token',
    user: { id: 'user-1', name: 'Test User', email: 'test@test.com' },
  },
  updateFrontend: () => {},
}));

function buildSearchResponse(url: string): AgentSearchEnvelope {
  const queryString = url.split('?')[1] ?? '';
  const params = new URLSearchParams(queryString);
  const q = params.get('q');

  const filtered = q
    ? mockAgentPool.filter((agent) => agent.name.toLowerCase().includes(q.toLowerCase()))
    : mockAgentPool;

  return {
    data: filtered,
    meta: { current_page: 1, per_page: 20, total: filtered.length, last_page: 1 },
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
      if (shouldError) {
        return { error: { status: 500, data: { error: 'server_error' } } };
      }
      return { data: buildSearchResponse(String(url)) };
    }

    return { data: {} };
  },
  registerUserChannelHandler: () => {},
}));

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
    name: 'Customer Support Agent',
    is_active: true,
    can_use: true,
    current_version_number: 1,
    ...overrides,
  };
}

describe('AgentBrowser — base states (US1)', () => {
  beforeEach(() => {
    shouldError = false;
    mockAgentPool = [];
  });

  it('renders agent rows with name, an in-service/retired badge, and a usable/view-only badge, from a mocked agentBrowserApi', async () => {
    mockAgentPool = [
      makeAgent({ id: 'agent-active', name: 'Active Helper', is_active: true, can_use: true }),
      makeAgent({ id: 'agent-retired', name: 'Retired Helper', is_active: false, can_use: true }),
    ];

    renderAgentBrowser();

    await waitFor(() => {
      expect(screen.getByTestId('agent-row-agent-active')).toBeInTheDocument();
      expect(screen.getByTestId('agent-row-agent-retired')).toBeInTheDocument();
    });

    const activeRow = screen.getByTestId('agent-row-agent-active');
    expect(activeRow.textContent ?? '').toMatch(/Active Helper/);
    expect(activeRow.textContent ?? '').toMatch(/in.?service/i);
    expect(activeRow.textContent ?? '').toMatch(/usable/i);

    const retiredRow = screen.getByTestId('agent-row-agent-retired');
    expect(retiredRow.textContent ?? '').toMatch(/Retired Helper/);
    expect(retiredRow.textContent ?? '').toMatch(/retired/i);
  });

  it('renders the empty-account state with static explanatory copy (not a functional create-agent link) when total_unfiltered === 0', async () => {
    mockAgentPool = [];

    renderAgentBrowser();

    await waitFor(() => {
      expect(screen.getByTestId('agent-browser-empty-account')).toBeInTheDocument();
    });

    const emptyState = screen.getByTestId('agent-browser-empty-account');
    expect(emptyState.textContent ?? '').toMatch(/no agents/i);
    // Grounding note 14: an explanatory sentence naming how one is created
    // today, not a functional link/button to a screen that does not exist
    // anywhere in this package.
    expect(screen.queryByRole('link', { name: /create/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /create/i })).not.toBeInTheDocument();
  });

  it('renders a loading state before the search request resolves', () => {
    mockAgentPool = [makeAgent()];

    renderAgentBrowser();

    expect(screen.getByTestId('agent-browser').textContent ?? '').toMatch(/loading/i);
  });

  it('renders an error state when the search request fails', async () => {
    shouldError = true;

    renderAgentBrowser();

    await waitFor(() => {
      expect(screen.getByTestId('agent-browser').textContent ?? '').toMatch(/error/i);
    });
  });
});

// =====================================================================
// T009 — US2 (spec.md Acceptance Scenarios, FR-004/FR-008, research.md
// D7) — extends this same file, sequenced after T008's own describe block.
// =====================================================================

describe('AgentBrowser — search behavior and no-match state (US2)', () => {
  beforeEach(() => {
    shouldError = false;
    mockAgentPool = [];
  });

  it('typing in the search box triggers searchAgents({ q }) and the rendered list reflects the narrowed result', async () => {
    mockAgentPool = [
      makeAgent({ id: 'agent-refund', name: 'Refund Specialist', is_active: true }),
      makeAgent({ id: 'agent-weather', name: 'Weather Helper', is_active: true }),
    ];

    renderAgentBrowser();

    await waitFor(() => {
      expect(screen.getByTestId('agent-row-agent-refund')).toBeInTheDocument();
      expect(screen.getByTestId('agent-row-agent-weather')).toBeInTheDocument();
    });

    const searchInput = screen.getByTestId('agent-browser-search-input');
    fireEvent.change(searchInput, { target: { value: 'refund' } });

    await waitFor(() => {
      expect(screen.getByTestId('agent-row-agent-refund')).toBeInTheDocument();
      expect(screen.queryByTestId('agent-row-agent-weather')).not.toBeInTheDocument();
    });
  });

  it('renders the no-match state (distinct from the empty-account state) when total_unfiltered > 0 && meta.total === 0', async () => {
    mockAgentPool = [makeAgent({ id: 'agent-only', name: 'Only Agent' })];

    renderAgentBrowser();

    await waitFor(() => {
      expect(screen.getByTestId('agent-row-agent-only')).toBeInTheDocument();
    });

    const searchInput = screen.getByTestId('agent-browser-search-input');
    fireEvent.change(searchInput, { target: { value: 'xyzzynonexistentterm' } });

    await waitFor(() => {
      expect(screen.getByTestId('agent-browser-no-match')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('agent-browser-empty-account')).not.toBeInTheDocument();
    const noMatch = screen.getByTestId('agent-browser-no-match');
    expect(noMatch.getAttribute('data-testid')).not.toBe('agent-browser-empty-account');
  });

  it('clearing the search box returns the list to the full unfiltered result', async () => {
    mockAgentPool = [
      makeAgent({ id: 'agent-refund', name: 'Refund Specialist', is_active: true }),
      makeAgent({ id: 'agent-weather', name: 'Weather Helper', is_active: true }),
    ];

    renderAgentBrowser();

    await waitFor(() => {
      expect(screen.getByTestId('agent-row-agent-refund')).toBeInTheDocument();
      expect(screen.getByTestId('agent-row-agent-weather')).toBeInTheDocument();
    });

    const searchInput = screen.getByTestId('agent-browser-search-input');
    fireEvent.change(searchInput, { target: { value: 'refund' } });

    await waitFor(() => {
      expect(screen.queryByTestId('agent-row-agent-weather')).not.toBeInTheDocument();
    });

    fireEvent.change(searchInput, { target: { value: '' } });

    await waitFor(() => {
      expect(screen.getByTestId('agent-row-agent-refund')).toBeInTheDocument();
      expect(screen.getByTestId('agent-row-agent-weather')).toBeInTheDocument();
    });
  });
});
