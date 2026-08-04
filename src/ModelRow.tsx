import React, { useState, useCallback, useMemo } from 'react';
import { LanguageModelType, RoleAssignmentsType } from './types';
import { useSetRoleAssignmentMutation } from './roleAssignmentApi';

interface ModelRowProps {
  model: LanguageModelType;
  serverName: string;
  roleAssignments: RoleAssignmentsType | null;
}

/**
 * ModelRow — displays a single model with its server, role badges, and assign action.
 *
 * - Always renders the model with its server, never the name alone (FR-023).
 * - Role badges carry their scope (user/installation).
 * - Assign-to-role from the row updates the roles panel (FR-010, US2-3).
 * - Two servers reporting the same model name render as two rows (never merged).
 * - Long model/server names wrap with the distinguishing part still readable.
 */
export function ModelRow({ model, serverName, roleAssignments }: ModelRowProps): React.ReactElement {
  const [setRoleAssignment] = useSetRoleAssignmentMutation();
  const [showAssignMenu, setShowAssignMenu] = useState(false);

  // Determine which roles this model holds
  const roleBadges = useMemo(() => {
    const badges: { role: string; scope: string }[] = [];
    if (!roleAssignments) return badges;
    for (const [roleKey, descriptor] of Object.entries(roleAssignments)) {
      if (
        descriptor.effective.status === 'resolved' &&
        descriptor.effective.server?.id === model.server_id &&
        descriptor.effective.model === model.name
      ) {
        badges.push({
          role: roleKey,
          scope: descriptor.effective.scope ?? 'user',
        });
      }
    }
    return badges;
  }, [model, roleAssignments]);

  // Determine which roles are available to assign (not already assigned to this model)
  const availableRoles = useMemo(() => {
    const assignedRoles = new Set(roleBadges.map((b) => b.role));
    const allRoles = ['inference', 'embedding', 'image'];
    return allRoles.filter((r) => !assignedRoles.has(r));
  }, [roleBadges]);

  const handleAssign = useCallback(
    (role: 'inference' | 'embedding' | 'image') => {
      setRoleAssignment({
        role,
        scope: 'user',
        server_id: model.server_id,
        model: model.name,
      });
      setShowAssignMenu(false);
    },
    [model, setRoleAssignment]
  );

  const toggleAssignMenu = useCallback(() => {
    setShowAssignMenu((prev) => !prev);
  }, []);

  return (
    <div
      className="model-row"
      data-testid="model-row"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.5rem 0',
        borderBottom: '1px solid var(--border-subtle, #f3f4f6)',
      }}
    >
      {/* Model name + server */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <span
          style={{
            fontWeight: 500,
            fontSize: '0.875rem',
            display: 'block',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={`${model.name} (${serverName})`}
        >
          {model.name}
        </span>
        <span
          style={{
            fontSize: '0.75rem',
            color: 'var(--text-secondary, #6b7280)',
            display: 'block',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={serverName}
        >
          {serverName}
        </span>
      </div>

      {/* Role badges */}
      {roleBadges.length > 0 && (
        <div style={{ display: 'flex', gap: '0.375rem', flexWrap: 'wrap' }}>
          {roleBadges.map((badge) => (
            <span
              key={badge.role}
              data-testid={`role-badge-${badge.role}`}
              style={{
                fontSize: '0.6875rem',
                padding: '0.125rem 0.5rem',
                borderRadius: '9999px',
                backgroundColor: badge.scope === 'user'
                  ? 'var(--bg-accent, #dbeafe)'
                  : 'var(--bg-muted, #f3f4f6)',
                color: badge.scope === 'user'
                  ? 'var(--text-accent, #1d4ed8)'
                  : 'var(--text-secondary, #6b7280)',
                fontWeight: 500,
                whiteSpace: 'nowrap',
              }}
            >
              {badge.role}{' '}
              <span style={{ opacity: 0.7 }}>({badge.scope})</span>
            </span>
          ))}
        </div>
      )}

      {/* Assign button */}
      <div style={{ position: 'relative' }}>
        <button
          type="button"
          data-testid="assign-role-btn"
          onClick={toggleAssignMenu}
          title="Assign to role"
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
          Assign
        </button>

        {/* Assign dropdown */}
        {showAssignMenu && (
          <div
            style={{
              position: 'absolute',
              right: 0,
              top: '100%',
              marginTop: '0.25rem',
              minWidth: '140px',
              border: '1px solid var(--border-color, #e5e7eb)',
              borderRadius: '0.375rem',
              backgroundColor: 'var(--bg-card, #ffffff)',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
              zIndex: 10,
              overflow: 'hidden',
            }}
          >
            {availableRoles.length === 0 ? (
              <div
                style={{
                  padding: '0.5rem 0.75rem',
                  fontSize: '0.75rem',
                  color: 'var(--text-secondary, #6b7280)',
                }}
              >
                All roles assigned
              </div>
            ) : (
              availableRoles.map((role) => (
                <button
                  key={role}
                  type="button"
                  data-testid={`assign-role-${role}`}
                  onClick={() => handleAssign(role as 'inference' | 'embedding' | 'image')}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '0.375rem 0.75rem',
                    border: 'none',
                    backgroundColor: 'transparent',
                    cursor: 'pointer',
                    fontSize: '0.8125rem',
                    textAlign: 'left',
                    textTransform: 'capitalize',
                  }}
                >
                  {role}
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
