import React from 'react';

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  destructive?: boolean;
}

/**
 * ConfirmDialog — shared confirmation dialog for destructive actions.
 *
 * - Used by server deletion (FR-020) and role clearing (FR-012).
 * - Nothing happens without explicit confirmation.
 * - Consequence text is rendered verbatim from the caller.
 * - `destructive` flag applies a red confirm button style.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
  destructive = false,
}: ConfirmDialogProps): React.ReactElement {
  return (
    <div
      className="confirm-dialog"
      data-testid="confirm-dialog"
      style={{
        padding: '1.5rem',
        border: '1px solid var(--border-color, #e5e7eb)',
        borderRadius: '0.75rem',
        backgroundColor: 'var(--bg-card, #ffffff)',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
      }}
    >
      {/* Title */}
      <h3 style={{ margin: '0 0 0.75rem', fontSize: '1.125rem', fontWeight: 600 }}>
        {title}
      </h3>

      {/* Consequence text — rendered verbatim */}
      <p style={{ margin: '0 0 1.25rem', color: 'var(--text-secondary, #374151)', lineHeight: 1.5 }}>
        {message}
      </p>

      {/* Action buttons */}
      <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={onCancel}
          style={{
            padding: '0.5rem 1rem',
            border: '1px solid var(--border-color, #d1d5db)',
            borderRadius: '0.375rem',
            backgroundColor: 'var(--bg-card, #ffffff)',
            cursor: 'pointer',
            fontSize: '0.875rem',
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          data-destructive={destructive ? 'true' : undefined}
          style={{
            padding: '0.5rem 1rem',
            border: 'none',
            borderRadius: '0.375rem',
            backgroundColor: destructive
              ? 'var(--color-danger, #dc2626)'
              : 'var(--color-primary, #3b82f6)',
            color: '#ffffff',
            cursor: 'pointer',
            fontSize: '0.875rem',
          }}
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}
