import React from 'react';
import { LanguageModelType, RoleAssignmentsType } from './types';
import { ModelRow } from './ModelRow';

interface ServerModelGroupProps {
  serverId: string;
  serverName: string;
  models: LanguageModelType[];
  roleAssignments: RoleAssignmentsType | null;
}

/**
 * ServerModelGroup — displays models under a server heading.
 *
 * - Server heading shows the server name.
 * - Each model is a ModelRow with role badges and assign action.
 * - When filtering narrows results to zero, the group is not rendered.
 */
export function ServerModelGroup({
  serverId,
  serverName,
  models,
  roleAssignments,
}: ServerModelGroupProps): React.ReactElement {
  return (
    <div
      className="server-model-group"
      data-testid={`server-model-group-${serverId}`}
      style={{
        border: '1px solid var(--border-color, #e5e7eb)',
        borderRadius: '0.5rem',
        overflow: 'hidden',
      }}
    >
      {/* Server heading */}
      <div
        style={{
          padding: '0.5rem 1rem',
          backgroundColor: 'var(--bg-muted, #f9fafb)',
          fontWeight: 600,
          fontSize: '0.875rem',
        }}
      >
        {serverName}
      </div>

      {/* Model rows */}
      <div style={{ padding: '0.5rem 1rem' }}>
        {models.map((model) => (
          <ModelRow
            key={model.id}
            model={model}
            serverName={serverName}
            roleAssignments={roleAssignments}
          />
        ))}
      </div>
    </div>
  );
}
