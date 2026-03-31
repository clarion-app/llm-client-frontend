import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQuery } from './baseQuery';
import { LanguageModelType } from './types';

export const modelApi = createApi({
  reducerPath: 'llm-client-modelApi',
  baseQuery: baseQuery(),
  tagTypes: ['LanguageModel'],
  endpoints: (builder) => ({
    getModels: builder.query<LanguageModelType[], string>({
      query: (server_id) => `/server/${server_id}/model`,
      providesTags: ['LanguageModel'],
    }),
    getAllModels: builder.query<LanguageModelType[], void>({
      query: () => `/model`,
      providesTags: ['LanguageModel'],
    }),
  }),
});

export const {
  useGetModelsQuery,
  useGetAllModelsQuery,
} = modelApi;