import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EvalPersistentFailuresList } from './EvalPersistentFailuresList';
import type { PersistentFailure } from './types';

/**
 * EvalPersistentFailuresList.tsx does not exist yet -- this file is written
 * first, per TDD, and is expected to fail at collection time because
 * `./EvalPersistentFailuresList` cannot be resolved. That failure is
 * correct and expected here.
 *
 * Conventions assumed below (this test's own contract for the eventual
 * implementation):
 *   - root container: data-testid="eval-persistent-failures-list"
 *   - a failure row:   data-testid={`eval-persistent-failure-${eval_case_id}`},
 *     whose text content includes eval_case_id, fail_count, total_count, and fail_rate
 *   - empty state:     data-testid="eval-persistent-failures-empty"
 */

function makeFailure(overrides: Partial<PersistentFailure> = {}): PersistentFailure {
  return {
    eval_case_id: 'case-1',
    fail_count: 8,
    total_count: 10,
    fail_rate: 0.8,
    ...overrides,
  };
}

describe('EvalPersistentFailuresList', () => {
  it('renders one row per persistent_failures entry with eval_case_id, fail_count, total_count, and fail_rate', () => {
    const failures = [
      makeFailure({ eval_case_id: 'case-1', fail_count: 8, total_count: 10, fail_rate: 0.8 }),
      makeFailure({ eval_case_id: 'case-2', fail_count: 5, total_count: 6, fail_rate: 0.8333 }),
    ];

    render(<EvalPersistentFailuresList failures={failures} />);

    const rowOne = screen.getByTestId('eval-persistent-failure-case-1');
    expect(rowOne).toHaveTextContent('case-1');
    expect(rowOne).toHaveTextContent('8');
    expect(rowOne).toHaveTextContent('10');

    const rowTwo = screen.getByTestId('eval-persistent-failure-case-2');
    expect(rowTwo).toHaveTextContent('case-2');
    expect(rowTwo).toHaveTextContent('5');
    expect(rowTwo).toHaveTextContent('6');
  });

  it('renders an explicit "no persistent failures" state for an empty array, not a blank area indistinguishable from loading', () => {
    render(<EvalPersistentFailuresList failures={[]} />);

    expect(screen.getByTestId('eval-persistent-failures-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('eval-persistent-failure-case-1')).not.toBeInTheDocument();
  });
});
