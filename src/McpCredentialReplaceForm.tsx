import React, { useCallback, useState } from 'react';
import { useReplaceMcpClientServerCredentialMutation } from './mcpClientServerApi';

interface McpCredentialReplaceFormProps {
  serverId: string;
  onSuccess?: () => void;
}

/**
 * McpCredentialReplaceForm — rotates one server's credential without
 * touching anything else about it (119-mcp-server-management-ui, US3,
 * FR-008/FR-009, D7). Mirrors ServerEditForm.tsx's write-only single-
 * field idiom, but as a dedicated, single-purpose form rather than one
 * field inside a general edit form: structurally, there is no name/url/
 * transport/args field here at all for the endpoint's own D7 guarantee
 * to have anything to violate.
 *
 * The submitted value is held only in local component state, sent once
 * on save, and never echoed back anywhere afterward (Acceptance Scenario
 * 3) — matching the same write-only guarantee AddMcpServerForm already
 * proves for the initial credential.
 */
export function McpCredentialReplaceForm({ serverId, onSuccess }: McpCredentialReplaceFormProps): React.ReactElement {
  const [credential, setCredential] = useState('');
  const [replaceCredential, { isLoading: isSaving }] = useReplaceMcpClientServerCredentialMutation();

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!credential.trim()) return;

      try {
        await replaceCredential({ id: serverId, credential }).unwrap();
        setCredential('');
        onSuccess?.();
      } catch {
        // Error surfaced via RTK Query state — the field keeps the user's edit.
      }
    },
    [credential, replaceCredential, serverId, onSuccess],
  );

  return (
    <div className="mcp-credential-replace-form" data-testid={`mcp-credential-replace-form-${serverId}`}>
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div>
          <label
            htmlFor={`mcp-credential-replace-${serverId}`}
            style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: 500 }}
          >
            New credential
          </label>
          <input
            id={`mcp-credential-replace-${serverId}`}
            type="password"
            autoComplete="off"
            placeholder="Enter the new credential"
            value={credential}
            onChange={(e) => setCredential(e.target.value)}
            required
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid var(--border-color, #d1d5db)',
              borderRadius: '0.375rem',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div>
          <button type="submit" disabled={isSaving || !credential.trim()}>
            {isSaving ? 'Saving…' : 'Save credential'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default McpCredentialReplaceForm;
