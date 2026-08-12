import React from 'react';
import type { PersistentFailure } from './types';

interface EvalPersistentFailuresListProps {
  failures: PersistentFailure[];
}

/**
 * The "most persistently failing cases" list — one row per
 * persistent_failures entry, with an explicit empty state distinct from a
 * blank area that could be mistaken for a still-loading screen.
 */
export function EvalPersistentFailuresList({ failures }: EvalPersistentFailuresListProps): React.ReactElement {
  if (failures.length === 0) {
    return (
      <div data-testid="eval-persistent-failures-empty" style={{ padding: '1rem', color: 'var(--text-secondary, #6b7280)' }}>
        No persistent failures.
      </div>
    );
  }

  return (
    <div data-testid="eval-persistent-failures-list">
      {failures.map((failure) => (
        <div
          key={failure.eval_case_id}
          data-testid={`eval-persistent-failure-${failure.eval_case_id}`}
          style={{ display: 'flex', gap: '0.75rem', padding: '0.5rem 0' }}
        >
          <span>{failure.eval_case_id}</span>
          <span>
            {failure.fail_count} / {failure.total_count}
          </span>
          <span>{Math.round(failure.fail_rate * 100)}%</span>
        </div>
      ))}
    </div>
  );
}
