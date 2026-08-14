import React, { useState } from 'react';
import { useListSharesQuery, useListInstallationUsersQuery, useCreateShareMutation } from './agentShareApi';
import type { AgentSharePermission } from './types';

/**
 * ManageSharingPanel — the owner-only "who has access" disclosure this
 * feature adds inline to AgentCard (096-agent-sharing, contracts/
 * frontend-agent-sharing.md §4). Not routed, not in customFields.clarion —
 * a plain, prop-driven component, colocated the same way AgentCard itself
 * is (contracts/frontend-agent-cards.md §3's own precedent).
 *
 * Collapsed by default. Once expanded, lists the agent's current grants
 * (recipient name + permission) via useListSharesQuery, and a small form
 * (recipient picker fed by useListInstallationUsersQuery, a permission
 * picker, and useCreateShareMutation on submit). Both hooks are called on
 * every render regardless of collapse state (Rules of Hooks) — RTK Query's
 * own cache/subscription behavior means this is a cheap, already-shared
 * subscription, not a fresh fetch per toggle.
 *
 * Both a listShares 404 (the agent is no longer owned by the caller — e.g.
 * concurrently deleted) and a createShare 422 (self-share, unknown
 * recipient, invalid permission) are rendered inline as distinct error
 * states rather than thrown/crashed through.
 */

interface ManageSharingPanelProps {
  agentId: string;
}

function permissionLabel(permission: AgentSharePermission): string {
  return permission === 'use_and_edit' ? 'use and edit' : 'use';
}

// RTK Query rejects with either a FetchBaseQueryError ({ status, data }) or
// a SerializedError ({ message }) — neither is imported here to keep this
// narrow; this guard covers only the shape this component actually reads.
function extractErrorMessage(err: unknown, fallback: string): string {
  if (typeof err !== 'object' || err === null) {
    return fallback;
  }
  const data = (err as { data?: unknown }).data;
  if (data && typeof data === 'object') {
    const body = data as { message?: unknown; error?: unknown };
    if (typeof body.message === 'string' && body.message.length > 0) {
      return body.message;
    }
    if (typeof body.error === 'string' && body.error.length > 0) {
      return body.error;
    }
  }
  return fallback;
}

export function ManageSharingPanel({ agentId }: ManageSharingPanelProps): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  const [recipientUserId, setRecipientUserId] = useState('');
  const [permission, setPermission] = useState<AgentSharePermission>('use');
  const [formError, setFormError] = useState<string | null>(null);

  const { data: sharesData, isError: sharesIsError } = useListSharesQuery({ agentId });
  const { data: installationUsers } = useListInstallationUsersQuery();
  const [createShare, { isLoading: isCreating }] = useCreateShareMutation();

  const users = installationUsers ?? [];
  const effectiveRecipientUserId = recipientUserId || users[0]?.id || '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    try {
      await createShare({
        agentId,
        recipientUserId: effectiveRecipientUserId,
        permission,
      }).unwrap();
      setRecipientUserId('');
      setPermission('use');
    } catch (err) {
      setFormError(extractErrorMessage(err, 'Could not share this agent. Please check your selections and try again.'));
    }
  };

  return (
    <div data-testid="manage-sharing-panel">
      <button type="button" data-testid="manage-sharing-toggle" onClick={() => setExpanded((prev) => !prev)}>
        {expanded ? 'Hide sharing' : 'Manage sharing'}
      </button>

      {expanded && (
        <div data-testid="manage-sharing-content">
          {sharesIsError ? (
            <div data-testid="manage-sharing-not-owned-error">
              This agent is no longer available to manage sharing for.
            </div>
          ) : (
            <>
              <ul>
                {(sharesData?.data ?? []).map((share) => (
                  <li key={share.id} data-testid={`agent-share-row-${share.recipient_user_id}`}>
                    {share.recipient_name} — {permissionLabel(share.permission)}
                  </li>
                ))}
              </ul>

              <form onSubmit={handleSubmit}>
                <select
                  data-testid="share-recipient-select"
                  value={effectiveRecipientUserId}
                  onChange={(e) => setRecipientUserId(e.target.value)}
                >
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>

                <select
                  data-testid="share-permission-select"
                  value={permission}
                  onChange={(e) => setPermission(e.target.value as AgentSharePermission)}
                >
                  <option value="use">Use</option>
                  <option value="use_and_edit">Use and edit</option>
                </select>

                <button type="submit" data-testid="share-submit" disabled={isCreating}>
                  Share
                </button>
              </form>

              {formError && <div data-testid="manage-sharing-form-error">{formError}</div>}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default ManageSharingPanel;
