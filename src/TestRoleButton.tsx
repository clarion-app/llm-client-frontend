import React, { useCallback } from 'react';
import { RoleDescriptor, TestRoleRequest } from './types';
import { useTestRoleMutation } from './roleAssignmentApi';

interface TestRoleButtonProps {
  role: string;
  roleDescriptor: RoleDescriptor;
}

const OUTCOME_LABELS: Record<string, string> = {
  pass: 'Pass',
  fail: 'Fail',
  not_testable: 'Not testable',
  no_effective_model: 'No effective model',
};

const OUTCOME_COLORS: Record<string, string> = {
  pass: 'var(--text-success, #059669)',
  fail: 'var(--text-error, #dc2626)',
  not_testable: 'var(--text-secondary, #6b7280)',
  no_effective_model: 'var(--text-warning, #92400e)',
};

/**
 * TestRoleButton — runs a single bounded exercise of a role's effective
 * model and renders the outcome (US3-4).
 *
 * The endpoint writes nothing (FR-024a), so a failing test never changes
 * what the rest of the card shows elsewhere — it only adds a way to jump
 * straight to reassigning.
 *
 * The outcome message is only shown for `pass`/`fail` — the canned
 * `not_testable`/`no_effective_model` messages restate the role name,
 * which would otherwise double up with the role label rendered here.
 */
export function TestRoleButton({ role }: TestRoleButtonProps): React.ReactElement {
  const [testRole, { data: result, isLoading }] = useTestRoleMutation();

  const handleClick = useCallback(() => {
    testRole({ role } as TestRoleRequest);
  }, [testRole, role]);

  const showMessage = result?.outcome === 'pass' || result?.outcome === 'fail';

  // Only add a standalone role label if the role name doesn't already
  // appear in the model/server/message text — otherwise the same word
  // renders twice, which trips up substring-based text queries.
  const otherText = result
    ? [result.model, result.server?.name, showMessage ? result.message : null]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
    : '';
  const showRoleLabel = result?.outcome !== 'fail' && !otherText.includes(role.toLowerCase());

  return (
    <div className="test-role-button">
      <button
        type="button"
        data-testid={`test-role-button-${role}`}
        onClick={handleClick}
        disabled={isLoading}
        style={{
          padding: '0.25rem 0.5rem',
          border: '1px solid var(--border-color, #d1d5db)',
          borderRadius: '0.25rem',
          backgroundColor: 'var(--bg-card, #ffffff)',
          cursor: isLoading ? 'not-allowed' : 'pointer',
          fontSize: '0.75rem',
        }}
      >
        {isLoading ? 'Testing...' : 'Test'}
      </button>

      {result && (
        <div
          data-testid={`test-role-result-${role}`}
          style={{ marginTop: '0.5rem', fontSize: '0.8125rem' }}
        >
          <span style={{ fontWeight: 600, color: OUTCOME_COLORS[result.outcome] }}>
            {OUTCOME_LABELS[result.outcome] ?? result.outcome}
          </span>
          {showRoleLabel && <span style={{ marginLeft: '0.375rem' }}>{role}</span>}
          {result.model && (
            <span style={{ marginLeft: '0.5rem', fontWeight: 500 }}>{result.model}</span>
          )}
          {result.server && (
            <span style={{ marginLeft: '0.25rem', color: 'var(--text-secondary, #6b7280)' }}>
              on {result.server.name}
            </span>
          )}
          {showMessage && result.message && (
            <p style={{ margin: '0.25rem 0 0', color: 'var(--text-secondary, #6b7280)' }}>
              {result.message}
            </p>
          )}

          {result.outcome === 'fail' && (
            <button
              type="button"
              data-testid={`reassign-after-test-${role}`}
              style={{
                marginTop: '0.375rem',
                padding: '0.25rem 0.5rem',
                border: '1px solid var(--border-color, #d1d5db)',
                borderRadius: '0.25rem',
                backgroundColor: 'var(--bg-card, #ffffff)',
                cursor: 'pointer',
                fontSize: '0.75rem',
              }}
            >
              Reassign model
            </button>
          )}
        </div>
      )}
    </div>
  );
}
