import React from 'react';

/**
 * EmptyState — displayed when there are zero servers configured.
 *
 * FR-001: A single "add your first server" step.
 * US1-1: Zero to working model in one place.
 */
export function EmptyState(): React.ReactElement {
  return (
    <div
      data-testid="empty-state"
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
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
      <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.25rem', color: 'var(--text-primary, #111827)' }}>
        Add your first server
      </h2>
      <p style={{ margin: 0, fontSize: '0.875rem' }}>
        Connect an OpenAI-compatible API to get started with conversations and agents.
      </p>
    </div>
  );
}
