import React, { useState, useMemo } from 'react';
import { useGetAllModelsQuery } from './modelApi';
import { useGetServersQuery } from './serverApi';
import { useGetRoleAssignmentsQuery } from './roleAssignmentApi';
import { LanguageModelType } from './types';
import { ModelSearchInput } from './ModelSearchInput';
import { ServerModelGroup } from './ServerModelGroup';

/**
 * ModelsSection — displays all available models grouped by server.
 *
 * - All known models grouped under their server (ServerModelGroup).
 * - ModelSearchInput narrows across all servers (FR-022).
 * - Assignment remains available from the narrowed list (FR-021, FR-022).
 * - Empty group headings disappear when filter narrows results.
 */
export function ModelsSection(): React.ReactElement {
  const { data: allModels = [] } = useGetAllModelsQuery();
  const { data: servers = [] } = useGetServersQuery(null);
  const { data: roleAssignments } = useGetRoleAssignmentsQuery(null);
  const [filterText, setFilterText] = useState('');

  // Build server name map
  const serverNameMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of servers) {
      map.set(s.id, s.name);
    }
    return map;
  }, [servers]);

  // Group models by server, apply filter
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
        const filtered = models.filter(
          (m) =>
            m.name.toLowerCase().includes(filter) ||
            (serverNameMap.get(key) ?? '').toLowerCase().includes(filter)
        );
        if (filtered.length === 0) {
          groups.delete(key);
        } else {
          groups.set(key, filtered);
        }
      }
    }

    return groups;
  }, [allModels, filterText, serverNameMap]);

  return (
    <div data-testid="models-section" className="models-section">
      <h2 style={{ margin: '0 0 1rem', fontSize: '1.125rem', fontWeight: 600 }}>Available Models</h2>

      {/* Search input */}
      <ModelSearchInput value={filterText} onChange={setFilterText} />

      {/* Model groups */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        {Array.from(groupedModels.entries()).map(([serverId, models]) => {
          const serverName = serverNameMap.get(serverId) ?? `Server ${serverId}`;

          return (
            <ServerModelGroup
              key={serverId}
              serverId={serverId}
              serverName={serverName}
              models={models}
              roleAssignments={roleAssignments ?? {
                inference: {
                  role: 'inference',
                  effective: { status: 'unassigned', scope: null, server: null, model: null, reason: null },
                  user_assignment: null,
                  installation_assignment: null,
                },
                embedding: {
                  role: 'embedding',
                  effective: { status: 'unassigned', scope: null, server: null, model: null, reason: null },
                  user_assignment: null,
                  installation_assignment: null,
                },
                image: {
                  role: 'image',
                  effective: { status: 'unassigned', scope: null, server: null, model: null, reason: null },
                  user_assignment: null,
                  installation_assignment: null,
                },
              }}
            />
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
