import React from 'react';
import { useGetServersQuery } from './serverApi';
import { useGetServerStatusesQuery } from './serverStatusApi';
import { ServerCard } from './ServerCard';
import { ServerType, ServerStatusType } from './types';

interface ServersSectionProps {
  highlightedServerId?: string | null;
}

/**
 * ServersSection — read-only server list with status badges and refresh buttons.
 *
 * - Displays all configured servers.
 * - Each server card shows name, status badge, model count, and refresh button.
 * - Status data comes from the serverStatusApi (projected from events).
 * - FR-004: highlightedServerId highlights a specific server card.
 */
export function ServersSection({ highlightedServerId }: ServersSectionProps = {}): React.ReactElement {
  const { data: servers = [], isLoading: isLoadingServers } = useGetServersQuery(null);
  const { data: statuses = [] } = (useGetServerStatusesQuery() as { data: any[] });

  if (isLoadingServers) {
    return (
      <div data-testid="servers-section" style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-secondary, #6b7280)' }}>
        Loading servers...
      </div>
    );
  }

  if (servers.length === 0) {
    return (
      <div data-testid="servers-section" style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-secondary, #6b7280)' }}>
        No servers configured.
      </div>
    );
  }

  // Build a map of server_id -> status
  const statusMap = new Map<string, ServerStatusType>();
  for (const s of statuses) {
    statusMap.set(s.server_id, s);
  }

  return (
    <div data-testid="servers-section" className="servers-section">
      <h2 style={{ margin: '0 0 1rem', fontSize: '1.125rem', fontWeight: 600 }}>Servers</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {servers.map((server: ServerType) => {
          const serverId = server.id;
          if (!serverId) return null;
          return (
            <ServerCard
              key={serverId}
              server={server}
              status={statusMap.get(serverId) ?? null}
              isHighlighted={serverId === highlightedServerId}
            />
          );
        })}
      </div>
    </div>
  );
}

export default ServersSection;
