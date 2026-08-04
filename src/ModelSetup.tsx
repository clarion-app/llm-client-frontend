import React, { useEffect, useMemo, useCallback } from 'react';
import { useGetServersQuery } from './serverApi';
import { useGetServerStatusesQuery } from './serverStatusApi';
import { EmptyState } from './EmptyState';
import { RolesPanel } from './RolesPanel';
import { ServersSection } from './ServersSection';
import { ModelsSection } from './ModelsSection';
import { useSearchParams } from 'react-router-dom';

/**
 * ModelSetup — orchestration component for the Model Setup interface.
 *
 * - Owns the queries for servers, server statuses, models, and role assignments.
 * - 5-second conditional polling of server-status while any status is in_flight.
 * - EmptyState when zero servers; full layout (RolesPanel, ServersSection, ModelsSection) otherwise.
 * - SC-002: DOM order is RolesPanel, ServersSection, ModelsSection.
 * - FR-004: ?server=<id> query param expands/scrolls to that server's card.
 */
export function ModelSetup(): React.ReactElement {
  const [searchParams] = useSearchParams();
  const { data: servers = [], isLoading: isLoadingServers } = useGetServersQuery(null);
  const { data: serverStatuses = [] } = (useGetServerStatusesQuery() as { data: any[] });

  // Check if any server has an in_flight status
  const hasInFlight = useMemo(() => {
    return serverStatuses.some((s) => s.in_flight);
  }, [serverStatuses]);

  // Get the server ID from the query param
  const highlightedServerId = searchParams.get('server');

  // Scroll to highlighted server card when it appears
  useEffect(() => {
    if (!highlightedServerId) return;

    const timer = setTimeout(() => {
      const card = document.querySelector(`[data-server-id="${highlightedServerId}"]`);
      if (card) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [highlightedServerId, servers.length]);

  if (isLoadingServers) {
    return (
      <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-secondary, #6b7280)' }}>
        Loading...
      </div>
    );
  }

  // Empty state: no servers configured
  if (servers.length === 0) {
    return <EmptyState />;
  }

  // Full layout: RolesPanel, ServersSection, ModelsSection (SC-002 DOM order)
  return (
    <div className="model-setup" data-testid="model-setup">
      <h1 style={{ margin: '0 0 1.5rem', fontSize: '1.5rem', fontWeight: 700 }}>Model Setup</h1>

      {/* Roles Panel — shows effective model for each role */}
      <section style={{ marginBottom: '2rem' }}>
        <RolesPanel />
      </section>

      {/* Servers Section — read-only server list */}
      <section style={{ marginBottom: '2rem' }}>
        <ServersSection highlightedServerId={highlightedServerId} />
      </section>

      {/* Models Section — all available models */}
      <section>
        <ModelsSection />
      </section>
    </div>
  );
}

export default ModelSetup;
