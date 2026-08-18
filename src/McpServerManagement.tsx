import React from 'react';
import { useGetMcpClientServersQuery } from './mcpClientServerApi';
import { McpServerList } from './McpServerList';

/**
 * McpServerManagement — routed screen for the MCP (external tool) server
 * management UI (119-mcp-server-management-ui, US1). Zero required props
 * — the manifest routes /clarion-app/llm-client/mcp-servers ->
 * <McpServerManagement /> with no props at all, exactly mirroring
 * ModelSetup.tsx's own shape (contracts/frontend-manifest-wiring.md's
 * Component contract) rather than RunDiagram's original, since-fixed
 * required-prop defect (spec 070).
 *
 * Owns its own top-level query (useGetMcpClientServersQuery), exactly
 * like ModelSetup owns useGetServersQuery. Renders McpServerList when one
 * or more servers are configured, or an inline, MCP-specific empty state
 * otherwise (Acceptance Scenario 4) — deliberately not the existing
 * EmptyState.tsx, whose copy is ModelSetup-specific ("Connect an
 * OpenAI-compatible API...") and does not apply to MCP servers.
 */
export function McpServerManagement(): React.ReactElement {
  const { data: servers = [], isLoading } = useGetMcpClientServersQuery();

  if (isLoading) {
    return (
      <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-secondary, #6b7280)' }}>
        Loading...
      </div>
    );
  }

  return (
    <div className="mcp-server-management" data-testid="mcp-server-management">
      <h1 style={{ margin: '0 0 1.5rem', fontSize: '1.5rem', fontWeight: 700 }}>MCP Servers</h1>

      {servers.length === 0 ? (
        <div
          data-testid="mcp-server-management-empty-state"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '3rem 1rem',
            textAlign: 'center',
            color: 'var(--text-secondary, #6b7280)',
          }}
        >
          <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.25rem', color: 'var(--text-primary, #111827)' }}>
            Add your first MCP server
          </h2>
          <p style={{ margin: 0, fontSize: '0.875rem' }}>
            Connect an external tool server so your agents can discover and use its tools.
          </p>
        </div>
      ) : (
        <McpServerList servers={servers} />
      )}
    </div>
  );
}

export default McpServerManagement;
