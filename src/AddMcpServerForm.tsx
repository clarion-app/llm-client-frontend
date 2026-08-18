import React, { useCallback, useState } from 'react';
import {
  useCreateMcpClientServerMutation,
  useTestMcpClientConnectionMutation,
  useGetMcpClientConnectionTestQuery,
} from './mcpClientServerApi';
import { McpClientServerScope, McpClientServerTransport } from './types';

interface AddMcpServerFormProps {
  onSuccess?: () => void;
}

const FAILURE_MESSAGES: Record<string, string> = {
  unreachable: 'Unreachable — the server could not be contacted.',
  auth_failed: 'Authentication failed — the server rejected the supplied credential.',
  protocol_error: 'Unexpected response — the server replied, but not in a valid form.',
};

/**
 * AddMcpServerForm — form for adding a new external tool (MCP) server,
 * with a real test-before-save step (119-mcp-server-management-ui, US2).
 *
 * - Connection-detail fields: name, transport (streamable_http/stdio),
 *   url (http/https) or command (stdio), optional args, optional
 *   credential, and scope.
 * - "Test" dispatches testMcpClientConnection (FR-003), then polls
 *   getMcpClientConnectionTest at a 2-second interval while the result
 *   is still pending, rendering a specific pass/fail result — never a
 *   generic failure message, and the three failure categories
 *   (unreachable/auth_failed/protocol_error) are always distinguishable
 *   (FR-010).
 * - "Save" calls createMcpClientServer directly (never through the
 *   test-connection endpoint — FR-004/FR-012: an abandoned test leaves
 *   no trace).
 * - The credential value is held only in local component state and is
 *   never echoed back anywhere in the UI, before or after save (FR-008,
 *   Acceptance Scenario 4) — mirroring ServerEditForm's own write-only
 *   token idiom.
 */
