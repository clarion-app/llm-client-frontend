import { createApi } from '@reduxjs/toolkit/query/react';
import { baseQuery } from './baseQuery';
import { UserSettingType } from './types';

export const userSettingApi = createApi({
  reducerPath: 'llm-client-userSettingApi',
  baseQuery: baseQuery(),
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
