import { createApi } from '@reduxjs/toolkit/query/react';
import { createBaseQuery } from '@clarion-app/frontend-base';
import { backend } from './config';
import {
  RoleAssignmentsType,
  SetRoleAssignmentRequest,
  ClearRoleAssignmentRequest,
} from './types';

export const roleAssignmentApi = createApi({
  reducerPath: 'llm-client-roleAssignmentApi',
  baseQuery: createBaseQuery({ routePrefix: '/api/clarion-app/llm-client', backendConfig: backend }),
  tagTypes: ['RoleAssignment'],
  endpoints: (builder) => ({
    getRoleAssignments: builder.query<RoleAssignmentsType, null>({
      query: () => '/role-assignment',
      providesTags: ['RoleAssignment'],
    }),
    setRoleAssignment: builder.mutation<RoleAssignmentsType, SetRoleAssignmentRequest>({
      query: (request) => ({
        url: '/role-assignment',
        method: 'PUT',
        body: request,
      }),
      invalidatesTags: ['RoleAssignment'],
    }),
    clearRoleAssignment: builder.mutation<RoleAssignmentsType, ClearRoleAssignmentRequest>({
      query: (request) => ({
        url: '/role-assignment',
        method: 'DELETE',
        body: request,
      }),
      invalidatesTags: ['RoleAssignment'],
    }),
  }),
});

export const {
  useGetRoleAssignmentsQuery,
  useSetRoleAssignmentMutation,
  useClearRoleAssignmentMutation,
} = roleAssignmentApi;
