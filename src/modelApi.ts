import { createApi, fetchBaseQuery, BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query/react';
import { backend } from '.';
import { LanguageModelType } from './types';

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

export const modelApi = createApi({
  reducerPath: 'llm-client-modelApi',
  baseQuery: baseQuery(),
  tagTypes: ['LanguageModel'],
  endpoints: (builder) => ({
    getModels: builder.query<LanguageModelType[], string>({
      query: (server_id) => `/server/${server_id}/model`,
      providesTags: ['LanguageModel'],
    }),
  }),
});

export const {
  useGetModelsQuery,
} = modelApi;