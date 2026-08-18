import React, { useCallback, useState } from 'react';
import { McpClientServerStatusCategory, McpClientServerType } from './types';
import { McpCredentialReplaceForm } from './McpCredentialReplaceForm';
import { useDeleteMcpClientServerMutation } from './mcpClientServerApi';
import { ConfirmDialog } from './ConfirmDialog';

interface McpServerCardProps {
  server: McpClientServerType;
}

/**
 * McpServerCard — one configured MCP server's identity, health, and
 * approximate tool count (119-mcp-server-management-ui, US1).
 *
 * - Status badge covers all 5 connection_status categories with distinct,
 *   non-overlapping text — closing the exact FR-010 ambiguity that used
 *   to make an expired credential (auth_failed) indistinguishable from a
 *   server that is simply down (unreachable), and a misbehaving server
 *   (protocol_error) indistinguishable from either.
 * - Last-successful-contact time is rendered under its own label, never
 *   conflated with the current status badge (Acceptance Scenario 2) — a
 *   server can be currently unreachable while still showing when it was
 *   last known to work.
 * - Tool count is the approximate, currently-cached figure the backend's
 *   own status row carries (Acceptance Scenario 3), not a live count.
 */

const STATUS_LABELS: Record<McpClientServerStatusCategory, string> = {
  reachable: 'Connected',
  unreachable: 'Unreachable',
  auth_failed: 'Authentication Failed',
  protocol_error: 'Unexpected Response',
  unknown: 'Not Yet Checked',
};

const STATUS_COLORS: Record<McpClientServerStatusCategory, string> = {
  reachable: 'var(--text-success, #059669)',
  unreachable: 'var(--text-error, #dc2626)',
  auth_failed: 'var(--text-warning, #d97706)',
  protocol_error: 'var(--text-warning, #d97706)',
  unknown: 'var(--text-secondary, #6b7280)',
};

function formatLastReachable(lastReachableAt: string | null): string {
  if (!lastReachableAt) {
    return 'Never successfully contacted';
  }
  try {
    return `Last successful contact: ${new Date(lastReachableAt).toLocaleString()}`;
  } catch {
    return 'Last successful contact: unknown time';
  }
}

const TRANSPORT_LABELS: Record<McpClientServerType['transport'], string> = {
  streamable_http: 'HTTP',
  stdio: 'stdio',
};

interface McpServerRemoveConfirmProps {
  server: McpClientServerType;
  onDismiss: () => void;
}

/**
 * Calls useDeleteMcpClientServerMutation() -- kept in its own component,
 * mounted only once the user clicks "Remove", so McpServerCard itself
 * still calls no RTK Query hook directly unless a sub-widget requiring
 * one is actually rendered, mirroring McpCredentialReplaceForm's own
 * identical precedent (T050) and keeping every provider-less test case
 * from Phases 3/4/5 unchanged.
 */
function McpServerRemoveConfirm({ server, onDismiss }: McpServerRemoveConfirmProps): React.ReactElement {
  const [deleteMcpClientServer] = useDeleteMcpClientServerMutation();

  const handleConfirm = useCallback(() => {
    // D8: SoftDeletingScope already makes removal safe under use in
    // production -- this action only asks for confirmation (FR-013) and
    // fires the mutation; deleteMcpClientServer's own invalidatesTags
    // removes the server from the list without a manual refresh.
    deleteMcpClientServer(server.id);
    onDismiss();
  }, [deleteMcpClientServer, server.id, onDismiss]);

  return (
    <ConfirmDialog
      title={`Remove ${server.name}?`}
      message="Agents will no longer be able to use that server's tools. This can't be undone."
      confirmLabel="Remove"
      destructive
      onConfirm={handleConfirm}
      onCancel={onDismiss}
    />
  );
}

