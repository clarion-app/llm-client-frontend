import { createApi } from '@reduxjs/toolkit/query/react';
import { createBaseQuery } from '@clarion-app/frontend-base';
import { backend } from './config';
import { modelApi } from './modelApi';
import { ServerStatusType } from './types';

export const serverStatusApi = createApi({
  reducerPath: 'llm-client-serverStatusApi',
  baseQuery: createBaseQuery({ routePrefix: '/api/clarion-app/llm-client', backendConfig: backend }),
  tagTypes: ['ServerStatus'],
  endpoints: (builder) => ({
    getServerStatuses: builder.query<ServerStatusType[], void>({
      query: () => '/server-status',
      providesTags: ['ServerStatus'],
    }),
    refreshServerModels: builder.mutation<ServerStatusType, string>({
      query: (server_id) => ({
        url: `/models/${server_id}/refresh`,
        method: 'POST',
      }),
      invalidatesTags: ['ServerStatus'],
      onQueryStarted: async (_arg, { dispatch, queryFulfilled }) => {
        try {
          await queryFulfilled;
          // Cross-slice invalidation: LanguageModel belongs to modelApi,
          // a different createApi instance. RTK Query resolves tags within
          // one API only, so `invalidatesTags: ['LanguageModel']` here
          // would be a silent no-op.
          dispatch(modelApi.util.invalidateTags(['LanguageModel']));
        } catch {
          // Mutation failed — skip cross-slice invalidation.
        }
      },
    }),
  }),
});

export const {
  useGetServerStatusesQuery,
  useRefreshServerModelsMutation,
} = serverStatusApi;
