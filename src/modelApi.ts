import { createApi } from '@reduxjs/toolkit/query/react';
import { createBaseQuery } from '@clarion-app/frontend-base';
import { backend } from './config';
import { LanguageModelType } from './types';

export const modelApi = createApi({
  reducerPath: 'llm-client-modelApi',
  baseQuery: createBaseQuery({ routePrefix: '/api/clarion-app/llm-client', backendConfig: backend }),
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