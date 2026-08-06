import React, { useCallback, useMemo, useRef, useState } from 'react';
import { ModelPicker } from './ModelPicker';
import { RoleStatusLine } from './RoleStatusLine';
import { InstallationDisclosure } from './InstallationDisclosure';
import { ConfirmDialog } from './ConfirmDialog';
import { TestRoleButton } from './TestRoleButton';
import { RoleDescriptor } from './types';
import { useSetRoleAssignmentMutation, useClearRoleAssignmentMutation } from './roleAssignmentApi';

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
 * - `broken` renders a warning (US3).
 * - Assign from the card via ModelPicker without navigation.
 * - After a successful assign, the panel shows the server-returned descriptor (FR-011, FR-025).
 * - SC-003: Changing the inference role's model from the loaded screen takes ≤ 3 interactions.
 * - Clear flow states the fallback before it takes effect (FR-012).
 * - Installation-scope controls in a disclosure, closed on first render (FR-013).
 * - `resolved` + `scope: installation` is visually distinct from `scope: user` (FR-006).
 */
export function RoleCard({ roleDescriptor }: RoleCardProps): React.ReactElement {
  const { role, effective, user_assignment, installation_assignment } = roleDescriptor;
  const [setRoleAssignment] = useSetRoleAssignmentMutation();
  const [clearRoleAssignment] = useClearRoleAssignmentMutation();
  const [showClearDialog, setShowClearDialog] = useState(false);
  const modelPickerRef = useRef<HTMLDivElement>(null);

  const handleReassignBroken = useCallback(() => {
    modelPickerRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
  }, []);

  // Compute the fallback statement when clearing a user-scope assignment
  const clearFallbackStatement = useMemo(() => {
    if (!user_assignment) return null;

    // If there's an installation default, that's the fallback
    if (installation_assignment) {
      // Check if the installation default is the same model
      if (
        installation_assignment.server_id === user_assignment.server_id &&
        installation_assignment.model === user_assignment.model
      ) {
        return 'The effective model will not change (same as installation default).';
      }
      return `Clearing this will fall back to the installation default: ${installation_assignment.model}.`;
    }

    // No installation default — will become unassigned
    return 'Clearing this will leave the role unassigned. ' + (CONSEQUENCE_MESSAGES[role] ?? '');
  }, [role, user_assignment, installation_assignment]);

  const handleSelect = useCallback(
    (value: { server_id: string; model: string }) => {
      setRoleAssignment({
        role,
        scope: 'user',
        server_id: value.server_id,
        model: value.model,
      });
    },
    [role, setRoleAssignment]
  );

  const handleClearConfirm = useCallback(() => {
    clearRoleAssignment({
      role,
      scope: 'user',
    });
    setShowClearDialog(false);
  }, [role, clearRoleAssignment]);

  const handleClearCancel = useCallback(() => {
    setShowClearDialog(false);
  }, []);

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

      {/* Status line — shows model/server/scope, consequence message, or
          (when broken) the surviving assignment's model/server and a way
          to jump straight to reassigning (US3-3). */}
      <RoleStatusLine
        effective={effective}
        role={role}
        userAssignment={user_assignment}
        installationAssignment={installation_assignment}
        onReassignBroken={handleReassignBroken}
      />

      {/* Test the effective model with a single bounded call (US3-4). Only
          shown once a model is actually resolved — broken/unassigned always
          report no_effective_model, so there is nothing useful to exercise. */}
      {effective.status === 'resolved' && (
        <div style={{ marginTop: '0.5rem' }}>
          <TestRoleButton role={role} roleDescriptor={roleDescriptor} />
        </div>
      )}

      {/* Scope indicator — visually distinct for user vs installation (FR-006) */}
      {effective.status === 'resolved' && (
        <div style={{ marginTop: '0.25rem' }}>
          <span
            data-testid={`scope-badge-${role}`}
            style={{
              fontSize: '0.6875rem',
              padding: '0.125rem 0.375rem',
              borderRadius: '0.25rem',
              backgroundColor: effective.scope === 'user'
                ? 'var(--bg-accent, #dbeafe)'
                : 'var(--bg-muted, #f3f4f6)',
              color: effective.scope === 'user'
                ? 'var(--text-accent, #1d4ed8)'
                : 'var(--text-secondary, #6b7280)',
              fontWeight: 500,
            }}
          >
            {effective.scope === 'user' ? 'Your override' : 'Installation default'}
          </span>
        </div>
      )}

      {/* Clear button (only shown when there's a user-scope assignment) */}
      {user_assignment && (
        <div style={{ marginTop: '0.5rem' }}>
          <button
            type="button"
            data-testid={`clear-role-${role}`}
            onClick={() => setShowClearDialog(true)}
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
            Clear override
          </button>
        </div>
      )}

      {/* Model picker for assignment */}
      <div ref={modelPickerRef} style={{ marginTop: '0.75rem' }}>
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

      {/* Installation disclosure — collapsed by default (FR-013) */}
      <InstallationDisclosure roleDescriptor={roleDescriptor} />

      {/* Clear confirmation dialog (FR-012) */}
      {showClearDialog && clearFallbackStatement && (
        <ConfirmDialog
          title={`Clear ${role} override?`}
          message={clearFallbackStatement}
          confirmLabel="Clear"
          onConfirm={handleClearConfirm}
          onCancel={handleClearCancel}
          destructive
        />
      )}
    </div>
  );
}
