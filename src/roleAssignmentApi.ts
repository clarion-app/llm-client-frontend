import { createApi } from '@reduxjs/toolkit/query/react';
import { createBaseQuery } from '@clarion-app/frontend-base';
import { backend } from './config';
import {
  RoleAssignmentsType,
  RoleDescriptor,
  SetRoleAssignmentRequest,
  ClearRoleAssignmentRequest,
  RoleTestResultType,
  TestRoleRequest,
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
    setRoleAssignment: builder.mutation<RoleDescriptor, SetRoleAssignmentRequest>({
      query: (request) => ({
        url: '/role-assignment',
        method: 'PUT',
        body: request,
      }),
      invalidatesTags: ['RoleAssignment'],
    }),
    clearRoleAssignment: builder.mutation<RoleDescriptor, ClearRoleAssignmentRequest>({
      query: (request) => ({
        url: '/role-assignment',
        method: 'DELETE',
        body: request,
      }),
      invalidatesTags: ['RoleAssignment'],
    }),
    // Read-only exercise of the effective model — no cache invalidation,
    // since the endpoint writes nothing (FR-024a).
    testRole: builder.mutation<RoleTestResultType, TestRoleRequest>({
      query: (request) => ({
        url: '/role-assignment/test',
        method: 'POST',
        body: request,
      }),
    }),
  }),
});

export const {
  useGetRoleAssignmentsQuery,
  useSetRoleAssignmentMutation,
  useClearRoleAssignmentMutation,
  useTestRoleMutation,
} = roleAssignmentApi;
