import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useGetServersQuery } from './serverApi';
import { useGetAllModelsQuery } from './modelApi';

interface ModelOption {
  server_id: string;
  server_name: string;
  model: string;
}

interface ModelPickerProps {
  onSelect: (value: { server_id: string; model: string }) => void;
  selectedValue?: { server_id: string; model: string } | null;
  role?: string;
}

/**
 * ModelPicker — model selection dropdown grouped by server.
 *
 * - Options grouped under their server name.
 * - Typed text narrows across all servers; empty group headings disappear.
 * - Selected option's value carries (server_id, model) — no code path selects by model name alone.
 * - SC-007: With 200 models across 5 servers, type → click assigns in ≤ 3 interactions.
 */
export function ModelPicker({ onSelect, selectedValue }: ModelPickerProps): React.ReactElement {
  const { data: servers = [] } = useGetServersQuery(null);
  const { data: allModels = [] } = useGetAllModelsQuery();

  const [isOpen, setIsOpen] = useState(false);
  const [filterText, setFilterText] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // Build grouped model options
  const groupedModels = useMemo(() => {
    const serverMap = new Map<string, string>();
    for (const s of servers) {
      serverMap.set(s.id, s.name);
    }

    const groups = new Map<string, ModelOption[]>();
    for (const m of allModels) {
      const serverName = serverMap.get(m.server_id) ?? `Server ${m.server_id}`;
      if (!groups.has(m.server_id)) {
        groups.set(m.server_id, []);
      }
      groups.get(m.server_id)!.push({
        server_id: m.server_id,
        server_name: serverName,
        model: m.name,
      });
    }

    // Filter by text
    if (filterText) {
      const lowerFilter = filterText.toLowerCase();
      for (const [serverId, options] of groups) {
        const filtered = options.filter((o) =>
          o.model.toLowerCase().includes(lowerFilter) ||
          o.server_name.toLowerCase().includes(lowerFilter)
        );
        if (filtered.length === 0) {
          groups.delete(serverId);
        } else {
          groups.set(serverId, filtered);
        }
      }
    }

    return groups;
  }, [servers, allModels, filterText]);

  // Get display text for selected value
  const displayText = useMemo(() => {
    if (!selectedValue) return 'Select a model...';
    const serverName = servers.find((s: { id?: string }) => s.id === selectedValue.server_id)?.name ?? '';
    return `${selectedValue.model}${serverName ? ` (${serverName})` : ''}`;
  }, [selectedValue, servers]);

  // Handle option click
  const handleOptionClick = useCallback(
    (option: ModelOption) => {
      onSelect({ server_id: option.server_id, model: option.model });
      setIsOpen(false);
      setFilterText('');
    },
    [onSelect]
  );

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setFilterText('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={containerRef} className="model-picker" style={{ position: 'relative', minWidth: '280px' }}>
      {/* Trigger button */}
      <button
        type="button"
        role="combobox"
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: '100%',
          padding: '0.5rem 0.75rem',
          border: '1px solid var(--border-color, #d1d5db)',
          borderRadius: '0.375rem',
          backgroundColor: 'var(--bg-primary, #ffffff)',
          textAlign: 'left',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <span style={{ color: selectedValue ? 'var(--text-primary, #111827)' : 'var(--text-secondary, #6b7280)' }}>
          {displayText}
        </span>
        <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary, #6b7280)' }}>
          {isOpen ? '▲' : '▼'}
        </span>
      </button>

      {/* Dropdown */}
      {isOpen && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            right: 0,
            zIndex: 1000,
            marginTop: '0.25rem',
            padding: '0.5rem',
            border: '1px solid var(--border-color, #d1d5db)',
            borderRadius: '0.375rem',
            backgroundColor: 'var(--bg-primary, #ffffff)',
            maxHeight: '300px',
            overflow: 'auto',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
          }}
        >
          {/* Filter input */}
          <input
            type="text"
            placeholder="Search models..."
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            autoFocus
            style={{
              width: '100%',
              padding: '0.375rem 0.5rem',
              marginBottom: '0.5rem',
              border: '1px solid var(--border-color, #d1d5db)',
              borderRadius: '0.25rem',
              fontSize: '0.875rem',
              boxSizing: 'border-box',
            }}
          />

          {/* Grouped options */}
          {Array.from(groupedModels.entries()).map(([serverId, options]) => (
            <div key={serverId} className="model-group">
              {/* Server group heading — only shown when there are models */}
              <div
                style={{
                  padding: '0.25rem 0.5rem',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: 'var(--text-secondary, #6b7280)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}
              >
                {options[0]?.server_name}
              </div>
              {options.map((option) => (
                <div
                  key={`${option.server_id}-${option.model}`}
                  role="option"
                  aria-selected={selectedValue?.server_id === option.server_id && selectedValue?.model === option.model}
                  onClick={() => handleOptionClick(option)}
                  style={{
                    padding: '0.375rem 0.5rem',
                    cursor: 'pointer',
                    borderRadius: '0.25rem',
                    fontSize: '0.875rem',
                    backgroundColor:
                      selectedValue?.server_id === option.server_id && selectedValue?.model === option.model
                        ? 'var(--bg-accent, #e5e7eb)'
                        : 'transparent',
                  }}
                  onMouseEnter={(e) => {
                    if (
                      !(selectedValue?.server_id === option.server_id && selectedValue?.model === option.model)
                    ) {
                      (e.currentTarget as HTMLDivElement).style.backgroundColor = 'var(--bg-hover, #f3f4f6)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (
                      !(selectedValue?.server_id === option.server_id && selectedValue?.model === option.model)
                    ) {
                      (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent';
                    }
                  }}
                >
                  {option.model}
                </div>
              ))}
            </div>
          ))}

          {/* Empty state */}
          {groupedModels.size === 0 && (
            <div style={{ padding: '0.5rem', textAlign: 'center', color: 'var(--text-secondary, #6b7280)', fontSize: '0.875rem' }}>
              {filterText ? 'No models match your search.' : 'No models available.'}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
