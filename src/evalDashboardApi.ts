import { createApi } from '@reduxjs/toolkit/query/react';
import { createBaseQuery } from '@clarion-app/frontend-base';
import { backend } from './config';

export const evalDashboardApi = createApi({
  reducerPath: 'llm-client-evalDashboardApi',
  baseQuery: createBaseQuery({ routePrefix: '/api/clarion-app/llm-client', backendConfig: backend }),
  tagTypes: ['EvalDashboard', 'EvalRunDetail', 'EvalRunCases', 'EvalCaseDetail'],
  endpoints: () => ({}),
});
