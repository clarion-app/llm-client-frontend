import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQuery } from './baseQuery';
import { ServerType } from './types';

export const serverApi = createApi({
  reducerPath: 'llm-client-serverApi',
  baseQuery: baseQuery(),
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
    }),
    deleteServer: builder.mutation<void, string>({
      query: (id) => ({
        url: `/server/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['LLMServer'],
    }),
    createServer: builder.mutation<ServerType, Partial<ServerType>>({
      query: (server) => ({
        url: '/server',
        method: 'POST',
        body: server,
      }),
      invalidatesTags: ['LLMServer'],
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