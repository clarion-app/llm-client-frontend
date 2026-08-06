import { createApi } from '@reduxjs/toolkit/query/react';
import { createBaseQuery } from '@clarion-app/frontend-base';
import { backend } from './config';
import type { RunSummary, StepSummary, ActionSummary, PaginatedEnvelope } from './types';

export const runApi = createApi({
  reducerPath: 'llm-client-runApi',
  baseQuery: createBaseQuery({ routePrefix: '/api/clarion-app/llm-client', backendConfig: backend }),
  tagTypes: ['Run', 'RunList', 'RunSteps', 'RunActions'],
  endpoints: (builder) => ({
    // GET /agent-runs/{runId} — O(1) run summary. Reopening or refreshing a
    // previously-viewed run's diagram must re-fetch the run's current
    // recorded state rather than serving a stale cache entry (FR-020,
    // SC-009). RTK Query has no literal `refetchOnMountOrArgChange` field on
    // a `builder.query()` endpoint definition — that option only exists at
    // `createApi({ refetchOnMountOrArgChange })` (applies to every endpoint)
    // or as a per-hook-call override — so the per-endpoint equivalent here
    // is `forceRefetch`, which the query-thunk's dispatch `condition()`
    // consults on every mount/arg-change dispatch, cached-and-fulfilled or
    // not.
    getRun: builder.query<RunSummary, string>({
      query: (runId) => `/agent-runs/${runId}`,
      providesTags: (_result, _error, runId) => [{ type: 'Run', id: runId }],
      forceRefetch: () => true,
    }),

    // GET /agent-runs/{runId}/steps — ordered step list, no action content.
    // Same freshness requirement as getRun (FR-020, SC-009).
    getRunSteps: builder.query<PaginatedEnvelope<StepSummary>, string>({
      query: (runId) => `/agent-runs/${runId}/steps`,
      providesTags: (_result, _error, runId) => [{ type: 'RunSteps', id: runId }],
      forceRefetch: () => true,
    }),

    // GET /agent-runs/{runId}/steps/{stepId}/actions — lazy-expand call for
    // a step node's top-level actions (FR-011).
    getStepActions: builder.query<PaginatedEnvelope<ActionSummary>, { runId: string; stepId: string }>({
      query: ({ runId, stepId }) => `/agent-runs/${runId}/steps/${stepId}/actions`,
      providesTags: (_result, _error, { stepId }) => [{ type: 'RunActions', id: stepId }],
    }),

    // GET /agent-runs/{runId}/actions/{actionId}/children — lazy-expand call
    // for an action node's nested children (FR-002, FR-011).
    getActionChildren: builder.query<PaginatedEnvelope<ActionSummary>, { runId: string; actionId: string }>({
      query: ({ runId, actionId }) => `/agent-runs/${runId}/actions/${actionId}/children`,
      providesTags: (_result, _error, { actionId }) => [{ type: 'RunActions', id: actionId }],
    }),
  }),
});

export const {
  useGetRunQuery,
  useGetRunStepsQuery,
  useGetStepActionsQuery,
  useGetActionChildrenQuery,
} = runApi;
