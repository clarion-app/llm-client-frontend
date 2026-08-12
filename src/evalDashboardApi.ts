import { createApi } from '@reduxjs/toolkit/query/react';
import { createBaseQuery } from '@clarion-app/frontend-base';
import { backend } from './config';
import type {
  AgentQualityOverview,
  CaseDetail,
  EvalCaseResultSummary,
  EvalRunDetail,
  LaravelPaginated,
} from './types';

export const evalDashboardApi = createApi({
  reducerPath: 'llm-client-evalDashboardApi',
  baseQuery: createBaseQuery({ routePrefix: '/api/clarion-app/llm-client', backendConfig: backend }),
  tagTypes: ['EvalDashboard', 'EvalRunDetail', 'EvalRunCases', 'EvalCaseDetail'],
  endpoints: (builder) => ({
    // GET /agent-eval-dashboard/{agentLabel} — an agent's current pass
    // rate, trend, and persistent failures in one call (US1).
    getOverview: builder.query<AgentQualityOverview, { agentLabel: string; trendWindowDays?: number }>({
      query: ({ agentLabel, trendWindowDays }) =>
        `/agent-eval-dashboard/${agentLabel}${trendWindowDays ? `?trend_window_days=${trendWindowDays}` : ''}`,
      providesTags: (_result, _error, { agentLabel }) => [{ type: 'EvalDashboard', id: agentLabel }],
    }),

    // GET /eval-runs/{runId} — the existing, unmodified run detail
    // endpoint: status, outcome counts, and consumption for one run (US2
    // breakdown header).
    getRunDetail: builder.query<EvalRunDetail, string>({
      query: (runId) => `/eval-runs/${runId}`,
      providesTags: (_result, _error, runId) => [{ type: 'EvalRunDetail', id: runId }],
    }),

    // GET /eval-runs/{runId}/cases — the existing, unmodified paginated
    // per-case list (US2 breakdown body). `page` optional, matching
    // runApi.ts's own getRunSteps convention.
    getRunCases: builder.query<LaravelPaginated<EvalCaseResultSummary>, { runId: string; page?: number }>({
      query: ({ runId, page }) => `/eval-runs/${runId}/cases${page && page > 1 ? `?page=${page}` : ''}`,
      providesTags: (_result, _error, { runId }) => [{ type: 'EvalRunCases', id: runId }],
    }),

    // GET /eval-runs/{runId}/cases/{caseResultId}/detail — this feature's
    // new case-detail composition: given/expected_behavior/produced
    // response/scoring reasoning (US2).
    getCaseDetail: builder.query<CaseDetail, { runId: string; caseResultId: string }>({
      query: ({ runId, caseResultId }) => `/eval-runs/${runId}/cases/${caseResultId}/detail`,
      providesTags: (_result, _error, { caseResultId }) => [{ type: 'EvalCaseDetail', id: caseResultId }],
    }),
  }),
});

export const {
  useGetOverviewQuery,
  useGetRunDetailQuery,
  useGetRunCasesQuery,
  useLazyGetRunCasesQuery,
  useGetCaseDetailQuery,
} = evalDashboardApi;
