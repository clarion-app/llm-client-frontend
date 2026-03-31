import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQuery } from './baseQuery';
import { ConversationType } from './types';

export const conversationApi = createApi({
  reducerPath: 'llm-client-conversationApi',
  baseQuery: baseQuery(),
  tagTypes: ['Conversation'],
  endpoints: (builder) => ({
    getConversations: builder.query({
      query: () => `/conversation`,
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
    createCommandConversation: builder.mutation<ConversationType, { command: string }>({
      query: (payload) => ({
        url: '/command-conversation',
        method: 'POST',
        body: payload,
      }),
      invalidatesTags: ['Conversation'],
    }),
    confirmApiCall: builder.mutation<void, { conversationId: string; message_id: string; approved: boolean }>({
      query: ({ conversationId, message_id, approved }) => ({
        url: `/conversation/${conversationId}/confirm-api-call`,
        method: 'POST',
        body: { message_id, approved },
      }),
      invalidatesTags: ['Conversation'],
    }),
  }),
});

export const {
  useCreateConversationMutation,
  useDeleteConversationMutation,
  useGetConversationsQuery,
  useCreateCommandConversationMutation,
  useConfirmApiCallMutation,
} = conversationApi;