export function AddMcpServerForm({ onSuccess }: AddMcpServerFormProps = {}): React.ReactElement {
  const [name, setName] = useState('');
  const [transport, setTransport] = useState<McpClientServerTransport>('streamable_http');
  const [url, setUrl] = useState('');
  const [command, setCommand] = useState('');
  const [argsText, setArgsText] = useState('');
  const [credential, setCredential] = useState('');
  const [scope, setScope] = useState<McpClientServerScope>('personal');

  const [testConnection, { isLoading: isTesting }] = useTestMcpClientConnectionMutation();
  const [createServer, { isLoading: isSaving }] = useCreateMcpClientServerMutation();
  const [testId, setTestId] = useState<string | null>(null);

  const { data: testResult } = useGetMcpClientConnectionTestQuery(testId ?? '', {
    skip: !testId,
    pollingInterval: 2000,
  });

  const args = argsText
    .split(',')
    .map((a) => a.trim())
    .filter((a) => a.length > 0);

  const connectionFields = {
    transport,
    url: transport === 'streamable_http' ? url.trim() || null : null,
    command: transport === 'stdio' ? command.trim() || null : null,
    args: args.length > 0 ? args : null,
    credential: credential.trim() === '' ? null : credential,
  };

  const handleTest = useCallback(async () => {
    setTestId(null);
    try {
      const result = await testConnection(connectionFields).unwrap();
      setTestId(result.id);
    } catch {
      // Error surfaced via RTK Query state.
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [testConnection, transport, url, command, argsText, credential]);

  const handleSave = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!name.trim()) return;

      try {
        await createServer({
          name: name.trim(),
          scope,
          ...connectionFields,
        }).unwrap();

        setName('');
        setUrl('');
        setCommand('');
        setArgsText('');
        setCredential('');
        setTestId(null);

        onSuccess?.();
      } catch {
        // Error surfaced via RTK Query state — the form keeps the user's edits.
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [name, scope, transport, url, command, argsText, credential, createServer, onSuccess],
  );

  const isTestPending = Boolean(testId) && (!testResult || testResult.status === 'pending');

  return (
    <div className="add-mcp-server-form" data-testid="add-mcp-server-form">
      <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600 }}>Add MCP Server</h3>

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div>
          <label htmlFor="mcp-server-name" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: 500 }}>
            Name
          </label>
          <input
            id="mcp-server-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            style={{ width: '100%', padding: '0.5rem', border: '1px solid var(--border-color, #d1d5db)', borderRadius: '0.375rem', boxSizing: 'border-box' }}
          />
        </div>

        <div>
          <label htmlFor="mcp-server-transport" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: 500 }}>
            Transport
          </label>
          <select
            id="mcp-server-transport"
            value={transport}
            onChange={(e) => setTransport(e.target.value as McpClientServerTransport)}
            style={{ width: '100%', padding: '0.5rem', border: '1px solid var(--border-color, #d1d5db)', borderRadius: '0.375rem' }}
          >
            <option value="streamable_http">Streamable HTTP</option>
            <option value="stdio">stdio</option>
          </select>
        </div>

        {transport === 'streamable_http' ? (
          <div>
            <label htmlFor="mcp-server-url" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: 500 }}>
              URL
            </label>
            <input
              id="mcp-server-url"
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://mcp.example.com/mcp"
              style={{ width: '100%', padding: '0.5rem', border: '1px solid var(--border-color, #d1d5db)', borderRadius: '0.375rem', boxSizing: 'border-box' }}
            />
          </div>
        ) : (
          <div>
            <label htmlFor="mcp-server-command" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: 500 }}>
              Command
            </label>
            <input
              id="mcp-server-command"
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder="npx my-mcp-server"
              style={{ width: '100%', padding: '0.5rem', border: '1px solid var(--border-color, #d1d5db)', borderRadius: '0.375rem', boxSizing: 'border-box' }}
            />
          </div>
        )}

        <div>
          <label htmlFor="mcp-server-args" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: 500 }}>
            Arguments (comma-separated, optional)
          </label>
          <input
            id="mcp-server-args"
            type="text"
            value={argsText}
            onChange={(e) => setArgsText(e.target.value)}
            style={{ width: '100%', padding: '0.5rem', border: '1px solid var(--border-color, #d1d5db)', borderRadius: '0.375rem', boxSizing: 'border-box' }}
          />
        </div>

        <div>
          <label htmlFor="mcp-server-credential" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: 500 }}>
            Credential (optional)
          </label>
          <input
            id="mcp-server-credential"
            type="password"
            autoComplete="off"
            value={credential}
            onChange={(e) => setCredential(e.target.value)}
            style={{ width: '100%', padding: '0.5rem', border: '1px solid var(--border-color, #d1d5db)', borderRadius: '0.375rem', boxSizing: 'border-box' }}
          />
        </div>

        <div>
          <label htmlFor="mcp-server-scope" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: 500 }}>
            Scope
          </label>
          <select
            id="mcp-server-scope"
            value={scope}
            onChange={(e) => setScope(e.target.value as McpClientServerScope)}
            style={{ width: '100%', padding: '0.5rem', border: '1px solid var(--border-color, #d1d5db)', borderRadius: '0.375rem' }}
          >
            <option value="personal">Personal</option>
            <option value="project">Shared (project)</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button type="button" onClick={handleTest} disabled={isTesting || isTestPending}>
            {isTesting || isTestPending ? 'Testing…' : 'Test connection'}
          </button>
          <button type="submit" disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Save'}
          </button>
        </div>

        {testResult && (
          <div
            data-testid="mcp-connection-test-result"
            style={{
              padding: '0.5rem 0.75rem',
              borderRadius: '0.375rem',
              fontSize: '0.875rem',
              border: `1px solid ${testResult.status === 'passed' ? 'var(--text-success, #059669)' : testResult.status === 'failed' ? 'var(--text-error, #dc2626)' : 'var(--border-color, #d1d5db)'}`,
              color: testResult.status === 'passed' ? 'var(--text-success, #059669)' : testResult.status === 'failed' ? 'var(--text-error, #dc2626)' : 'var(--text-secondary, #6b7280)',
            }}
          >
            {testResult.status === 'pending' && 'Testing connection…'}
            {testResult.status === 'passed' && `Success — connected, ${testResult.tool_count ?? 0} tool(s) found.`}
            {testResult.status === 'failed' &&
              (testResult.failure_category ? FAILURE_MESSAGES[testResult.failure_category] ?? testResult.message ?? 'The connection test failed.' : testResult.message ?? 'The connection test failed.')}
          </div>
        )}
      </form>
    </div>
  );
}

export default AddMcpServerForm;
