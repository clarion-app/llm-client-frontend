import React, { useState, useMemo } from 'react';
import { useGetAllModelsQuery } from './modelApi';
import { useGetServersQuery } from './serverApi';
import { LanguageModelType } from './types';

/**
 * ModelsSection — displays all available models grouped by server.
 *
 * - Shows model names under their server headings.
 * - Filter input to narrow models across all servers.
 * - Empty group headings disappear when filter narrows results.
 */
export function ModelsSection(): React.ReactElement {
  const { data: allModels = [] } = (useGetAllModelsQuery() as { data: any[] });
  const { data: servers = [] } = useGetServersQuery(null);
  const [filterText, setFilterText] = useState('');

  // Build server name map
  const serverNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of servers) {
      map.set(s.id, s.name);
    }
    return map;
  }, [servers]);

  // Group models by server
  const groupedModels = useMemo(() => {
    const groups = new Map<string, LanguageModelType[]>();

    for (const m of allModels) {
      const key = m.server_id;
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(m);
    }

    // Apply filter
    if (filterText.trim()) {
      const filter = filterText.trim().toLowerCase();
      for (const [key, models] of groups) {
        const filtered = models.filter((m) => m.name.toLowerCase().includes(filter));
        groups.set(key, filtered);
      }
    }

    return groups;
  }, [allModels, filterText]);

  return (
    <div data-testid="models-section" className="models-section">
      <h2 style={{ margin: '0 0 1rem', fontSize: '1.125rem', fontWeight: 600 }}>Available Models</h2>

      {/* Filter input */}
      <div style={{ marginBottom: '1rem' }}>
        <input
          type="text"
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          placeholder="Filter models..."
          style={{
            width: '100%',
            padding: '0.5rem',
            border: '1px solid var(--border-color, #d1d5db)',
            borderRadius: '0.375rem',
            boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Model groups */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {Array.from(groupedModels.entries()).map(([serverId, models]) => {
          // Skip empty groups when filtering
          if (models.length === 0) return null;

          const serverName = serverNameMap.get(serverId) ?? `Server ${serverId}`;

          return (
            <div key={serverId} style={{ border: '1px solid var(--border-color, #e5e7eb)', borderRadius: '0.5rem', overflow: 'hidden' }}>
              {/* Server heading */}
              <div
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: 'var(--bg-muted, #f9fafb)',
                  fontWeight: 600,
                  fontSize: '0.875rem',
                }}
              >
                {serverName}
              </div>

              {/* Model list */}
              <ul style={{ margin: 0, padding: '0.5rem 1rem', listStyle: 'none' }}>
                {models.map((model) => (
                  <li
                    key={model.id}
                    style={{
                      padding: '0.375rem 0',
                      fontSize: '0.875rem',
                      borderBottom: '1px solid var(--border-color, #f3f4f6)',
                    }}
                  >
                    {model.name}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}

        {allModels.length === 0 && (
          <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--text-secondary, #6b7280)' }}>
            No models available. Add a server and refresh models to see them here.
          </div>
        )}
      </div>
    </div>
  );
}

export default ModelsSection;
