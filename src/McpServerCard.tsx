import React from 'react';
import { McpClientServerStatusCategory, McpClientServerType } from './types';

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

export function McpServerCard({ server }: McpServerCardProps): React.ReactElement {
  const statusLabel = STATUS_LABELS[server.connection_status] ?? STATUS_LABELS.unknown;
  const statusColor = STATUS_COLORS[server.connection_status] ?? STATUS_COLORS.unknown;

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
    </div>
  );
}

export default McpServerCard;
