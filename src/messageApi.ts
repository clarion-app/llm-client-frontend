import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQuery } from './baseQuery';
import { MessageType } from './types';

export const messageApi = createApi({
    reducerPath: 'llm-client-messageApi',
    baseQuery: baseQuery(),
    tagTypes: ['Message'],
    endpoints: (builder) => ({
        getMessages: builder.query<MessageType[], string>({
            query: (conversation_id) => `/conversation/${conversation_id}/message`,
            providesTags: (result) => {
                return result
                    ? [...result.filter((m) => m.id).map(({ id }) => ({ type: 'Message' as const, id: id! })), 'Message']
                    : ['Message']
            },
        }),
        getMessage: builder.query<MessageType, string>({
            query: (id) => `message/${id}`,
            providesTags: (_result, _error, id) => [{ type: 'Message', id }],
        }),
        deleteMessage: builder.mutation<void, string>({
            query: (id) => ({
                url: `message/${id}`,
                method: 'DELETE',
            }),
            invalidatesTags: (_result, _error, id) => [{ type: 'Message', id }],
        }),
        updateMessage: builder.mutation<MessageType, Partial<MessageType> & Pick<MessageType, 'id'>>({
            query: ({ id, ...patch }) => ({
                url: `message/${id}`,
                method: 'PATCH',
                body: patch,
            }),
            invalidatesTags: (_result, _error, { id }) => [{ type: 'Message', id }],
        }),
        createMessage: builder.mutation<MessageType, Partial<MessageType>>({
            query: (newMessage) => ({
                url: 'message',
                method: 'POST',
                body: newMessage,
            }),
            invalidatesTags: [{ type: 'Message' }],
        }),
        updateMessageLocally: builder.mutation({
            queryFn: (message) => {
                // Don't make an API call, just return a success response
                return { data: message };
            },
            onQueryStarted: (message, { dispatch }) => {
                // Update the local state when the mutation is triggered
                dispatch(
                    messageApi.util.updateQueryData('getMessages', message.conversation_id, (draftMessages) => {
                        const messageToUpdate = draftMessages.find((m: MessageType) => m.id === message.id);
                        if (messageToUpdate) {
                            messageToUpdate.content = message.content;
                            messageToUpdate.streaming = message.streaming;
                        }
                    })
                );
            },
        }),
    }),
})

export const { 
    useGetMessagesQuery,
    useGetMessageQuery,
    useDeleteMessageMutation,
    useUpdateMessageMutation,
    useCreateMessageMutation,
    useUpdateMessageLocallyMutation,
  } = messageApi;