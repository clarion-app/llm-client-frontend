import { createApi } from '@reduxjs/toolkit/query/react';
import { createBaseQuery } from '@clarion-app/frontend-base';
import { backend } from './config';
import { ServerType } from './types';
import { serverStatusApi } from './serverStatusApi';
import { modelApi } from './modelApi';

export const serverApi = createApi({
  reducerPath: 'llm-client-serverApi',
  baseQuery: createBaseQuery({ routePrefix: '/api/clarion-app/llm-client', backendConfig: backend }),
  tagTypes: ['LLMServer'],
  endpoints: (builder) => ({
    getServers: builder.query({
      query: () => '/server',
      providesTags: ['LLMServer'],
    }),
    getServer: builder.query({
      query: (id: string) => `/server/${id}`,
      providesTags: ['LLMServer'],
    }),
    updateServer: builder.mutation<ServerType, { id: string; server: Partial<ServerType> }>({
      query: ({ id, server }) => ({
        url: `/server/${id}`,
        method: 'PUT',
        body: server,
      }),
      invalidatesTags: ['LLMServer'],
      onQueryStarted: async (_arg, { dispatch, queryFulfilled }) => {
        try {
          await queryFulfilled;
          // Cross-slice invalidation: ServerStatus and LanguageModel belong
          // to different createApi instances (serverStatusApi, modelApi).
          // RTK Query resolves tags within one API only.
          dispatch(serverStatusApi.util.invalidateTags(['ServerStatus']));
          dispatch(modelApi.util.invalidateTags(['LanguageModel']));
        } catch {
          // Mutation failed — skip cross-slice invalidation.
        }
      },
    }),
    deleteServer: builder.mutation<void, string>({
      query: (id) => ({
        url: `/server/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['LLMServer'],
      onQueryStarted: async (_arg, { dispatch, queryFulfilled }) => {
        try {
          await queryFulfilled;
          // Cross-slice invalidation.
          dispatch(serverStatusApi.util.invalidateTags(['ServerStatus']));
          dispatch(modelApi.util.invalidateTags(['LanguageModel']));
        } catch {
          // Mutation failed — skip cross-slice invalidation.
        }
      },
    }),
    createServer: builder.mutation<ServerType, Partial<ServerType>>({
      query: (server) => ({
        url: '/server',
        method: 'POST',
        body: server,
      }),
      invalidatesTags: ['LLMServer'],
      onQueryStarted: async (_arg, { dispatch, queryFulfilled }) => {
        try {
          await queryFulfilled;
          // Cross-slice invalidation.
          dispatch(serverStatusApi.util.invalidateTags(['ServerStatus']));
          dispatch(modelApi.util.invalidateTags(['LanguageModel']));
        } catch {
          // Mutation failed — skip cross-slice invalidation.
        }
      },
    }),
  }),
});

export const {
  useGetServersQuery,
  useGetServerQuery,
  useCreateServerMutation,
  useUpdateServerMutation,
  useDeleteServerMutation,
} = serverApi;