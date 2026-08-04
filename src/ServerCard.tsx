import React, { useCallback, useMemo, useState } from 'react';
import { ServerType, ServerStatusType, ConnectionStatus, RefreshOutcome, RoleAssignmentsType } from './types';
import { useRefreshServerModelsMutation } from './serverStatusApi';
import { useDeleteServerMutation } from './serverApi';
import { ConfirmDialog } from './ConfirmDialog';
import { ServerEditForm } from './ServerEditForm';

interface ServerCardProps {
  server: ServerType;
  status: ServerStatusType | null;
  isHighlighted?: boolean;
  onEditToken?: (serverId: string) => void;
  roleAssignments?: RoleAssignmentsType | null;
}

const ROLE_ORDER = ['inference', 'embedding', 'image'] as const;

/**
 * Roles this server's deletion would break: any role whose personal
 * assignment or installation default points at this server's id. Deriving
 * this from `user_assignment`/`installation_assignment` (rather than
 * `effective`) is what catches a role whose installation default lives on
 * this server even while a different server is currently in effect.
 */
function rolesBrokenByDeleting(
  serverId: string | undefined,
  roleAssignments: RoleAssignmentsType | null | undefined,
): Array<(typeof ROLE_ORDER)[number]> {
  if (!serverId || !roleAssignments) return [];
  return ROLE_ORDER.filter((role) => {
    const descriptor = roleAssignments[role];
    return (
      descriptor.user_assignment?.server_id === serverId ||
      descriptor.installation_assignment?.server_id === serverId
    );
  });
}

