import React from 'react';

/**
 * EvalDashboardEmptyState — shown when an agent has zero completed/
 * in_progress/incomplete runs (current_pass_rate === null). Mirrors
 * EmptyState.tsx's own layout (icon, one-sentence explanation, one
 * concrete next step) with copy specific to this screen, so the operator
 * is never shown a misleading 0% pass rate for an agent that has never
 * been run.
 */
export function EvalDashboardEmptyState(): React.ReactElement {
  return (
    <div
      data-testid="eval-dashboard-empty-state"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '3rem 1rem',
        textAlign: 'center',
        color: 'var(--text-secondary, #6b7280)',
      }}
    >
      <svg
        width="48"
        height="48"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ marginBottom: '1rem', opacity: 0.5 }}
      >
        <path d="M9 11l3 3L22 4" />
        <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
      <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.25rem', color: 'var(--text-primary, #111827)' }}>
        No results yet
      </h2>
      <p style={{ margin: 0, fontSize: '0.875rem' }}>
        Run this agent&rsquo;s suite to see results here.
      </p>
    </div>
  );
}
