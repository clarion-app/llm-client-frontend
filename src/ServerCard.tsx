import React, { useCallback } from 'react';
import { ServerType, ServerStatusType, ConnectionStatus, RefreshOutcome } from './types';
import { useRefreshServerModelsMutation } from './serverStatusApi';

interface ServerCardProps {
  server: ServerType;
  status: ServerStatusType | null;
  isHighlighted?: boolean;
}

// Status badge colors
const STATUS_COLORS: Record<ConnectionStatus, string> = {
  reachable: 'var(--text-success, #059669)',
  unreachable: 'var(--text-error, #dc2626)',
  auth_rejected: 'var(--text-warning, #d97706)',
  never_checked: 'var(--text-secondary, #6b7280)',
};

const STATUS_LABELS: Record<ConnectionStatus, string> = {
  reachable: 'Connected',
  unreachable: 'Unreachable',
  auth_rejected: 'Auth Failed',
  never_checked: 'Not Checked',
};

// Outcome labels
const OUTCOME_LABELS: Record<RefreshOutcome, string> = {
  models_updated: 'Models Updated',
  zero_models: 'No Models',
  auth_rejected: 'Auth Failed',
  http_error: 'HTTP Error',
  unreachable: 'Unreachable',
  did_not_complete: 'Incomplete',
};

/**
 * ServerCard — displays server info with status badge and refresh button.
 *
 * - Shows server name, URL, and provider type.
 * - Status badge reflects connection_status from the projected status.
 * - Refresh button triggers RefreshServerModelsJob.
 */
export function ServerCard({ server, status, isHighlighted = false }: ServerCardProps): React.ReactElement {
  const [refreshServerModels] = useRefreshServerModelsMutation();

  const handleRefresh = useCallback(() => {
    if (server.id) {
      refreshServerModels(server.id);
    }
  }, [refreshServerModels, server.id]);

  const connectionStatus: ConnectionStatus = status?.connection_status ?? 'never_checked';
  const isInFlight = status?.in_flight ?? false;

  return (
    <div
      className="server-card"
      data-testid="server-card"
      data-server-id={server.id}
      style={{
        padding: '1rem',
        border: isHighlighted
          ? '2px solid var(--text-accent, #2563eb)'
          : '1px solid var(--border-color, #e5e7eb)',
        borderRadius: '0.5rem',
        backgroundColor: isHighlighted
          ? 'var(--bg-accent, #eff6ff)'
          : 'var(--bg-card, #ffffff)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
      }}
    >
      {/* Server info */}
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{server.name}</h3>

          {/* Status badge */}
          <span
            data-testid="status-badge"
            style={{
              fontSize: '0.75rem',
              padding: '0.125rem 0.375rem',
              borderRadius: '0.25rem',
              backgroundColor: STATUS_COLORS[connectionStatus] + '15',
              color: STATUS_COLORS[connectionStatus],
            }}
          >
            {STATUS_LABELS[connectionStatus]}
          </span>

          {/* In-flight indicator */}
          {isInFlight && (
            <span
              data-testid="in-flight-indicator"
              style={{
                fontSize: '0.75rem',
                color: 'var(--text-accent, #2563eb)',
              }}
            >
              (refreshing...)
            </span>
          )}
        </div>

        <div style={{ fontSize: '0.875rem', color: 'var(--text-secondary, #6b7280)', marginTop: '0.25rem' }}>
          {server.server_url}
          {status?.model_count != null && status.model_count > 0 && (
            <span style={{ marginLeft: '0.5rem' }}>· {status.model_count} models</span>
          )}
          {status?.last_outcome && !isInFlight && (
            <span style={{ marginLeft: '0.5rem' }}>· {OUTCOME_LABELS[status.last_outcome]}</span>
          )}
        </div>
      </div>

      {/* Refresh button */}
      <button
        data-testid="refresh-button"
        onClick={handleRefresh}
        disabled={isInFlight}
        style={{
          padding: '0.375rem 0.75rem',
          border: '1px solid var(--border-color, #d1d5db)',
          borderRadius: '0.375rem',
          backgroundColor: 'var(--bg-primary, #ffffff)',
          cursor: isInFlight ? 'not-allowed' : 'pointer',
          fontSize: '0.875rem',
          opacity: isInFlight ? 0.5 : 1,
        }}
        title="Refresh models"
      >
        {isInFlight ? '...' : 'Refresh'}
      </button>
    </div>
  );
}