function joinWithAnd(items: string[]): string {
  if (items.length <= 1) return items.join('');
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function buildDeleteMessage(brokenRoles: string[]): string {
  if (brokenRoles.length === 0) {
    return "Deleting this server can't be undone.";
  }
  return (
    `Deleting this server will break your ${joinWithAnd(brokenRoles)} role assignment` +
    `${brokenRoles.length > 1 ? 's' : ''} in this setup, and any installation default that ` +
    `points to it. This can't be undone.`
  );
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
 * - auth_rejected offers an edit-token affordance (US3-2).
 * - unreachable does not hide that server's existing models — it flags
 *   them as possibly stale instead (US3-1).
 * - zero_models renders distinctly from never_checked and from a failed fetch.
 * - http_error shows the HTTP status the server returned, distinct from a
 *   plain connection-refused unreachable (FR-019a).
 * - An in-flight refresh that never reported back within the server's 60s
 *   window renders as "did not complete" rather than spinning forever
 *   (FR-026, SC-008).
 * - An edit affordance swaps the card body for ServerEditForm (US4).
 * - Deleting confirms first, naming the roles it would break (FR-020).
 */
export function ServerCard({
  server,
  status,
  isHighlighted = false,
  onEditToken,
  roleAssignments = null,
}: ServerCardProps): React.ReactElement {
  const [refreshServerModels] = useRefreshServerModelsMutation();
  const [deleteServer] = useDeleteServerMutation();
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleRefresh = useCallback(() => {
    if (server.id) {
      refreshServerModels(server.id);
    }
  }, [refreshServerModels, server.id]);

  const handleEditToken = useCallback(() => {
    // auth_rejected's "Edit Token" affordance opens the same edit form
    // (US3-2) — the token field is right there, no separate flow needed.
    setIsEditing(true);
    if (server.id) {
      onEditToken?.(server.id);
    }
  }, [onEditToken, server.id]);

  const brokenRoles = useMemo(
    () => rolesBrokenByDeleting(server.id, roleAssignments),
    [server.id, roleAssignments],
  );
  const deleteMessage = useMemo(() => buildDeleteMessage(brokenRoles), [brokenRoles]);

  const handleConfirmDelete = useCallback(() => {
    setShowDeleteConfirm(false);
    if (server.id) {
      deleteServer(server.id);
    }
  }, [deleteServer, server.id]);

  if (isEditing) {
    return (
      <div
        className="server-card"
        data-testid="server-card"
        data-server-id={server.id}
        style={{
          padding: '1rem',
          border: '1px solid var(--border-color, #e5e7eb)',
          borderRadius: '0.5rem',
          backgroundColor: 'var(--bg-card, #ffffff)',
        }}
      >
        <ServerEditForm server={server} onCollapse={() => setIsEditing(false)} />
      </div>
    );
  }

  const connectionStatus: ConnectionStatus = status?.connection_status ?? 'never_checked';
  const isInFlight = status?.in_flight ?? false;
  const modelCount = status?.model_count ?? 0;
  const lastOutcome = status?.last_outcome ?? null;

  const isAuthRejected = connectionStatus === 'auth_rejected';
  const isStaleModels = connectionStatus === 'unreachable' && modelCount > 0;
  const isZeroModels = connectionStatus === 'reachable' && lastOutcome === 'zero_models' && modelCount === 0;
  const isHttpError = connectionStatus === 'unreachable' && lastOutcome === 'http_error';
  const isDidNotComplete = !isInFlight && lastOutcome === 'did_not_complete';

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
        alignItems: 'flex-start',
        gap: '0.75rem',
      }}
    >
      {/* Server info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
          <h3
            style={{
              margin: 0,
              fontSize: '1rem',
              fontWeight: 600,
              overflowWrap: 'anywhere',
            }}
          >
            {server.name}
          </h3>

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

          {/* In-flight indicator — never shown once the 60s window has
              elapsed without a completion (isDidNotComplete instead). */}
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

        <div
          style={{
            fontSize: '0.875rem',
            color: 'var(--text-secondary, #6b7280)',
            marginTop: '0.25rem',
            overflowWrap: 'anywhere',
          }}
        >
          {server.server_url}
          {modelCount > 0 && (
            <span style={{ marginLeft: '0.5rem' }}>· {modelCount} models</span>
          )}
          {lastOutcome && !isInFlight && (
            <span style={{ marginLeft: '0.5rem' }}>· {OUTCOME_LABELS[lastOutcome]}</span>
          )}
        </div>

        {/* US3-1: existing models stay visible, flagged as possibly stale. */}
        {isStaleModels && (
          <div
            data-testid="stale-models-notice"
            style={{ marginTop: '0.375rem', fontSize: '0.8125rem', color: 'var(--text-warning, #d97706)' }}
          >
            This server can't currently be reached — its models may be out of date.
          </div>
        )}

        {/* zero_models is distinct from never_checked (no fetch has happened)
            and from a failed fetch (http_error/unreachable — count unknown). */}
        {isZeroModels && (
          <div
            data-testid="zero-models-notice"
            style={{ marginTop: '0.375rem', fontSize: '0.8125rem', color: 'var(--text-secondary, #6b7280)' }}
          >
            The server responded but reported no models.
          </div>
        )}

        {/* FR-019a: http_error names the HTTP status the server returned,
            distinct from a plain connection-refused unreachable. */}
        {isHttpError && (
          <div
            data-testid="http-error-detail"
            style={{ marginTop: '0.375rem', fontSize: '0.8125rem', color: 'var(--text-error, #dc2626)' }}
          >
            {status?.last_error ?? 'The server returned an HTTP error.'}
          </div>
        )}

        {/* FR-026, SC-008: never an indefinite spinner past the server's
            60s window — it renders as "did not complete" instead. */}
        {isDidNotComplete && (
          <div
            data-testid="did-not-complete-notice"
            style={{ marginTop: '0.375rem', fontSize: '0.8125rem', color: 'var(--text-warning, #d97706)' }}
          >
            The last refresh did not complete. Try again.
          </div>
        )}

        {/* US3-2: auth_rejected offers a way to fix the token directly. */}
        {isAuthRejected && (
          <div style={{ marginTop: '0.5rem' }}>
            <button
              type="button"
              data-testid="edit-token-button"
              onClick={handleEditToken}
              style={{
                padding: '0.25rem 0.5rem',
                border: '1px solid var(--border-color, #d1d5db)',
                borderRadius: '0.25rem',
                backgroundColor: 'var(--bg-card, #ffffff)',
                cursor: 'pointer',
                fontSize: '0.75rem',
                color: 'var(--text-warning, #92400e)',
              }}
            >
              Edit Token
            </button>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', flexShrink: 0 }}>
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
        <button
          type="button"
          data-testid="edit-button"
          onClick={() => setIsEditing(true)}
          style={{
            padding: '0.375rem 0.75rem',
            border: '1px solid var(--border-color, #d1d5db)',
            borderRadius: '0.375rem',
            backgroundColor: 'var(--bg-primary, #ffffff)',
            cursor: 'pointer',
            fontSize: '0.875rem',
          }}
        >
          Edit
        </button>
        <button
          type="button"
          data-testid="delete-button"
          onClick={() => setShowDeleteConfirm(true)}
          style={{
            padding: '0.375rem 0.75rem',
            border: '1px solid var(--color-danger, #dc2626)',
            borderRadius: '0.375rem',
            backgroundColor: 'var(--bg-primary, #ffffff)',
            color: 'var(--color-danger, #dc2626)',
            cursor: 'pointer',
            fontSize: '0.875rem',
          }}
        >
          Delete
        </button>
      </div>

      {showDeleteConfirm && (
        <ConfirmDialog
          title={`Delete ${server.name}?`}
          message={deleteMessage}
          confirmLabel="Delete"
          destructive
          onConfirm={handleConfirmDelete}
          onCancel={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  );
}
