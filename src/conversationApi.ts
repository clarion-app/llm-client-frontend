import { createApi, fetchBaseQuery, BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query/react';
import { backend } from '.';
import { ConversationType } from './types';

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

export const conversationApi = createApi({
  reducerPath: 'llm-client-conversationApi',
  baseQuery: baseQuery(),
  tagTypes: ['Conversation'],
  endpoints: (builder) => ({
    getConversations: builder.query({
      query: (user_id) => `/user/${user_id}/conversation`,
      providesTags: ['Conversation'],
    }),
    getConversation: builder.query({
      query: (id: string) => `/conversation/${id}`,
      providesTags: ['Conversation'],
    }),
    updateConversation: builder.mutation<ConversationType, { id: string; conversation: Partial<ConversationType> }>({
      query: ({ id, conversation }) => ({
        url: `/conversation/${id}`,
        method: 'PUT',
        body: conversation,
      }),
      invalidatesTags: ['Conversation'],
    }),
    deleteConversation: builder.mutation<void, string>({
      query: (id) => ({
        url: `/conversation/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['Conversation'],
    }),
    createConversation: builder.mutation<ConversationType, Partial<ConversationType>>({
      query: (conversation) => ({
        url: '/conversation',
        method: 'POST',
        body: conversation,
      }),
      invalidatesTags: ['Conversation'],
    }),
  }),
});

export const {
  useGetConversationsQuery,
} = conversationApi;