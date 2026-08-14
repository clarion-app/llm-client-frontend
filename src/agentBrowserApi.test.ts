import { describe, it, expect, vi, beforeEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

/**
 * contracts/frontend-agent-browser.md §3 — asserts the exact query-URL-
 * building behavior of `searchAgents`: no params -> `/agents/search`; `q`
 * present -> `?q=...`; `page > 1` -> `&page=...` (or `?page=...` alone when
 * `q` is absent); `page === 1` -> `page` omitted entirely, keeping page-1
 * requests URL-identical to the no-page case — matching `runApi.ts`'s own
 * established convention (tasks.md Grounding note 10).
 *
 * `./agentBrowserApi` does not exist yet (Phase 3's own implementation,
 * T017, comes after this test). This file is written first, per TDD, and
 * is expected to fail at collection time because the dynamic import below
 * cannot resolve the module — mirroring `RunsList.test.tsx`'s own
 * "written before the file exists" precedent for this package.
 */

vi.mock('./config', () => ({
  backend: {
    url: 'http://localhost:8000',
    token: 'test-token',
    user: { id: 'user-1', name: 'Test User', email: 'test@test.com' },
  },
  updateFrontend: () => {},
}));

let capturedRequests: any[] = [];

vi.mock('@clarion-app/frontend-base', () => ({
  createBackendConfig: () => ({
    backend: { url: 'http://localhost:8000', user: { id: 'user-1', name: '', email: '' } },
    updateFrontend: () => {},
  }),
  createBaseQuery: () => async (args: any) => {
    capturedRequests.push(args);
    return {
      data: {
        data: [],
        meta: { current_page: 1, per_page: 20, total: 0, last_page: 1 },
        total_unfiltered: 0,
      },
    };
  },
}));

const { agentBrowserApi } = await import('./agentBrowserApi');

function createTestStore() {
  return configureStore({
    reducer: {
      [agentBrowserApi.reducerPath]: agentBrowserApi.reducer,
    },
    middleware: (getDefault) => getDefault().concat(agentBrowserApi.middleware),
  });
}

describe('agentBrowserApi — searchAgents URL building (contracts/frontend-agent-browser.md §3)', () => {
  beforeEach(() => {
    capturedRequests = [];
  });

  it('builds a bare /agents/search URL when no params are given', async () => {
    const store = createTestStore();
    await store.dispatch(agentBrowserApi.endpoints.searchAgents.initiate({}));
    expect(capturedRequests).toContainEqual('/agents/search');
  });

  it('appends ?q=... when q is present', async () => {
    const store = createTestStore();
    await store.dispatch(agentBrowserApi.endpoints.searchAgents.initiate({ q: 'refund' }));
    expect(capturedRequests).toContainEqual('/agents/search?q=refund');
  });

  it('appends &page=... after an existing q when page > 1', async () => {
    const store = createTestStore();
    await store.dispatch(agentBrowserApi.endpoints.searchAgents.initiate({ q: 'refund', page: 2 }));
    expect(capturedRequests).toContainEqual('/agents/search?q=refund&page=2');
  });

  it('appends only ?page=... when page > 1 and q is absent', async () => {
    const store = createTestStore();
    await store.dispatch(agentBrowserApi.endpoints.searchAgents.initiate({ page: 3 }));
    expect(capturedRequests).toContainEqual('/agents/search?page=3');
  });

  it('omits the page param entirely when page === 1, matching runApi.ts\'s own convention', async () => {
    const store = createTestStore();
    await store.dispatch(agentBrowserApi.endpoints.searchAgents.initiate({ q: 'refund', page: 1 }));
    expect(capturedRequests).toContainEqual('/agents/search?q=refund');
  });

  it('omits the page param entirely when page === 1 and q is also absent', async () => {
    const store = createTestStore();
    await store.dispatch(agentBrowserApi.endpoints.searchAgents.initiate({ page: 1 }));
    expect(capturedRequests).toContainEqual('/agents/search');
  });
});
