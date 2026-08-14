import { createApi } from '@reduxjs/toolkit/query/react';
import { createBaseQuery } from '@clarion-app/frontend-base';
import { backend } from './config';
import type { Delegation } from './types';

/**
 * 098-delegation-protocol, Phase 4 (US3), contracts/delegation-protocol-api.md §4.
 *
 * A read-only RTK Query slice over the two GET endpoints
 * DelegationController exposes: a run's own delegations, and a single
 * delegation's full detail. Powers RunDiagram.tsx's "→ helper run"
 * drill-down link on a `delegation`-typed action row (T033).
 */
export const delegationApi = createApi({
  reducerPath: 'llm-client-delegationApi',
  baseQuery: createBaseQuery({ routePrefix: '/api/clarion-app/llm-client', backendConfig: backend }),
  tagTypes: ['Delegation', 'RunDelegations'],
  endpoints: (builder) => ({
    // GET /agent-runs/{runId}/delegations — every delegation made during a
    // run the caller owns (contracts §1). 200 [] for a zero-delegation
    // owned run.
    getDelegationsForRun: builder.query<Delegation[], string>({
      query: (runId) => `/agent-runs/${runId}/delegations`,
      providesTags: (_result, _error, runId) => [{ type: 'RunDelegations', id: runId }],
    }),

    // GET /delegations/{id} — a single delegation's full detail (contracts §2).
    getDelegation: builder.query<Delegation, string>({
      query: (id) => `/delegations/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'Delegation', id }],
    }),
  }),
});

export const { useGetDelegationsForRunQuery, useGetDelegationQuery } = delegationApi;
