import { createApi } from '@reduxjs/toolkit/query/react';
import { createBaseQuery } from '@clarion-app/frontend-base';
import { backend } from './config';
import { CodingWorkspaceType, FlatPaginatedEnvelope } from './types';

/**
 * POST coding-project's 201 response shape (CodingProjectController::
 * store(), contracts/reused-endpoints.md) -- the plain, unpaginated
 * project row, distinct from CodingWorkspaceType only in that a freshly
 * created project's own current-request `reachable` is not part of
 * store()'s response at all (it is recomputed the next time index() is
 * called, since createCodingProject invalidates the LIST tag below).
 */
export interface CreateCodingProjectRequest {
  name: string;
  root_path: string;
  test_command?: string | null;
}

/**
 * RTK Query slice for the workspace browser (122-workspace-browser-ui).
 * US1 added the one read-only query the browser needs -- getCodingProjects.
 * US2 (this phase) adds the three mutations that make the existing,
 * unmodified spec-112/spec-121 endpoints reachable from the browser --
 * createCodingProject, updateWorkspaceConfirmationSetting, and
 * deleteCodingProject (contracts/reused-endpoints.md: zero backend
 * changes, all three calls hit CodingProjectController exactly as it
 * exists today). US3 extends this same file again with the
 * change-history query, rather than creating a second slice, mirroring
 * mcpClientServerApi.ts's own single-file-per-feature precedent.
 */
export const workspaceApi = createApi({
  reducerPath: 'llm-client-workspaceApi',
  baseQuery: createBaseQuery({ routePrefix: '/api/clarion-app/llm-client', backendConfig: backend }),
  tagTypes: ['CodingWorkspace'],
  endpoints: (builder) => ({
    // page is sent only when > 1 (T006/research.md D4's convention,
    // mirroring runApi.ts) so the default/first-page request shape never
    // changes and existing cache keys/tests are unaffected by adding
    // pagination.
    getCodingProjects: builder.query<FlatPaginatedEnvelope<CodingWorkspaceType>, { page?: number } | void>({
      query: (args) => {
        const page = args?.page;
        return page && page > 1 ? `/coding-project?page=${page}` : '/coding-project';
      },
      providesTags: (result) =>
        result
          ? [
              ...result.data.map((workspace) => ({ type: 'CodingWorkspace' as const, id: workspace.id })),
              { type: 'CodingWorkspace' as const, id: 'LIST' },
            ]
          : [{ type: 'CodingWorkspace' as const, id: 'LIST' }],
    }),
    // US2/AS3 -- reuses store() unmodified (contracts/reused-endpoints.md).
    // Invalidates the LIST tag only so the new workspace appears in the
    // browser without a manual refresh.
    createCodingProject: builder.mutation<CodingWorkspaceType, CreateCodingProjectRequest>({
      query: (project) => ({
        url: '/coding-project',
        method: 'POST',
        body: project,
      }),
      invalidatesTags: [{ type: 'CodingWorkspace' as const, id: 'LIST' }],
    }),
    // US2/AS1-2/FR-004/SC-002 -- reuses updateConfirmationSetting()
    // unmodified (contracts/reused-endpoints.md); AgentLoopService already
    // re-reads confirmation_relaxed fresh on every call, so the immediate
    // effect is a property of the backend this mutation calls, not of
    // anything added here. Invalidates only this one workspace's own tag
    // so its row reflects the new state without a manual refresh.
    updateWorkspaceConfirmationSetting: builder.mutation<CodingWorkspaceType, { id: string; relaxed: boolean }>({
      query: ({ id, relaxed }) => ({
        url: `/coding-project/${id}/confirmation-setting`,
        method: 'PATCH',
        body: { relaxed },
      }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'CodingWorkspace' as const, id }],
    }),
    // US2/AS3 -- reuses destroy() unmodified (contracts/reused-endpoints.md,
    // a soft delete, ownership-checked). Invalidates the LIST tag so the
    // removed workspace disappears from the browser without a manual
    // refresh; the row's own per-id tag is not separately invalidated
    // since the row itself is gone from the list, mirroring
    // deleteMcpClientServer's own precedent.
    deleteCodingProject: builder.mutation<void, string>({
      query: (id) => ({
        url: `/coding-project/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: [{ type: 'CodingWorkspace' as const, id: 'LIST' }],
    }),
  }),
});

export const {
  useGetCodingProjectsQuery,
  useCreateCodingProjectMutation,
  useUpdateWorkspaceConfirmationSettingMutation,
  useDeleteCodingProjectMutation,
} = workspaceApi;
