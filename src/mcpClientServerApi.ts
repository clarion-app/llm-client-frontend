import { createApi } from '@reduxjs/toolkit/query/react';
import { createBaseQuery } from '@clarion-app/frontend-base';
import { backend } from './config';
import { McpClientServerType, McpClientServerStatusType } from './types';

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
  }),
});

export const {
  useGetMcpClientServersQuery,
  useGetMcpClientServerQuery,
} = mcpClientServerApi;
