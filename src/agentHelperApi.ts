import { createApi } from '@reduxjs/toolkit/query/react';
import { createBaseQuery } from '@clarion-app/frontend-base';
import { backend } from './config';
import type { AgentHelper } from './types';

/**
 * Sub-agent helper assignments (097-subagent-model, contracts/
 * frontend-subagent-model.md §2). `listHelpers`/`assignHelper` cover the two
 * backend endpoints US1+US2 (Phase 3) add — `GET`/`POST agents/{id}/helpers`.
 * `listHelperHierarchy` (`GET agents/{id}/helpers/hierarchy`, Phase 4/US3)
 * and `removeHelper` (`DELETE agents/{id}/helpers/{helperAgentId}`, Phase
 * 5/US4) are later additions to this same file, once their backend endpoints
 * land — not added yet.
 *
 * Both tag types are declared now, even though `AgentHelperHierarchy` has no
 * endpoint using it yet, for forward compatibility with those later phases.
 */
export const agentHelperApi = createApi({
  reducerPath: 'llm-client-agentHelperApi',
  baseQuery: createBaseQuery({ routePrefix: '/api/clarion-app/llm-client', backendConfig: backend }),
  tagTypes: ['AgentHelpers', 'AgentHelperHierarchy'],
  endpoints: (builder) => ({
    listHelpers: builder.query<{ data: AgentHelper[] }, { agentId: string }>({
      query: ({ agentId }) => `/agents/${agentId}/helpers`,
      providesTags: ['AgentHelpers'],
    }),
    assignHelper: builder.mutation<AgentHelper, { agentId: string; helperAgentId: string }>({
      query: ({ agentId, helperAgentId }) => ({
        url: `/agents/${agentId}/helpers`,
        method: 'POST',
        body: { helper_agent_id: helperAgentId },
      }),
      invalidatesTags: ['AgentHelpers', 'AgentHelperHierarchy'],
    }),
  }),
});

export const { useListHelpersQuery, useAssignHelperMutation } = agentHelperApi;
