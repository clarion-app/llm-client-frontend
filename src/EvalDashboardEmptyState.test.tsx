import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EvalDashboardEmptyState } from './EvalDashboardEmptyState';

/**
 * EvalDashboardEmptyState.tsx does not exist yet -- this file is written
 * first, per TDD, and is expected to fail at collection time because
 * `./EvalDashboardEmptyState` cannot be resolved. That failure is correct
 * and expected here.
 *
 * research.md D10: this component mirrors EmptyState.tsx's own layout
 * (icon, one-sentence explanation, one concrete next step) but with copy
 * specific to this feature -- "run this agent's suite to see results here"
 * -- rather than EmptyState.tsx's generic server-setup copy, since FR-011
 * requires an explanation of what to do next, not a bare "nothing here."
 *
 * Conventions assumed below: root container data-testid="eval-dashboard-empty-state".
 */

describe('EvalDashboardEmptyState', () => {
  it('renders an icon, a one-sentence explanation, and one concrete next step specific to running the agent\'s suite', () => {
    render(<EvalDashboardEmptyState />);

    expect(screen.getByTestId('eval-dashboard-empty-state')).toBeInTheDocument();

    // FR-011: the explanation must point at running the suite -- distinct,
    // feature-specific copy, not EmptyState.tsx's generic "add your first
    // server" message.
    expect(screen.getByText(/run.*suite.*see results|run.*agent.*suite/i)).toBeInTheDocument();

    const svg = document.querySelector('svg');
    expect(svg).not.toBeNull();
  });

  it('never renders a numeric pass rate or any zero-like figure alongside the explanation (FR-011: no misleading zero)', () => {
    render(<EvalDashboardEmptyState />);

    expect(screen.queryByText(/0%/)).not.toBeInTheDocument();
    expect(screen.queryByTestId('eval-dashboard-pass-rate')).not.toBeInTheDocument();
  });
});
