import React from 'react';
import { useGetRoleAssignmentsQuery } from './roleAssignmentApi';
import { RoleCard } from './RoleCard';

/**
 * RolesPanel — displays the three role cards reading from GET /role-assignment.
 *
 * Uses the existing `describeAllRoles()` output from the backend (no backend change needed).
 * The three roles: inference, embedding, image.
 */
export function RolesPanel(): React.ReactElement {
  const { data: roleAssignments, isLoading } = useGetRoleAssignmentsQuery(null);

  if (isLoading) {
    return (
      <div data-testid="roles-panel" style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-secondary, #6b7280)' }}>
        Loading roles...
      </div>
    );
  }

  if (!roleAssignments) {
    return (
      <div data-testid="roles-panel" style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-secondary, #6b7280)' }}>
        Unable to load role assignments.
      </div>
    );
  }

  return (
    <div data-testid="roles-panel" className="roles-panel">
      <h2 style={{ margin: '0 0 1rem', fontSize: '1.125rem', fontWeight: 600 }}>Model Roles</h2>
      <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
        <RoleCard roleDescriptor={roleAssignments.inference} />
        <RoleCard roleDescriptor={roleAssignments.embedding} />
        <RoleCard roleDescriptor={roleAssignments.image} />
      </div>
    </div>
  );
}

export default RolesPanel;
