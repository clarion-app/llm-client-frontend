import { createApi } from '@reduxjs/toolkit/query/react';
import { createBaseQuery } from '@clarion-app/frontend-base';
import { backend } from './config';
import { ConversationType, RunTaskBudgetRecord, TaskBudgetChange, TaskBudgetChangeResult, TaskBudgetResponse } from './types';

export const conversationApi = createApi({
  reducerPath: 'llm-client-conversationApi',
  baseQuery: createBaseQuery({ routePrefix: '/api/clarion-app/llm-client', backendConfig: backend }),
  tagTypes: ['Conversation', 'TaskBudget'],
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
    getTaskBudget: builder.query<TaskBudgetResponse, string>({
      query: (conversationId) => `/conversation/${conversationId}/task-budget`,
      providesTags: (_result, _error, conversationId) => [{ type: 'TaskBudget', id: conversationId }],
    }),
    updateTaskBudget: builder.mutation<TaskBudgetChangeResult, TaskBudgetChange>({
      query: ({ conversationId, ...change }) => ({
        url: `/conversation/${conversationId}/task-budget`,
        method: 'PATCH',
        body: change,
      }),
      invalidatesTags: (_result, _error, { conversationId }) => [{ type: 'TaskBudget', id: conversationId }],
    }),
    getRunTaskBudget: builder.query<RunTaskBudgetRecord, string>({
      query: (runId) => `/agent-runs/${runId}/task-budget`,
    }),
  }),
});

export const {
  useGetTaskBudgetQuery,
  useUpdateTaskBudgetMutation,
  useGetRunTaskBudgetQuery,
} = conversationApi;

export const {
  useCreateConversationMutation,
  useDeleteConversationMutation,
  useGetConversationsQuery,
  useCreateCommandConversationMutation,
  useConfirmApiCallMutation,
} = conversationApi;