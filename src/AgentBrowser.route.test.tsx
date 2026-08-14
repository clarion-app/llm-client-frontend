import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import type { AgentSearchEntry, AgentSearchEnvelope } from './types';

/**
 * contracts/frontend-agent-browser.md §4.2 — the no-props-via-route guard,
 * mirroring `RunDiagram.route.test.tsx` exactly (tasks.md Grounding note
 * 9): renders `<AgentBrowser />` through the actual manifest-declared
 * route (`/clarion-app/llm-client/agents`) rather than directly with
 * hand-passed props/store, and asserts real seeded agent rows render.
 * Unlike `RunDiagram` (which needs an `:id` route param), `AgentBrowser`
 * is a list screen with no route param at all (research.md D5, contracts
 * §2) — its only state is local (search text, current page) — so this
 * guard's job here is simply confirming the component renders correctly
 * with genuinely zero props of any kind, exactly as the host app's
 * dynamicRoutes.ts always invokes every manifest-routed component.
 *
 * Neither `./AgentBrowser` nor `./agentBrowserApi` exists yet (Phase 3's
 * own implementation, T017-T018, comes after this test). This file is
 * written first, per TDD, and is expected to fail at collection time
 * because the dynamic imports below cannot resolve those modules.
 */

let mockSearchResponse: AgentSearchEnvelope = {
  data: [],
  meta: { current_page: 1, per_page: 20, total: 0, last_page: 1 },
  total_unfiltered: 0,
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

    if (/^\/agents\/search$/.test(path)) {
      return { data: mockSearchResponse };
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

/** The manifest's one route, wired exactly as `customFields.clarion.routes` declares it. */
function renderManifestRoute(initialEntry: string) {
  const store = createTestStore();
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Provider store={store}>
        <Routes>
          <Route path="/clarion-app/llm-client/agents" element={<AgentBrowser />} />
        </Routes>
      </Provider>
    </MemoryRouter>,
  );
}

/**
 * 095-agent-summary-cards, tasks.md T014 (contracts/frontend-agent-cards.md
 * §4): extended with the five new AgentSearchEntry fields the enlarged
 * `GET /agents/search` response now carries — `usage` defaults to a
 * `has_run: false` shape so this fixture, used unmodified, exercises the
 * "Not yet used" branch through the real manifest route below.
 */
function makeAgent(overrides: Partial<AgentSearchEntry> = {}): AgentSearchEntry {
  return {
    id: 'agent-1',
    name: 'Customer Support Agent',
    is_active: true,
    can_use: true,
    current_version_number: 1,
    purpose: 'Helps customers troubleshoot billing issues.',
    capabilities: ['memory_read'],
    operation_count: 5,
    memory_enabled: true,
    usage: {
      has_run: false,
      run_count: 0,
      reliability: {
        invocation_count: 0,
        success_count: 0,
        failure_count: 0,
        low_sample: false,
        no_activity: true,
      },
      cost: {
        priced_cost_total: '0.00',
        request_count: 0,
        unpriced_request_count: 0,
        has_estimated_cost: false,
      },
    },
    ...overrides,
  };
}

describe('AgentBrowser — zero-required-props contract (mutation-checklist row 9)', () => {
  it('accepts zero required arguments (function arity 0), matching contracts §2 — a required prop with no default would raise this to 1, invisible to every other check in this pipeline since vitest does not type-check and tsc excludes *.test.* files from the build', () => {
    expect(AgentBrowser.length).toBe(0);
  });
});

describe('AgentBrowser via its declared route', () => {
  beforeEach(() => {
    mockSearchResponse = {
      data: [],
      meta: { current_page: 1, per_page: 20, total: 0, last_page: 1 },
      total_unfiltered: 0,
    };
  });

  it('renders real seeded agent rows when mounted with zero hand-passed props, via the manifest route', async () => {
    const agent = makeAgent({ id: 'agent-from-route', name: 'Routed Agent' });
    mockSearchResponse = {
      data: [agent],
      meta: { current_page: 1, per_page: 20, total: 1, last_page: 1 },
      total_unfiltered: 1,
    };

    renderManifestRoute('/clarion-app/llm-client/agents');

    await waitFor(() => {
      expect(screen.getByTestId('agent-row-agent-from-route')).toBeInTheDocument();
    });

    expect(screen.getByTestId('agent-row-agent-from-route').textContent ?? '').toMatch(/Routed Agent/);
    expect(screen.queryByTestId('agent-browser-empty-account')).not.toBeInTheDocument();

    // 095-agent-summary-cards, tasks.md T014 (contracts/frontend-agent-
    // cards.md §4): the enlarged response shape's `usage.has_run: false`
    // (this fixture's default) must reach the DOM through the real
    // manifest-declared route (AgentBrowser.tsx -> AgentCard), not just
    // through AgentCard.test.tsx's own direct-render tier.
    expect(screen.getByTestId('agent-row-agent-from-route').textContent ?? '').toMatch(/not yet used/i);
  });

  it('threads the enlarged response fields through to AgentCard, not just AgentCard\'s own defensive defaults (mutation-checklist row 9 closing gap)', async () => {
    // The prior "renders real seeded agent rows..." case's makeAgent()
    // default fixture is has_run: false with every other usage figure at
    // zero -- identical to AgentCard.tsx's own DEFAULT_USAGE fallback, so
    // that test alone cannot distinguish "AgentBrowser genuinely passed
    // usage through" from "AgentBrowser dropped it and AgentCard silently
    // defaulted." This fixture uses values AgentCard has no default for
    // (has_run: true, a specific run_count, a specific purpose/capability)
    // so a dropped field renders visibly differently, not accidentally
    // the same.
    const agent = makeAgent({
      id: 'agent-with-real-activity',
      name: 'Active Agent',
      purpose: 'Distinctive purpose text unique to this fixture.',
      capabilities: ['memory_search'],
      usage: {
        has_run: true,
        run_count: 4,
        reliability: {
          invocation_count: 4,
          success_count: 4,
          failure_count: 0,
          low_sample: true,
          no_activity: false,
        },
        cost: {
          priced_cost_total: '2.50',
          request_count: 4,
          unpriced_request_count: 0,
          has_estimated_cost: false,
        },
      },
    });
    mockSearchResponse = {
      data: [agent],
      meta: { current_page: 1, per_page: 20, total: 1, last_page: 1 },
      total_unfiltered: 1,
    };

    renderManifestRoute('/clarion-app/llm-client/agents');

    await waitFor(() => {
      expect(screen.getByTestId('agent-row-agent-with-real-activity')).toBeInTheDocument();
    });

    const rowText = screen.getByTestId('agent-row-agent-with-real-activity').textContent ?? '';
    expect(rowText).toMatch(/Distinctive purpose text unique to this fixture\./);
    expect(rowText).toMatch(/memory_search/);
    expect(rowText).not.toMatch(/not yet used/i);
    expect(rowText).toMatch(/Ran 4 times/);
  });
});
