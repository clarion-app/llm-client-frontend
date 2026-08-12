import React from 'react';
import type { EvalCaseOutcome } from './types';

interface EvalOutcomeBadgeProps {
  outcome: EvalCaseOutcome;
}

const OUTCOME_LABELS: Record<EvalCaseOutcome, string> = {
  pass: 'Pass',
  fail: 'Fail',
  needs_human_review: 'Needs review',
  unjudged: 'Unjudged',
  errored: 'Errored',
};

const OUTCOME_COLORS: Record<EvalCaseOutcome, string> = {
  pass: '#16a34a',
  fail: '#dc2626',
  needs_human_review: '#d97706',
  unjudged: '#6b7280',
  errored: '#7c3aed',
};

/**
 * The shared pending/unjudged/pass/fail/errored visual, reused across the
 * overview, run breakdown, and case detail screens: five outcomes, each
 * with its own testid/class/label, so a case pending human judgment is
 * never confusable with an unjudged one, nor with a pass or a fail.
 */
export function EvalOutcomeBadge({ outcome }: EvalOutcomeBadgeProps): React.ReactElement {
  return (
    <span
      data-testid={`eval-outcome-badge-${outcome}`}
      className={`eval-outcome-badge eval-outcome-badge--${outcome}`}
      style={{
        display: 'inline-block',
        padding: '0.125rem 0.5rem',
        borderRadius: '9999px',
        fontSize: '0.75rem',
        fontWeight: 600,
        color: '#fff',
        backgroundColor: OUTCOME_COLORS[outcome],
      }}
    >
      {OUTCOME_LABELS[outcome]}
    </span>
  );
}
