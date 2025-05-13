import { createApi, fetchBaseQuery, BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query/react';
import { backend } from '.';
import { MessageType } from './types';

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

export const messageApi = createApi({
    reducerPath: 'llm-client-messageApi',
    baseQuery: baseQuery(),
    tagTypes: ['Message'],
    endpoints: (builder) => ({
        getMessages: builder.query<any, string>({
            query: (conversation_id) => `/conversation/${conversation_id}/message`,
            providesTags: (result: { id: string }[] | undefined) => {
                return result
                    ? [...result.map(({ id }) => ({ type: 'Message' as const, id })), 'Message']
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
                        const messageToUpdate = draftMessages.find((m: { id: any; }) => m.id === message.id);
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