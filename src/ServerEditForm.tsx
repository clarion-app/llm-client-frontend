import React, { useCallback, useEffect, useState } from 'react';
import { useUpdateServerMutation } from './serverApi';
import { ServerType } from './types';
import { ConfirmDialog } from './ConfirmDialog';

interface ServerEditFormProps {
  server: ServerType;
  onCollapse?: () => void;
}

interface EditableFields {
  name: string;
  server_url: string;
  token: string;
}

function fieldsFromServer(server: ServerType): EditableFields {
  return {
    name: server.name ?? '',
    server_url: server.server_url ?? '',
    // The API never returns the raw token (only has_token) — an untouched
    // token field means "leave it alone", represented locally as empty.
    token: '',
  };
}

/**
 * ServerEditForm — in-place edit form for an existing server (US4).
 *
 * - Local-only edits: nothing is sent to the backend while typing (FR-017).
 * - Save issues a single PUT via the existing `useUpdateServerMutation`.
 * - Collapsing (or navigating away) with unsaved edits warns first via the
 *   shared ConfirmDialog / a beforeunload guard, and only discards on
 *   explicit confirmation.
 * - After a successful save, the fields reflect the backend's normalized
 *   response (e.g. a stripped trailing slash on server_url), not the raw
 *   typed value, and that becomes the new baseline for dirty tracking.
 */
export function ServerEditForm({ server, onCollapse }: ServerEditFormProps): React.ReactElement {
  const [updateServer, { isLoading: isSaving }] = useUpdateServerMutation();
  const [baseline, setBaseline] = useState<EditableFields>(() => fieldsFromServer(server));
  const [values, setValues] = useState<EditableFields>(() => fieldsFromServer(server));
  const [tokenTouched, setTokenTouched] = useState(false);
  const [showCollapseConfirm, setShowCollapseConfirm] = useState(false);

  const isDirty =
    values.name !== baseline.name ||
    values.server_url !== baseline.server_url ||
    values.token !== baseline.token;

  // Warn on browser navigation away while there are unsaved edits (US4-2).
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (isDirty) {
        event.preventDefault();
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  const handleChange = useCallback(
    (field: keyof EditableFields) => (e: React.ChangeEvent<HTMLInputElement>) => {
      if (field === 'token') {
        setTokenTouched(true);
      }
      setValues((prev) => ({ ...prev, [field]: e.target.value }));
    },
    [],
  );

  const handleDiscard = useCallback(() => {
    setValues(baseline);
    setTokenTouched(false);
  }, [baseline]);

  const handleSave = useCallback(async () => {
    if (!server.id) return;

    const payload: Partial<ServerType> = {
      name: values.name,
      server_url: values.server_url,
    };
    // Token semantics match the backend: an untouched token field must be
    // omitted entirely (preserve), never sent as an empty string.
    if (tokenTouched) {
      payload.token = values.token === '' ? undefined : values.token;
    }

    try {
      const result = await updateServer({ id: server.id, server: payload }).unwrap();
      const nextFields: EditableFields = {
        name: result?.name ?? values.name,
        server_url: result?.server_url ?? values.server_url,
        token: '',
      };
      setBaseline(nextFields);
      setValues(nextFields);
      setTokenTouched(false);
    } catch {
      // Error surfaced via RTK Query state — the form keeps the user's edits.
    }
  }, [server.id, tokenTouched, updateServer, values]);

  const handleCollapseClick = useCallback(() => {
    if (isDirty) {
      setShowCollapseConfirm(true);
      return;
    }
    onCollapse?.();
  }, [isDirty, onCollapse]);

  const handleConfirmDiscardAndCollapse = useCallback(() => {
    setValues(baseline);
    setTokenTouched(false);
    setShowCollapseConfirm(false);
    onCollapse?.();
  }, [baseline, onCollapse]);

  return (
    <div className="server-edit-form" data-testid="server-edit-form">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div>
          <label
            htmlFor="server-edit-name"
            style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: 500 }}
          >
            Name
          </label>
          <input
            id="server-edit-name"
            type="text"
            value={values.name}
            onChange={handleChange('name')}
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
          <label
            htmlFor="server-edit-url"
            style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: 500 }}
          >
            Server URL
          </label>
          <input
            id="server-edit-url"
            type="text"
            value={values.server_url}
            onChange={handleChange('server_url')}
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
          <label
            htmlFor="server-edit-token"
            style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: 500 }}
          >
            Token
          </label>
          <input
            id="server-edit-token"
            type="password"
            placeholder="Unchanged"
            value={values.token}
            onChange={handleChange('token')}
            style={{
              width: '100%',
              padding: '0.5rem',
              border: '1px solid var(--border-color, #d1d5db)',
              borderRadius: '0.375rem',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {isDirty && (
          <div
            data-testid="server-edit-dirty"
            style={{ fontSize: '0.8125rem', color: 'var(--text-warning, #d97706)' }}
          >
            Unsaved changes
          </div>
        )}

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            style={{
              padding: '0.5rem 1rem',
              backgroundColor: isSaving ? 'var(--bg-muted, #9ca3af)' : 'var(--bg-accent, #2563eb)',
              color: 'white',
              border: 'none',
              borderRadius: '0.375rem',
              cursor: isSaving ? 'not-allowed' : 'pointer',
              fontWeight: 500,
            }}
          >
            {isSaving ? 'Saving...' : 'Save'}
          </button>
          <button
            type="button"
            data-testid="server-edit-discard"
            onClick={handleDiscard}
            disabled={!isDirty}
            style={{
              padding: '0.5rem 1rem',
              border: '1px solid var(--border-color, #d1d5db)',
              borderRadius: '0.375rem',
              backgroundColor: 'var(--bg-card, #ffffff)',
              cursor: isDirty ? 'pointer' : 'not-allowed',
              fontWeight: 500,
            }}
          >
            {/* Labeled "Revert" (not "Discard") so it can't collide with the
                collapse-confirmation dialog's "Discard" button, which tests
                target by accessible name. */}
            Revert
          </button>
          <button
            type="button"
            data-testid="server-edit-collapse"
            onClick={handleCollapseClick}
            style={{
              padding: '0.5rem 1rem',
              border: '1px solid var(--border-color, #d1d5db)',
              borderRadius: '0.375rem',
              backgroundColor: 'var(--bg-card, #ffffff)',
              cursor: 'pointer',
              fontWeight: 500,
              marginLeft: 'auto',
            }}
          >
            Close
          </button>
        </div>
      </div>

      {showCollapseConfirm && (
        <div style={{ marginTop: '0.75rem' }}>
          <ConfirmDialog
            title="Discard unsaved changes?"
            message="You have unsaved changes to this server. Closing now will discard them."
            confirmLabel="Discard"
            destructive
            onConfirm={handleConfirmDiscardAndCollapse}
            onCancel={() => setShowCollapseConfirm(false)}
          />
        </div>
      )}
    </div>
  );
}

export default ServerEditForm;
