import { createApi, fetchBaseQuery, BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query/react';
import { backend } from '.';
import { LaravelModelType } from '@clarion-app/types';

export interface ServerType extends LaravelModelType {
  name: string;
  server_url: string;
  token: string;
}

const rawBaseQuery = (baseUrl: string) => fetchBaseQuery({ 
  baseUrl: baseUrl,
  prepareHeaders: (headers) => {
      headers.set('Content-Type', 'application/json');
      headers.set('Authorization', 'Bearer ' + backend.token);
      return headers;
  }
});

function baseQuery(): BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> {
    return async (args, api, extraOptions) => {
        let result = await rawBaseQuery((await backend).url + '/api/clarion-app/llm-client')(args, api, extraOptions);
        return result;
    };
}

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