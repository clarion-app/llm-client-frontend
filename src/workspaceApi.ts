import { createApi } from '@reduxjs/toolkit/query/react';
import { createBaseQuery } from '@clarion-app/frontend-base';
import { backend } from './config';
import { CodingWorkspaceType, FlatPaginatedEnvelope } from './types';

/**
 * RTK Query slice for the workspace browser (122-workspace-browser-ui).
 * This phase (US1) adds only the one read-only query the browser needs --
 * getCodingProjects. Later phases (US2/US3) extend this same file with the
 * confirmation-setting/remove/create mutations and the change-history
 * query, rather than creating a second slice, mirroring
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
  }),
});

export const { useGetCodingProjectsQuery } = workspaceApi;
