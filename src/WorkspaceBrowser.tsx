import React from 'react';
import { useGetCodingProjectsQuery } from './workspaceApi';
import { CodingWorkspaceType } from './types';

/**
 * WorkspaceBrowser — routed screen for the workspace browser
 * (122-workspace-browser-ui, US1). Zero required props -- the manifest
 * routes /clarion-app/llm-client/workspaces -> <WorkspaceBrowser /> with no
 * props, mirroring McpServerManagement.tsx's exact shape (contracts/
 * frontend-manifest-wiring.md's Component contract) rather than
 * RunDiagram's original, since-fixed required-prop defect (spec 070).
 *
 * Owns its own top-level query (useGetCodingProjectsQuery), exactly like
 * McpServerManagement owns useGetMcpClientServersQuery. Each workspace's
 * `reachable` flag is computed fresh by the backend on every call (FR-002,
 * research.md D3) -- this component simply renders whatever the latest
 * response says, never memoizing or overriding it client-side.
 */
export function WorkspaceBrowser(): React.ReactElement {
  const { data, isLoading } = useGetCodingProjectsQuery();
  const workspaces = data?.data ?? [];

  if (isLoading) {
    return (
      <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-secondary, #6b7280)' }}>
        Loading...
      </div>
    );
  }

  return (
    <div className="workspace-browser" data-testid="workspace-browser">
      <h1 style={{ margin: '0 0 1.5rem', fontSize: '1.5rem', fontWeight: 700 }}>Workspaces</h1>

      {workspaces.length === 0 ? (
        <div
          data-testid="workspace-browser-empty-state"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '3rem 1rem',
            textAlign: 'center',
            color: 'var(--text-secondary, #6b7280)',
          }}
        >
          <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.25rem', color: 'var(--text-primary, #111827)' }}>
            No workspaces registered
          </h2>
          <p style={{ margin: 0, fontSize: '0.875rem' }}>
            Register a workspace so your agents have somewhere to work.
          </p>
        </div>
      ) : (
        <div data-testid="workspace-list">
          {workspaces.map((workspace) => (
            <WorkspaceRow key={workspace.id} workspace={workspace} />
          ))}
        </div>
      )}
    </div>
  );
}

interface WorkspaceRowProps {
  workspace: CodingWorkspaceType;
}

function WorkspaceRow({ workspace }: WorkspaceRowProps): React.ReactElement {
  const borderColor = workspace.reachable ? 'var(--border-color, #d1d5db)' : 'var(--color-danger, #dc2626)';

  return (
    <div
      data-testid={`workspace-row-${workspace.id}`}
      data-reachable={workspace.reachable}
      style={{
        border: `1px solid ${borderColor}`,
        borderRadius: '0.5rem',
        padding: '1rem',
        marginBottom: '0.75rem',
        backgroundColor: workspace.reachable ? 'var(--bg-card, #ffffff)' : 'var(--bg-danger, #fef2f2)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontWeight: 600, fontSize: '1rem' }}>{workspace.name}</div>
          <div
            data-testid={`workspace-root-path-${workspace.id}`}
            style={{ fontSize: '0.8125rem', color: 'var(--text-secondary, #6b7280)' }}
          >
            {workspace.root_path}
          </div>
        </div>

        {!workspace.reachable && (
          <span
            data-testid={`workspace-broken-badge-${workspace.id}`}
            style={{
              fontSize: '0.8125rem',
              fontWeight: 600,
              color: 'var(--color-danger, #dc2626)',
              border: '1px solid var(--color-danger, #dc2626)',
              borderRadius: '999px',
              padding: '0.125rem 0.625rem',
              whiteSpace: 'nowrap',
            }}
          >
            Broken -- location unreachable
          </span>
        )}
      </div>

      <div
        data-testid={`workspace-confirmation-state-${workspace.id}`}
        style={{ marginTop: '0.5rem', fontSize: '0.8125rem', color: 'var(--text-secondary, #6b7280)' }}
      >
        {workspace.confirmation_relaxed ? 'Confirmation relaxed' : 'Confirmation required'}
      </div>
    </div>
  );
}

export default WorkspaceBrowser;
