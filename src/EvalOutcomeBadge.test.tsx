import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EvalOutcomeBadge } from './EvalOutcomeBadge';
import type { EvalCaseOutcome } from './types';

/**
 * EvalOutcomeBadge.tsx does not exist yet -- this file is written first,
 * per TDD, and is expected to fail at collection time because
 * `./EvalOutcomeBadge` cannot be resolved. That failure is correct and
 * expected here.
 *
 * SC-004 / FR-006 / FR-007: pending human judgment (needs_human_review)
 * and unjudged must each be visually distinguishable from a pass, a
 * fail, and each other -- never rendered as the same badge. This is
 * every other screen's own contract for the eventual implementation:
 *   - root element: data-testid={`eval-outcome-badge-${outcome}`}
 */

const OUTCOMES: EvalCaseOutcome[] = ['pass', 'fail', 'needs_human_review', 'unjudged', 'errored'];

describe('EvalOutcomeBadge', () => {
  it('renders a distinct, DOM-distinguishable badge for each of the five outcomes', () => {
    OUTCOMES.forEach((outcome) => {
      const { unmount } = render(<EvalOutcomeBadge outcome={outcome} />);

      const badge = screen.getByTestId(`eval-outcome-badge-${outcome}`);
      expect(badge).toBeInTheDocument();

      unmount();
    });
  });

  it('gives each outcome its own class, so pending and unjudged are never rendered as the same badge as each other or as pass/fail', () => {
    const renderedClasses = OUTCOMES.map((outcome) => {
      const { unmount, container } = render(<EvalOutcomeBadge outcome={outcome} />);
      const badge = screen.getByTestId(`eval-outcome-badge-${outcome}`);
      const className = badge.className;
      unmount();
      void container;
      return className;
    });

    // Every outcome's className must be unique across all five --
    // quickstart step 7's own requirement that pending and unjudged are
    // never the same badge as each other, nor as pass/fail/errored.
    const uniqueClasses = new Set(renderedClasses);
    expect(uniqueClasses.size).toBe(OUTCOMES.length);
  });

  it('needs_human_review and unjudged render with distinct testids and distinct visible text from one another', () => {
    const { unmount: unmountPending } = render(<EvalOutcomeBadge outcome="needs_human_review" />);
    const pendingBadge = screen.getByTestId('eval-outcome-badge-needs_human_review');
    const pendingText = pendingBadge.textContent;
    unmountPending();

    const { unmount: unmountUnjudged } = render(<EvalOutcomeBadge outcome="unjudged" />);
    const unjudgedBadge = screen.getByTestId('eval-outcome-badge-unjudged');
    const unjudgedText = unjudgedBadge.textContent;
    unmountUnjudged();

    expect(pendingText).not.toBe(unjudgedText);
  });
});
