import { createApi } from '@reduxjs/toolkit/query/react';
import { createBaseQuery } from '@clarion-app/frontend-base';
import { backend } from './config';
import type { RunSummary, StepSummary, ActionSummary, ActionDetail, PaginatedEnvelope, ArrangementResponse } from './types';

export const runApi = createApi({
  reducerPath: 'llm-client-runApi',
  baseQuery: createBaseQuery({ routePrefix: '/api/clarion-app/llm-client', backendConfig: backend }),
  tagTypes: ['Run', 'RunList', 'RunSteps', 'RunActions', 'Arrangement'],
  endpoints: (builder) => ({
    // GET /agent-runs — the caller's own runs, most recent first, paginated
    // (US6, FR-024/FR-025). The entry point for finding a run with no
    // visible triggering message (RunsList.tsx).
    getRuns: builder.query<PaginatedEnvelope<RunSummary>, void>({
      query: () => '/agent-runs',
      providesTags: ['RunList'],
    }),

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
    // Same freshness requirement as getRun (FR-020, SC-009). `page` is
    // optional (default/page-1 omits the query param entirely, keeping page
    // 1 its own distinct RTK Query cache entry from page 2+, matching prior
    // URLs so existing test mocks keyed on the bare path still match) —
    // FR-012: a run with more than one page of steps must remain fully
    // reachable, not just its first `per_page` (backend default 100, cap
    // 200 — contracts/run-read-api.md).
    getRunSteps: builder.query<PaginatedEnvelope<StepSummary>, { runId: string; page?: number }>({
      query: ({ runId, page }) => `/agent-runs/${runId}/steps${page && page > 1 ? `?page=${page}` : ''}`,
      providesTags: (_result, _error, { runId }) => [{ type: 'RunSteps', id: runId }],
      forceRefetch: () => true,
    }),

    // GET /agent-runs/{runId}/steps/{stepId}/actions — lazy-expand call for
    // a step node's top-level actions (FR-011). See getRunSteps above for
    // the `page` convention (FR-012, backend default 50, cap 100).
    getStepActions: builder.query<PaginatedEnvelope<ActionSummary>, { runId: string; stepId: string; page?: number }>({
      query: ({ runId, stepId, page }) =>
        `/agent-runs/${runId}/steps/${stepId}/actions${page && page > 1 ? `?page=${page}` : ''}`,
      providesTags: (_result, _error, { stepId }) => [{ type: 'RunActions', id: stepId }],
    }),

    // GET /agent-runs/{runId}/actions/{actionId}/children — lazy-expand call
    // for an action node's nested children (FR-002, FR-011). See
    // getRunSteps above for the `page` convention (FR-012, backend default
    // 50, cap 100).
    getActionChildren: builder.query<PaginatedEnvelope<ActionSummary>, { runId: string; actionId: string; page?: number }>({
      query: ({ runId, actionId, page }) =>
        `/agent-runs/${runId}/actions/${actionId}/children${page && page > 1 ? `?page=${page}` : ''}`,
      providesTags: (_result, _error, { actionId }) => [{ type: 'RunActions', id: actionId }],
    }),

    // GET /agent-runs/{runId}/actions/{actionId} — the single selected
    // action's full detail, including `content`/`content_truncated` (US2,
    // FR-005, FR-006, FR-007). The only query on this file that returns
    // content.
    getActionDetail: builder.query<ActionDetail, { runId: string; actionId: string }>({
      query: ({ runId, actionId }) => `/agent-runs/${runId}/actions/${actionId}`,
      providesTags: (_result, _error, { actionId }) => [{ type: 'RunActions', id: actionId }],
    }),

    // GET /agent-runs/{runId}/arrangement — the full shape of the
    // multi-agent collaboration rooted at this run (106-multi-agent-run-view,
    // US1, contracts/arrangement-api.md §1): entry-point run, every
    // transitively-reachable delegation, and a RunSummary for every run
    // referenced. One bounded, non-paginated fetch (research.md D5) — no
    // page/per_page, unlike the step/action endpoints above. `Arrangement`
    // tagged by runId — DelegationUpdated's future handler (T030) and
    // RunUpdated's extended handler (T031) both invalidate/patch this tag.
    getRunArrangement: builder.query<ArrangementResponse, string>({
      query: (runId) => `/agent-runs/${runId}/arrangement`,
      providesTags: (_result, _error, runId) => [{ type: 'Arrangement', id: runId }],
    }),
  }),
});

export const {
  useGetRunsQuery,
  useGetRunQuery,
  useGetRunStepsQuery,
  useGetStepActionsQuery,
  useGetActionChildrenQuery,
  useGetActionDetailQuery,
  useGetRunArrangementQuery,
  useLazyGetRunStepsQuery,
  useLazyGetStepActionsQuery,
  useLazyGetActionChildrenQuery,
} = runApi;
