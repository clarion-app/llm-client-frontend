import React from 'react';
import { RoleEffective } from './types';

interface RoleStatusLineProps {
  effective: RoleEffective;
  role: string;
}

// Consequence messages for unassigned roles
const CONSEQUENCE_MESSAGES: Record<string, string> = {
  inference: 'No inference model assigned — conversations and agents cannot run.',
  embedding: 'No embedding model assigned — semantic search and memory features will not work.',
  image: 'No image model assigned — image generation features will not be available.',
};

/**
 * RoleStatusLine — displays the current status of a role assignment.
 *
 * - `resolved`: Shows model name, server name, and scope (user/installation).
 * - `unassigned`: Shows the consequence sentence for that role.
 * - `broken`: Shows a warning about the broken reference.
 */
export function RoleStatusLine({ effective, role }: RoleStatusLineProps): React.ReactElement {
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

  // Broken status
  return (
    <div className="role-status-broken" data-testid="role-status-broken">
      <span style={{ color: 'var(--text-error, #dc2626)' }}>
        ⚠ Model reference is broken {effective.reason ? `— ${effective.reason}` : ''}
      </span>
    </div>
  );
}
