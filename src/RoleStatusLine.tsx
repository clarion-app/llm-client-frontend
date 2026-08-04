import React from 'react';
import { RoleEffective, RoleAssignment } from './types';

interface RoleStatusLineProps {
  effective: RoleEffective;
  role: string;
  userAssignment?: RoleAssignment | null;
  installationAssignment?: RoleAssignment | null;
  onReassignBroken?: () => void;
}

// Consequence messages for unassigned roles
const CONSEQUENCE_MESSAGES: Record<string, string> = {
  inference: 'No inference model assigned — conversations and agents cannot run.',
  embedding: 'No embedding model assigned — semantic search and memory features will not work.',
  image: 'No image model assigned — image generation features will not be available.',
};

// Consequence messages for broken role assignments — same family as the
// unassigned messages (a broken role is just as unusable), but worded
// distinctly since the surviving assignment is still named right above it.
const BROKEN_CONSEQUENCE_MESSAGES: Record<string, string> = {
  inference: 'The assigned inference model is no longer available — conversations and agents cannot run until this is fixed.',
  embedding: 'The assigned embedding model is no longer available — semantic search and memory features will not work until this is fixed.',
  image: 'The assigned image model is no longer available — image generation features will not be available until this is fixed.',
};

/**
 * RoleStatusLine — displays the current status of a role assignment.
 *
 * - `resolved`: Shows model name, server name, and scope (user/installation).
 * - `unassigned`: Shows the consequence sentence for that role.
 * - `broken`: Shows a warning about the broken reference.
 */
export function RoleStatusLine({
  effective,
  role,
  userAssignment = null,
  installationAssignment = null,
  onReassignBroken,
}: RoleStatusLineProps): React.ReactElement {
  if (effective.status === 'resolved' && effective.server && effective.model) {
    return (
      <div className="role-status-resolved" data-testid="role-status-resolved">
        <span style={{ fontWeight: 500 }}>{effective.model}</span>
        <span style={{ color: 'var(--text-secondary, #6b7280)', margin: '0 0.25rem' }}>
          on {effective.server.name}
        </span>
        <span
          style={{
            fontSize: '0.75rem',
            padding: '0.125rem 0.375rem',
            borderRadius: '0.25rem',
            backgroundColor: effective.scope === 'user' ? 'var(--bg-accent, #dbeafe)' : 'var(--bg-muted, #f3f4f6)',
            color: effective.scope === 'user' ? 'var(--text-accent, #1d4ed8)' : 'var(--text-secondary, #6b7280)',
            marginLeft: '0.5rem',
          }}
        >
          {effective.scope}
        </span>
      </div>
    );
  }

  if (effective.status === 'unassigned') {
    const message = CONSEQUENCE_MESSAGES[role] ?? 'No model assigned for this role.';
    return (
      <div className="role-status-unassigned" data-testid="role-status-unassigned">
        <span style={{ color: 'var(--text-warning, #92400e)' }}>{message}</span>
      </div>
    );
  }

  // Broken status — the surviving assignment (at whichever scope resolved
  // it) still names the model, and, since effective.server is null once
  // broken (the server row is gone), falls back to that assignment's
  // server_id to say where it used to live (US3-3).
  const survivingAssignment = effective.scope === 'installation' ? installationAssignment : userAssignment;
  const brokenConsequence = BROKEN_CONSEQUENCE_MESSAGES[role] ?? 'This role’s assigned model is no longer available.';

  return (
    <div className="role-status-broken" data-testid="role-status-broken">
      <div style={{ color: 'var(--text-error, #dc2626)' }}>
        <span>⚠ </span>
        <span style={{ fontWeight: 500 }}>{effective.model}</span>
        {survivingAssignment && (
          <span style={{ color: 'var(--text-secondary, #6b7280)', margin: '0 0.25rem' }}>
            was on server {survivingAssignment.server_id}
          </span>
        )}
        {effective.reason && (
          <span style={{ color: 'var(--text-secondary, #6b7280)' }}>({effective.reason})</span>
        )}
      </div>
      <div style={{ color: 'var(--text-warning, #92400e)', marginTop: '0.25rem' }}>
        {brokenConsequence}
      </div>
      {onReassignBroken && (
        <button
          type="button"
          data-testid={`reassign-broken-${role}`}
          onClick={onReassignBroken}
          style={{
            marginTop: '0.375rem',
            padding: '0.25rem 0.5rem',
            border: '1px solid var(--border-color, #d1d5db)',
            borderRadius: '0.25rem',
            backgroundColor: 'var(--bg-card, #ffffff)',
            cursor: 'pointer',
            fontSize: '0.75rem',
            color: 'var(--text-primary, #111827)',
          }}
        >
          Reassign model
        </button>
      )}
    </div>
  );
}
