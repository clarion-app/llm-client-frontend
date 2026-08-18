import React, { useCallback, useState } from 'react';
import { useGetMcpClientServersQuery } from './mcpClientServerApi';
import { McpServerList } from './McpServerList';
import { AddMcpServerForm } from './AddMcpServerForm';

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
  const [showAddForm, setShowAddForm] = useState(false);

  const handleAddSuccess = useCallback(() => {
    // getMcpClientServers is already invalidated by createMcpClientServer's
    // own invalidatesTags -- the newly-saved server appears in the list
    // below without a page reload or any further action (US2 Acceptance
    // Scenario 3); this only collapses the form back down.
    setShowAddForm(false);
  }, []);

  if (isLoading) {
    return (
      <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-secondary, #6b7280)' }}>
        Loading...
      </div>
    );
  }

  return (
    <div className="mcp-server-management" data-testid="mcp-server-management">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>MCP Servers</h1>
        <button type="button" data-testid="mcp-server-add-toggle" onClick={() => setShowAddForm((prev) => !prev)}>
          {showAddForm ? 'Cancel' : 'Add server'}
        </button>
      </div>

      {showAddForm && <AddMcpServerForm onSuccess={handleAddSuccess} />}

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
