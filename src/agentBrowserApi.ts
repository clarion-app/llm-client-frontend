import { createApi } from '@reduxjs/toolkit/query/react';
import { createBaseQuery } from '@clarion-app/frontend-base';
import { backend } from './config';
import type { AgentSearchEnvelope } from './types';

/**
 * GET /agents/search (094-agent-search-listing, contracts/
 * frontend-agent-browser.md §3) — serves both browsing every owned agent
 * (`q` omitted/empty) and narrowing by a free-text query (`q` present).
 * `page` is omitted entirely for page 1, matching runApi.ts's own
 * established convention (Grounding note 10) — keeps page-1 requests
 * URL-identical to the no-page case.
 */
export const agentBrowserApi = createApi({
  reducerPath: 'llm-client-agentBrowserApi',
  baseQuery: createBaseQuery({ routePrefix: '/api/clarion-app/llm-client', backendConfig: backend }),
  tagTypes: ['AgentList'],
  endpoints: (builder) => ({
    searchAgents: builder.query<AgentSearchEnvelope, { q?: string; page?: number }>({
      query: ({ q, page }) => {
        const params = new URLSearchParams();
        if (q) params.set('q', q);
        if (page && page > 1) params.set('page', String(page));
        const qs = params.toString();
        return `/agents/search${qs ? `?${qs}` : ''}`;
      },
      providesTags: ['AgentList'],
    }),
  }),
});

export const { useSearchAgentsQuery } = agentBrowserApi;
