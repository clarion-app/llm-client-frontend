import { createApi } from '@reduxjs/toolkit/query/react';
import { createBaseQuery } from '@clarion-app/frontend-base';
import { backend } from './config';
import {
  McpClientServerType,
  McpClientServerStatusType,
  McpConnectionTestType,
  McpCreateServerRequest,
  McpServerConnectionFields,
} from './types';

/**
 * store()'s 201 response shape (McpClientServerController::store()) —
 * distinct from McpClientServerType (index()'s shape) since a freshly
 * created server has no status row yet at all.
 */
export interface McpCreateServerResponseType {
  id: string;
  name: string;
  transport: McpClientServerType['transport'];
  scope: McpClientServerType['scope'];
  status: 'pending';
}

/**
 * testConnection()'s 202 response shape.
 */
export interface McpTestConnectionStartedType {
  id: string;
  status: 'pending';
}

/**
 * replaceCredential()'s 200 response shape (contracts/credential-replace-
 * api.md) -- McpClientServerController::serverSummary()'s plain 4-field
 * shape, deliberately not McpCreateServerResponseType (no `status` field
 * at all; this endpoint's response is the older, unaugmented shape
 * index()'s status fields were never folded into, per D7/T045's own
 * choice to leave serverSummary() unchanged).
 */
export interface McpServerSummaryType {
  id: string;
  name: string;
  transport: McpClientServerType['transport'];
  scope: McpClientServerType['scope'];
}

/**
 * show()'s response shape (McpClientServerController::serverDetail()) —
 * distinct from index()'s flat McpClientServerType: status is nested and
 * cached tools are included. Not yet rendered by any US1 component (the
 * list view only needs getMcpClientServers), but typed accurately now so
 * a later phase's detail view has the real shape to build against.
 */
export interface McpClientServerDetailType {
  id: string;
  name: string;
  transport: McpClientServerType['transport'];
  scope: McpClientServerType['scope'];
  status: McpClientServerStatusType;
  tools: Array<{
    name: string;
    description: string | null;
    input_schema: Record<string, unknown>;
    synthetic_operation_id: string;
  }>;
}

/**
 * RTK Query slice for the MCP client server management screen
 * (119-mcp-server-management-ui). This phase (US1) adds only the two
 * read-only queries the list/detail screen needs — list+single. Later
 * phases (US2/US3/US4) extend this same file with mutations
 * (createMcpClientServer, testMcpClientConnection,
 * getMcpClientConnectionTest, replaceMcpClientServerCredential,
 * deleteMcpClientServer) rather than creating a second slice, per
 * plan.md's Project Structure (one file, all endpoints).
 */
export const mcpClientServerApi = createApi({
  reducerPath: 'llm-client-mcpClientServerApi',
  baseQuery: createBaseQuery({ routePrefix: '/api/clarion-app/llm-client', backendConfig: backend }),
  tagTypes: ['McpClientServer'],
  endpoints: (builder) => ({
    getMcpClientServers: builder.query<McpClientServerType[], void>({
      query: () => '/mcp-client-server',
      providesTags: (result) =>
        result
          ? [...result.map((server) => ({ type: 'McpClientServer' as const, id: server.id })), { type: 'McpClientServer' as const, id: 'LIST' }]
          : [{ type: 'McpClientServer' as const, id: 'LIST' }],
    }),
    getMcpClientServer: builder.query<McpClientServerDetailType, string>({
      query: (id) => `/mcp-client-server/${id}`,
      providesTags: (_result, _error, id) => [{ type: 'McpClientServer' as const, id }],
    }),
    // US2: creates the server proper -- only ever called after an
    // explicit save, never as a side effect of testing a connection
    // (FR-004/FR-012 -- testMcpClientConnection below never touches this
    // endpoint at all).
    createMcpClientServer: builder.mutation<McpCreateServerResponseType, McpCreateServerRequest>({
      query: (server) => ({
        url: '/mcp-client-server',
        method: 'POST',
        body: server,
      }),
      invalidatesTags: [{ type: 'McpClientServer' as const, id: 'LIST' }],
    }),
    // US2: starts a connection test without creating or touching any
    // mcp_client_servers row (D3/D4) -- never invalidates the
    // McpClientServer tag, since nothing here is a server.
    testMcpClientConnection: builder.mutation<McpTestConnectionStartedType, McpServerConnectionFields>({
      query: (connection) => ({
        url: '/mcp-client-server/test-connection',
        method: 'POST',
        body: connection,
      }),
    }),
    // Polled by AddMcpServerForm's own useGetMcpClientConnectionTestQuery
    // call, which passes RTK Query's built-in `pollingInterval: 2000`
    // only while it still holds a pending result (and omits it once the
    // row goes terminal) -- faster than getMcpClientServers' own
    // ServerStatus-style polling since this one blocks a foreground,
    // actively-waited-on action rather than a background refresh
    // (research.md D2, plan.md Performance Goals).
    getMcpClientConnectionTest: builder.query<McpConnectionTestType, string>({
      query: (id) => `/mcp-client-server/test-connection/${id}`,
    }),
    // US3 (D7): a narrow, single-field replace -- the request body is
    // exactly { credential }, never any other server field, mirroring
    // the backend endpoint's own structural guarantee (contracts/
    // credential-replace-api.md). Invalidates only this one server's own
    // tag, which getMcpClientServers' own providesTags already includes
    // per server, so the affected card reflects the transition (e.g.
    // auth_failed -> reachable once the dispatched refresh job runs)
    // without a manual page refresh.
    replaceMcpClientServerCredential: builder.mutation<McpServerSummaryType, { id: string; credential: string }>({
      query: ({ id, credential }) => ({
        url: `/mcp-client-server/${id}/credential`,
        method: 'PATCH',
        body: { credential },
      }),
      invalidatesTags: (_result, _error, { id }) => [{ type: 'McpClientServer' as const, id }],
    }),
    // US4 (D8): a plain soft-delete -- production-code-correct already
    // (SoftDeletingScope excludes a deleted server's tools everywhere),
    // this endpoint's only job is to remove the server from the caller's
    // own list, so invalidating the LIST tag is enough to make it
    // disappear without a manual refresh.
    deleteMcpClientServer: builder.mutation<void, string>({
      query: (id) => ({
        url: `/mcp-client-server/${id}`,
        method: 'DELETE',
      }),
      invalidatesTags: [{ type: 'McpClientServer' as const, id: 'LIST' }],
    }),
  }),
});

export const {
  useGetMcpClientServersQuery,
  useGetMcpClientServerQuery,
  useCreateMcpClientServerMutation,
  useTestMcpClientConnectionMutation,
  useGetMcpClientConnectionTestQuery,
  useReplaceMcpClientServerCredentialMutation,
  useDeleteMcpClientServerMutation,
} = mcpClientServerApi;
