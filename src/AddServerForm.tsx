import React, { useState, useCallback } from 'react';
import { useCreateServerMutation } from './serverApi';
import { useGetServerStatusesQuery } from './serverStatusApi';
import { ProviderFamily } from './types';
import { useDispatch } from 'react-redux';
import { serverApi } from './serverApi';

interface AddServerFormProps {
  onSuccess?: () => void;
}

/**
 * AddServerForm — form for creating a new server.
 *
 * - Provider family selector (defaults to OpenAI).
 * - Origin URL input (no endpoint path required or displayed).
 * - Create via `createServer` mutation.
 * - After creation, shows in-flight refresh indicator and outcome.
 * - FR-002: Origin-only creation — no endpoint path field.
 */
export function AddServerForm({ onSuccess }: AddServerFormProps = {}): React.ReactElement {
  const [name, setName] = useState('');
  const [serverUrl, setServerUrl] = useState('');
  const [providerType, setProviderType] = useState<ProviderFamily>('openai');
  const [token, setToken] = useState('');
  const dispatch = useDispatch();
  const [createServer, { isLoading: isCreating }] = useCreateServerMutation();
  const { data: serverStatuses = [] } = useGetServerStatusesQuery() as { data: any[] };

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!serverUrl.trim()) return;

      try {
        const result = await createServer({
          name: name.trim() || serverUrl.trim(),
          server_url: serverUrl.trim(),
          provider_type: providerType,
          ...(token ? { token } : {}),
        }).unwrap();

        // Reset form
        setName('');
        setServerUrl('');
        setToken('');

        // Invalidate server list to trigger re-fetch
        dispatch(serverApi.util.invalidateTags(['LLMServer']));

        // Call onSuccess callback
        onSuccess?.();
      } catch {
        // Error handling — RTK Query will handle error state
      }
    },
    [name, serverUrl, providerType, token, createServer, dispatch, onSuccess]
  );

  // Check if there's an in-flight refresh for any server
  const inFlightStatus = serverStatuses.find((s) => s.in_flight);
  const recentStatus = serverStatuses[serverStatuses.length - 1];

  return (
    <div className="add-server-form" data-testid="add-server-form">
      <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600 }}>Add Server</h3>

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {/* Provider family selector */}
        <div>
          <label
            htmlFor="provider-select"
            style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: 500 }}
          >
            Provider Family
          </label>
          <select
            id="provider-select"
            value={providerType}
            onChange={(e) => setProviderType(e.target.value as ProviderFamily)}
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid var(--border-color, #d1d5db)',
              borderRadius: '0.375rem',
              backgroundColor: 'var(--bg-primary, #ffffff)',
            }}
            role="combobox"
          >
            <option value="openai">OpenAI Compatible</option>
            <option value="llama.cpp">llama.cpp</option>
            <option value="anthropic">Anthropic</option>
          </select>
        </div>

        {/* Server name (optional) */}
        <div>
          <label
            htmlFor="server-name"
            style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: 500 }}
          >
            Name (optional)
          </label>
          <input
            id="server-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="My Server"
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid var(--border-color, #d1d5db)',
              borderRadius: '0.375rem',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Server URL (origin only) */}
        <div>
          <label
            htmlFor="server-url"
            style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: 500 }}
          >
            Server URL
          </label>
          <input
            id="server-url"
            type="url"
            value={serverUrl}
            onChange={(e) => setServerUrl(e.target.value)}
            placeholder="https://llm.example.com"
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

        {/* API Token (optional) */}
        <div>
          <label
            htmlFor="server-token"
            style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: 500 }}
          >
            API Token (optional)
          </label>
          <input
            id="server-token"
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="sk-..."
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid var(--border-color, #d1d5db)',
              borderRadius: '0.375rem',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {/* Submit button */}
        <button
          type="submit"
          disabled={isCreating || !serverUrl.trim()}
          style={{
            padding: '0.5rem 1rem',
            backgroundColor: isCreating ? 'var(--bg-muted, #9ca3af)' : 'var(--bg-accent, #2563eb)',
            color: 'white',
            border: 'none',
            borderRadius: '0.375rem',
            cursor: isCreating ? 'not-allowed' : 'pointer',
            fontWeight: 500,
          }}
        >
          {isCreating ? 'Creating...' : 'Add Server'}
        </button>
      </form>

      {/* In-flight refresh indicator */}
      {inFlightStatus && (
        <div
          data-testid="in-flight-indicator"
          style={{
            marginTop: '0.75rem',
            padding: '0.5rem',
            backgroundColor: 'var(--bg-accent, #dbeafe)',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
            color: 'var(--text-accent, #1d4ed8)',
          }}
        >
          Fetching models...
        </div>
      )}

      {/* Recent outcome display */}
      {recentStatus && !recentStatus.in_flight && recentStatus.last_outcome && (
        <div
          style={{
            marginTop: '0.75rem',
            padding: '0.5rem',
            backgroundColor:
              recentStatus.last_outcome === 'models_updated'
                ? 'var(--bg-success, #d1fae5)'
                : 'var(--bg-warning, #fef3c7)',
            borderRadius: '0.375rem',
            fontSize: '0.875rem',
          }}
        >
          {recentStatus.last_outcome === 'models_updated'
            ? `Models updated (${recentStatus.model_count} models)`
            : recentStatus.last_outcome}
        </div>
      )}
    </div>
  );
}

export default AddServerForm;
