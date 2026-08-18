import React, { useCallback, useState } from 'react';
import { useCreateCodingProjectMutation } from './workspaceApi';

interface AddWorkspaceFormProps {
  onSuccess?: () => void;
}

/**
 * AddWorkspaceForm — form for registering a new workspace
 * (122-workspace-browser-ui, US2, Acceptance Scenario 3). Reuses
 * `POST coding-project` unmodified (contracts/reused-endpoints.md) --
 * `store()`'s own `realpath()`-resolution/readability validation is what
 * actually rejects a bad root_path; this form surfaces whatever that
 * endpoint reports (RTK Query's own error state), the same idiom
 * AddMcpServerForm.tsx already establishes.
 */
export function AddWorkspaceForm({ onSuccess }: AddWorkspaceFormProps = {}): React.ReactElement {
  const [name, setName] = useState('');
  const [rootPath, setRootPath] = useState('');
  const [testCommand, setTestCommand] = useState('');

  const [createWorkspace, { isLoading: isSaving }] = useCreateCodingProjectMutation();

  const handleSave = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!name.trim() || !rootPath.trim()) return;

      try {
        await createWorkspace({
          name: name.trim(),
          root_path: rootPath.trim(),
          test_command: testCommand.trim() === '' ? null : testCommand.trim(),
        }).unwrap();

        setName('');
        setRootPath('');
        setTestCommand('');

        onSuccess?.();
      } catch {
        // Error surfaced via RTK Query state -- the form keeps the user's edits.
      }
    },
    [name, rootPath, testCommand, createWorkspace, onSuccess],
  );

  return (
    <div className="add-workspace-form" data-testid="add-workspace-form">
      <h3 style={{ margin: '0 0 1rem', fontSize: '1rem', fontWeight: 600 }}>Add Workspace</h3>

      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        <div>
          <label htmlFor="workspace-name" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: 500 }}>
            Name
          </label>
          <input
            id="workspace-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            style={{ width: '100%', padding: '0.5rem', border: '1px solid var(--border-color, #d1d5db)', borderRadius: '0.375rem', boxSizing: 'border-box' }}
          />
        </div>

        <div>
          <label htmlFor="workspace-root-path" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: 500 }}>
            Root path
          </label>
          <input
            id="workspace-root-path"
            type="text"
            value={rootPath}
            onChange={(e) => setRootPath(e.target.value)}
            placeholder="/home/user/projects/my-workspace"
            required
            style={{ width: '100%', padding: '0.5rem', border: '1px solid var(--border-color, #d1d5db)', borderRadius: '0.375rem', boxSizing: 'border-box' }}
          />
        </div>

        <div>
          <label htmlFor="workspace-test-command" style={{ display: 'block', marginBottom: '0.25rem', fontSize: '0.875rem', fontWeight: 500 }}>
            Test command (optional)
          </label>
          <input
            id="workspace-test-command"
            type="text"
            value={testCommand}
            onChange={(e) => setTestCommand(e.target.value)}
            placeholder="npm test"
            style={{ width: '100%', padding: '0.5rem', border: '1px solid var(--border-color, #d1d5db)', borderRadius: '0.375rem', boxSizing: 'border-box' }}
          />
        </div>

        <div>
          <button type="submit" disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </form>
    </div>
  );
}

export default AddWorkspaceForm;
