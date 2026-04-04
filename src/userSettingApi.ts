import { createApi } from '@reduxjs/toolkit/query/react';
import { createBaseQuery } from '@clarion-app/frontend-base';
import { backend } from './config';
import { UserSettingType } from './types';

export const userSettingApi = createApi({
  reducerPath: 'llm-client-userSettingApi',
  baseQuery: createBaseQuery({ routePrefix: '/api/clarion-app/llm-client', backendConfig: backend }),
  tagTypes: ['UserSetting'],
  endpoints: (builder) => ({
    getUserSetting: builder.query<UserSettingType, null>({
      query: () => '/user-setting',
      providesTags: ['UserSetting'],
    }),
    updateUserSetting: builder.mutation<UserSettingType, UserSettingType>({
      query: (setting) => ({
        url: '/user-setting',
        method: 'PUT',
        body: setting,
      }),
      invalidatesTags: ['UserSetting'],
    }),
  }),
});

export const {
  useGetUserSettingQuery,
  useUpdateUserSettingMutation,
} = userSettingApi;
