import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('renders a single "add your first server" step message', () => {
    render(<EmptyState />);

    // FR-001: Single "add your first server" step
    expect(screen.getByText(/add.*first.*server/i)).toBeInTheDocument();
  });

  it('does not render any role dropdowns or model lists', () => {
    render(<EmptyState />);

    // No role dropdowns
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();

    // No model lists
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });
});
