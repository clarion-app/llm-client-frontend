import React, { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';
import { useGetCodingProjectsQuery, useUpdateWorkspaceConfirmationSettingMutation, useDeleteCodingProjectMutation } from './workspaceApi';
import { CodingWorkspaceType } from './types';
import { AddWorkspaceForm } from './AddWorkspaceForm';
import { ConfirmDialog } from './ConfirmDialog';

/**
 * WorkspaceBrowser — routed screen for the workspace browser
 * (122-workspace-browser-ui, US1/US2). Zero required props -- the manifest
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
 *
 * US2 adds the confirmation toggle, remove action, and add-workspace form
 * -- all three call the existing, unmodified spec-112/spec-121 endpoints
 * (contracts/reused-endpoints.md); nothing here is new backend surface,
 * only making it reachable from this screen.
 */
export function WorkspaceBrowser(): React.ReactElement {
  const { data, isLoading } = useGetCodingProjectsQuery();
  const workspaces = data?.data ?? [];
  const [showAddForm, setShowAddForm] = useState(false);

  const handleAddSuccess = useCallback(() => {
    // createCodingProject's own invalidatesTags already refreshes the
    // list below -- this only collapses the form back down (AS3).
    setShowAddForm(false);
  }, []);

  if (isLoading) {
    return (
      <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-secondary, #6b7280)' }}>
        Loading...
      </div>
    );
  }

  return (
    <div className="workspace-browser" data-testid="workspace-browser">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem', fontWeight: 700 }}>Workspaces</h1>
        <button type="button" data-testid="workspace-add-toggle" onClick={() => setShowAddForm((prev) => !prev)}>
          {showAddForm ? 'Cancel' : 'Add workspace'}
        </button>
      </div>

      {showAddForm && <AddWorkspaceForm onSuccess={handleAddSuccess} />}

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

/**
 * Calls useDeleteCodingProjectMutation() -- mounted only once the user
 * clicks "Remove", mirroring McpServerCard.tsx's own
 * McpServerRemoveConfirm precedent, so WorkspaceRow itself only calls a
 * mutation hook when the corresponding widget is actually rendered.
 */
interface WorkspaceRemoveConfirmProps {
  workspace: CodingWorkspaceType;
  onDismiss: () => void;
}

function WorkspaceRemoveConfirm({ workspace, onDismiss }: WorkspaceRemoveConfirmProps): React.ReactElement {
  const [deleteCodingProject] = useDeleteCodingProjectMutation();

  const handleConfirm = useCallback(() => {
    // A soft delete (destroy(), contracts/reused-endpoints.md) -- this
    // action only asks for confirmation (FR-005) and fires the mutation;
    // deleteCodingProject's own invalidatesTags removes the workspace
    // from the list without a manual refresh.
    deleteCodingProject(workspace.id);
    onDismiss();
  }, [deleteCodingProject, workspace.id, onDismiss]);

  return (
    <ConfirmDialog
      title={`Remove ${workspace.name}?`}
      message="Agents will no longer be able to access this workspace. Its change history is kept. This can't be undone."
      confirmLabel="Remove"
      destructive
      onConfirm={handleConfirm}
      onCancel={onDismiss}
    />
  );
}

function WorkspaceRow({ workspace }: WorkspaceRowProps): React.ReactElement {
  const borderColor = workspace.reachable ? 'var(--border-color, #d1d5db)' : 'var(--color-danger, #dc2626)';
  const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
  const [updateConfirmationSetting] = useUpdateWorkspaceConfirmationSettingMutation();

  const handleToggleConfirmation = useCallback(() => {
    // FR-004/SC-002 -- reuses updateConfirmationSetting() unmodified;
    // AgentLoopService already re-reads confirmation_relaxed fresh on
    // every call, so the effect is immediate by construction on the
    // backend this mutation calls.
    updateConfirmationSetting({ id: workspace.id, relaxed: !workspace.confirmation_relaxed });
  }, [updateConfirmationSetting, workspace.id, workspace.confirmation_relaxed]);

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

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.5rem' }}>
        <div
          data-testid={`workspace-confirmation-state-${workspace.id}`}
          style={{ fontSize: '0.8125rem', color: 'var(--text-secondary, #6b7280)' }}
        >
          {workspace.confirmation_relaxed ? 'Confirmation relaxed' : 'Confirmation required'}
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <Link
            to={`/clarion-app/llm-client/workspaces/${workspace.id}/changes`}
            data-testid={`workspace-change-history-link-${workspace.id}`}
            style={{ fontSize: '0.8125rem' }}
          >
            View change history
          </Link>
          <button type="button" data-testid={`workspace-confirmation-toggle-${workspace.id}`} onClick={handleToggleConfirmation}>
            {workspace.confirmation_relaxed ? 'Require confirmation' : 'Relax confirmation'}
          </button>
          <button type="button" data-testid={`workspace-remove-toggle-${workspace.id}`} onClick={() => setShowRemoveConfirm(true)}>
            Remove
          </button>
        </div>
      </div>

      {showRemoveConfirm && (
        <div style={{ marginTop: '0.75rem' }}>
          <WorkspaceRemoveConfirm workspace={workspace} onDismiss={() => setShowRemoveConfirm(false)} />
        </div>
      )}
    </div>
  );
}

export default WorkspaceBrowser;
