import { createApi } from '@reduxjs/toolkit/query/react';
import { createBaseQuery } from '@clarion-app/frontend-base';
import { backend } from './config';
import type { AgentShare, AgentSharePermission, InstallationUser } from './types';

/**
 * Agent-sharing grants (096-agent-sharing, contracts/
 * frontend-agent-sharing.md §2). `listShares`/`createShare` cover the two
 * new backend endpoints this phase (US1) adds — `GET`/`POST
 * agents/{id}/shares`. `revokeShare` (`DELETE
 * agents/{id}/shares/{recipientUserId}`) is Phase 5/US3's own addition to
 * this same file, not here.
 *
 * `listInstallationUsers` reuses the host app's own already-shipped,
 * already-authenticated `GET api/clarion/system/user` endpoint
 * (`backend/src/Controllers/UserController.php`'s `index()` action, routed
 * under the `api/clarion/system` prefix with `auth:api` middleware,
 * `backend/src/Routes.php`) rather than any new `llm-client` backend
 * endpoint. It is deliberately routed around this slice's own
 * `/api/clarion-app/llm-client` baseUrl: RTK Query's `fetchBaseQuery` joins
 * a *relative* query url onto `baseUrl`, but an *absolute* url (one
 * containing `://`) is passed through unchanged instead (`joinUrls`) — so
 * requesting `${backend.url}/api/clarion/system/user` bypasses
 * `routePrefix` entirely while still going through the exact same
 * `credentials`/CSRF-header handling `createBaseQuery` already applies to
 * every request, regardless of the target url.
 */
export const agentShareApi = createApi({
  reducerPath: 'llm-client-agentShareApi',
  baseQuery: createBaseQuery({ routePrefix: '/api/clarion-app/llm-client', backendConfig: backend }),
  tagTypes: ['AgentShares'],
  endpoints: (builder) => ({
    listShares: builder.query<{ data: AgentShare[] }, { agentId: string }>({
      query: ({ agentId }) => `/agents/${agentId}/shares`,
      providesTags: ['AgentShares'],
    }),
    createShare: builder.mutation<
      AgentShare,
      { agentId: string; recipientUserId: string; permission: AgentSharePermission }
    >({
      query: ({ agentId, recipientUserId, permission }) => ({
        url: `/agents/${agentId}/shares`,
        method: 'POST',
        body: { recipient_user_id: recipientUserId, permission },
      }),
      invalidatesTags: ['AgentShares'],
    }),
    listInstallationUsers: builder.query<InstallationUser[], void>({
      query: () => `${backend.url}/api/clarion/system/user`,
    }),
  }),
});

export const { useListSharesQuery, useCreateShareMutation, useListInstallationUsersQuery } = agentShareApi;
