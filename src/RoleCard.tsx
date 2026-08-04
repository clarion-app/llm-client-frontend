import React, { useCallback } from 'react';
import { ModelPicker } from './ModelPicker';
import { RoleStatusLine } from './RoleStatusLine';
import { RoleDescriptor, RoleEffective } from './types';
import { useSetRoleAssignmentMutation } from './roleAssignmentApi';

interface RoleCardProps {
  roleDescriptor: RoleDescriptor;
}

// Consequence messages for unassigned roles
const CONSEQUENCE_MESSAGES: Record<string, string> = {
  inference: 'No inference model assigned — conversations and agents cannot run.',
  embedding: 'No embedding model assigned — semantic search and memory features will not work.',
  image: 'No image model assigned — image generation features will not be available.',
};

/**
 * RoleCard — displays the effective model for a role and allows assignment.
 *
 * - `resolved` renders model + server + scope with no interaction.
 * - `unassigned` renders the consequence sentence for that role.
 * - Assign from the card via ModelPicker without navigation.
 * - After a successful assign, the panel shows the server-returned descriptor (FR-011, FR-025).
 * - SC-003: Changing the inference role's model from the loaded screen takes ≤ 3 interactions.
 */
export function RoleCard({ roleDescriptor }: RoleCardProps): React.ReactElement {
  const { role, effective } = roleDescriptor;
  const [setRoleAssignment] = useSetRoleAssignmentMutation();

  const handleSelect = useCallback(
    (value: { server_id: string; model: string }) => {
      setRoleAssignment({
        role,
        scope: 'user',
        server_id: value.server_id,
        model: value.model,
      });
      // The RTK Query mutation will invalidate the RoleAssignment tag,
      // causing the parent to re-fetch and re-render with the server-returned descriptor.
    },
    [role, setRoleAssignment]
  );

  return (
    <div
      className="role-card"
      data-testid={`role-card-${role}`}
      style={{
        padding: '1rem',
        border: '1px solid var(--border-color, #e5e7eb)',
        borderRadius: '0.5rem',
        backgroundColor: 'var(--bg-card, #ffffff)',
      }}
    >
      {/* Role header */}
      <h3 style={{ margin: '0 0 0.5rem', fontSize: '1rem', fontWeight: 600, textTransform: 'capitalize' }}>
        {role} Model
      </h3>

      {/* Status line — shows model/server/scope or consequence message */}
      <RoleStatusLine effective={effective} role={role} />

      {/* Model picker for assignment */}
      <div style={{ marginTop: '0.75rem' }}>
        <ModelPicker
          onSelect={handleSelect}
          selectedValue={
            effective.status === 'resolved' && effective.server
              ? { server_id: effective.server.id, model: effective.model! }
              : null
          }
          role={role}
        />
      </div>
    </div>
  );
}
