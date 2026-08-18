import React from 'react';
import { McpClientServerType } from './types';
import { McpServerCard } from './McpServerCard';

interface McpServerListProps {
  servers: McpClientServerType[];
}

/**
 * McpServerList — renders one McpServerCard per configured server
 * (119-mcp-server-management-ui, US1 Acceptance Scenario 1). Each card's
 * status is entirely its own — this component does no cross-server
 * aggregation of any kind, so one server's failure never affects another's
 * rendering.
 */
export function McpServerList({ servers }: McpServerListProps): React.ReactElement {
  return (
    <div data-testid="mcp-server-list">
      {servers.map((server) => (
        <McpServerCard key={server.id} server={server} />
      ))}
    </div>
  );
}

export default McpServerList;