export function McpServerCard({ server }: McpServerCardProps): React.ReactElement {
  const statusLabel = STATUS_LABELS[server.connection_status] ?? STATUS_LABELS.unknown;
  const statusColor = STATUS_COLORS[server.connection_status] ?? STATUS_COLORS.unknown;
  const [showReplaceCredential, setShowReplaceCredential] = useState(false);
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);

  const handleReplaceSuccess = useCallback(() => {
    // replaceMcpClientServerCredential's own invalidatesTags already
    // refreshes this card's status (e.g. auth_failed -> reachable once
    // the dispatched refresh job runs) -- this only collapses the form.
    setShowReplaceCredential(false);
  }, []);

  return (
    <div
      data-testid={`mcp-server-card-${server.id}`}
      data-server-id={server.id}
      style={{
        border: '1px solid var(--border-color, #d1d5db)',
        borderRadius: '0.5rem',
        padding: '1rem',
        marginBottom: '0.75rem',
        backgroundColor: 'var(--bg-card, #ffffff)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: '1rem' }}>{server.name}</div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--text-secondary, #6b7280)' }}>
            {TRANSPORT_LABELS[server.transport] ?? server.transport} &middot; {server.scope === 'project' ? 'Shared' : 'Personal'}
          </div>
        </div>
        <span
          data-testid={`mcp-server-status-${server.id}`}
          style={{
            fontSize: '0.8125rem',
            fontWeight: 600,
            color: statusColor,
            border: `1px solid ${statusColor}`,
            borderRadius: '999px',
            padding: '0.125rem 0.625rem',
            whiteSpace: 'nowrap',
          }}
        >
          {statusLabel}
        </span>
      </div>

      <div style={{ marginTop: '0.5rem', display: 'flex', flexWrap: 'wrap', gap: '1rem', fontSize: '0.8125rem', color: 'var(--text-secondary, #6b7280)' }}>
        <span data-testid={`mcp-server-last-reachable-${server.id}`}>{formatLastReachable(server.last_reachable_at)}</span>
        <span data-testid={`mcp-server-tool-count-${server.id}`}>
          {server.tool_count} {server.tool_count === 1 ? 'tool' : 'tools'} offered
        </span>
      </div>

      <div style={{ marginTop: '0.75rem' }}>
        <button
          type="button"
          data-testid={`mcp-server-replace-credential-toggle-${server.id}`}
          onClick={() => setShowReplaceCredential((prev) => !prev)}
          style={{
            padding: '0.375rem 0.75rem',
            border: '1px solid var(--border-color, #d1d5db)',
            borderRadius: '0.375rem',
            backgroundColor: 'var(--bg-card, #ffffff)',
            cursor: 'pointer',
            fontSize: '0.8125rem',
            fontWeight: 500,
          }}
        >
          {showReplaceCredential ? 'Cancel' : 'Replace credential'}
        </button>

        {showReplaceCredential && (
          <div style={{ marginTop: '0.5rem' }}>
            <McpCredentialReplaceForm serverId={server.id} onSuccess={handleReplaceSuccess} />
          </div>
        )}

        <button
          type="button"
          data-testid={`mcp-server-remove-toggle-${server.id}`}
          onClick={() => setShowRemoveConfirm(true)}
          style={{
            marginLeft: '0.5rem',
            padding: '0.375rem 0.75rem',
            border: '1px solid var(--color-danger, #dc2626)',
            borderRadius: '0.375rem',
            backgroundColor: 'var(--bg-card, #ffffff)',
            color: 'var(--color-danger, #dc2626)',
            cursor: 'pointer',
            fontSize: '0.8125rem',
            fontWeight: 500,
          }}
        >
          Remove
        </button>

        {showRemoveConfirm && (
          <div style={{ marginTop: '0.5rem' }}>
            <McpServerRemoveConfirm server={server} onDismiss={() => setShowRemoveConfirm(false)} />
          </div>
        )}
      </div>
    </div>
  );
}

export default McpServerCard;
