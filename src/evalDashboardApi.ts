import { createApi } from '@reduxjs/toolkit/query/react';
import { createBaseQuery } from '@clarion-app/frontend-base';
import { backend } from './config';
import type { AgentQualityOverview } from './types';

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
  }),
});

export const { useGetOverviewQuery } = evalDashboardApi;
