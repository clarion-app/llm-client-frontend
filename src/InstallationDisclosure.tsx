import React, { useState, useCallback } from 'react';
import { RoleDescriptor } from './types';
import { useSetRoleAssignmentMutation, useClearRoleAssignmentMutation } from './roleAssignmentApi';
import { ModelPicker } from './ModelPicker';

interface InstallationDisclosureProps {
  roleDescriptor: RoleDescriptor;
}

/**
 * InstallationDisclosure — collapsed-by-default section for installation-scope role changes.
 *
 * - Closed on first render (FR-013).
 * - Labelled as affecting every user on the node.
 * - An ordinary personal change never requires opening it (FR-013).
 * - Provides the installation-scope ModelPicker and clear button.
 */
export function InstallationDisclosure({
  roleDescriptor,
}: InstallationDisclosureProps): React.ReactElement {
  const { role, installation_assignment } = roleDescriptor;
  const [isOpen, setIsOpen] = useState(false);
  const [setRoleAssignment] = useSetRoleAssignmentMutation();
  const [clearRoleAssignment] = useClearRoleAssignmentMutation();

  const handleSelect = useCallback(
    (value: { server_id: string; model: string }) => {
      setRoleAssignment({
        role,
        scope: 'installation',
        server_id: value.server_id,
        model: value.model,
      });
    },
    [role, setRoleAssignment]
  );

  const handleClear = useCallback(() => {
    clearRoleAssignment({
      role,
      scope: 'installation',
    });
  }, [role, clearRoleAssignment]);

  return (
    <div
      className="installation-disclosure"
      data-testid={`installation-disclosure-${role}`}
      style={{
        marginTop: '0.75rem',
        border: '1px solid var(--border-color, #e5e7eb)',
        borderRadius: '0.375rem',
      }}
    >
      {/* Disclosure header */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          width: '100%',
          padding: '0.5rem 0.75rem',
          border: 'none',
          borderRadius: isOpen ? '0.3125rem 0.3125rem 0 0' : '0.3125rem',
          backgroundColor: 'var(--bg-muted, #f9fafb)',
          cursor: 'pointer',
          fontSize: '0.8125rem',
          fontWeight: 500,
          color: 'var(--text-secondary, #6b7280)',
          textAlign: 'left',
        }}
      >
        <span style={{ transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' }}>
          ▶
        </span>
        Installation default (affects all users on this node)
      </button>

      {/* Disclosure content */}
      {isOpen && (
        <div style={{ padding: '0.75rem' }}>
          {/* Current installation assignment */}
          {installation_assignment ? (
            <div style={{ marginBottom: '0.5rem', fontSize: '0.8125rem', color: 'var(--text-secondary, #6b7280)' }}>
              Current: {installation_assignment.model}
            </div>
          ) : (
            <div style={{ marginBottom: '0.5rem', fontSize: '0.8125rem', color: 'var(--text-warning, #92400e)' }}>
              No installation default set
            </div>
          )}

          {/* Installation-scope model picker */}
          <div style={{ marginBottom: '0.5rem' }}>
            <ModelPicker
              onSelect={handleSelect}
              selectedValue={
                installation_assignment
                  ? { server_id: installation_assignment.server_id, model: installation_assignment.model }
                  : null
              }
              role={role}
            />
          </div>

          {/* Clear installation default */}
          {installation_assignment && (
            <button
              type="button"
              data-testid={`clear-installation-${role}`}
              onClick={handleClear}
              style={{
                padding: '0.25rem 0.5rem',
                border: '1px solid var(--border-color, #d1d5db)',
                borderRadius: '0.25rem',
                backgroundColor: 'var(--bg-card, #ffffff)',
                cursor: 'pointer',
                fontSize: '0.75rem',
                color: 'var(--text-secondary, #6b7280)',
              }}
            >
              Clear installation default
            </button>
          )}
        </div>
      )}
    </div>
  );
}
