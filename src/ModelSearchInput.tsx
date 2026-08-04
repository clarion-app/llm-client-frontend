import React from 'react';

interface ModelSearchInputProps {
  value: string;
  onChange: (value: string) => void;
}

/**
 * ModelSearchInput — search/filter input for the models section.
 *
 * - Narrows models across all servers when text is typed (FR-022).
 * - Used by ModelsSection as the filter control.
 */
export function ModelSearchInput({ value, onChange }: ModelSearchInputProps): React.ReactElement {
  return (
    <div style={{ marginBottom: '1rem' }}>
      <input
        type="search"
        data-testid="model-search-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Filter models..."
        style={{
          width: '100%',
          padding: '0.5rem 0.75rem',
          border: '1px solid var(--border-color, #d1d5db)',
          borderRadius: '0.375rem',
          boxSizing: 'border-box',
          fontSize: '0.875rem',
        }}
      />
    </div>
  );
}
