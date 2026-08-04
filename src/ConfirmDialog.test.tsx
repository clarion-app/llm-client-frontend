import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmDialog } from './ConfirmDialog';

describe('ConfirmDialog', () => {
  let onConfirm: ReturnType<typeof vi.fn>;
  let onCancel: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onConfirm = vi.fn();
    onCancel = vi.fn();
  });

  it('renders the title and consequence text from its caller', () => {
    render(
      <ConfirmDialog
        title="Delete Server"
        message="This will break the Inference role (gpt-4 on Local Server)."
        confirmLabel="Delete"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    expect(screen.getByText('Delete Server')).toBeInTheDocument();
    expect(screen.getByText('This will break the Inference role (gpt-4 on Local Server).')).toBeInTheDocument();
  });

  it('renders confirm and cancel buttons', () => {
    render(
      <ConfirmDialog
        title="Test"
        message="Consequence text"
        confirmLabel="Confirm"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    expect(screen.getByText('Confirm')).toBeInTheDocument();
    expect(screen.getByText('Cancel')).toBeInTheDocument();
  });

  it('calls onConfirm when the confirm button is clicked', () => {
    render(
      <ConfirmDialog
        title="Test"
        message="Consequence"
        confirmLabel="Proceed"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    fireEvent.click(screen.getByText('Proceed'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('calls onCancel when the cancel button is clicked', () => {
    render(
      <ConfirmDialog
        title="Test"
        message="Consequence"
        confirmLabel="Proceed"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('renders nothing happens without explicit confirmation — no action fires on render', () => {
    render(
      <ConfirmDialog
        title="Test"
        message="Consequence"
        confirmLabel="Proceed"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    // Neither callback should have been called just by rendering
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('renders the consequence text verbatim from the caller', () => {
    const consequence = 'Clearing this will fall back to the installation default: claude-3 (Cloud Server).';
    render(
      <ConfirmDialog
        title="Clear Role"
        message={consequence}
        confirmLabel="Clear"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />
    );

    expect(screen.getByText(consequence)).toBeInTheDocument();
  });

  it('supports a destructive confirm style', () => {
    render(
      <ConfirmDialog
        title="Delete Server"
        message="This action cannot be undone."
        confirmLabel="Delete"
        onConfirm={onConfirm}
        onCancel={onCancel}
        destructive
      />
    );

    const button = screen.getByRole('button', { name: 'Delete' });
    expect(button).toHaveAttribute('data-destructive', 'true');
  });
});
