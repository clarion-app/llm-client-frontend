import { createApi } from '@reduxjs/toolkit/query/react';
import { createBaseQuery } from '@clarion-app/frontend-base';
import { backend } from './config';

export const runApi = createApi({
  reducerPath: 'llm-client-runApi',
  baseQuery: createBaseQuery({ routePrefix: '/api/clarion-app/llm-client', backendConfig: backend }),
  tagTypes: ['Run', 'RunList', 'RunSteps', 'RunActions'],
  endpoints: () => ({}),
});
