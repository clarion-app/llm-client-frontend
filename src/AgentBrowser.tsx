import React, { useEffect, useState } from 'react';
import { useSearchAgentsQuery } from './agentBrowserApi';
import type { AgentSearchEnvelope } from './types';

/**
 * AgentBrowser — the first frontend surface for stored agents
 * (094-agent-search-listing, research.md D5): every agent the caller owns,
 * each marked in-service/retired and usable/view-only, narrowable by a
 * free-text search box over name/instructions (US1+US2). Zero required
 * props (contracts/frontend-agent-browser.md §2) — routed bare via
 * customFields.clarion.routes exactly like every other manifest-routed
 * screen.
 *
 * `page` is local state, initialized to 1 and not yet exposed via any
 * navigation control — Phase 4/US3's own addition (tasks.md's Ordering
 * grounding note).
 *
 * `lastData` retains the most recently successful response across a
 * search-text-driven arg change (a distinct RTK Query cache entry, whose
 * own `data` starts undefined while it fetches) so the search box and the
 * currently-visible rows are never unmounted mid-keystroke — only the very
 * first ever load (or a persistent failure with nothing previously loaded)
 * shows the full-screen loading/error state, mirroring RunsList.tsx's own
 * loading/error/empty branch structure otherwise.
 */
export function AgentBrowser(): React.ReactElement {
  const [searchText, setSearchText] = useState('');
  const [page] = useState(1);

  const { data, isLoading, isError } = useSearchAgentsQuery({ q: searchText || undefined, page });

  const [lastData, setLastData] = useState<AgentSearchEnvelope | undefined>(undefined);

  useEffect(() => {
    if (data) {
      setLastData(data);
    }
  }, [data]);

  const effectiveData = data ?? lastData;

  if (isLoading && !effectiveData) {
    return <div data-testid="agent-browser">Loading...</div>;
  }

  if (isError && !effectiveData) {
    return <div data-testid="agent-browser">Error loading agents</div>;
  }

  if (!effectiveData) {
    return <div data-testid="agent-browser">Loading...</div>;
  }

  const totalUnfiltered = effectiveData.total_unfiltered;

  if (totalUnfiltered === 0) {
    return (
      <div data-testid="agent-browser">
        <div data-testid="agent-browser-empty-account">
          No agents yet. Create your first agent by defining it and calling
          the agents API — no agent-creation screen exists yet in this UI.
        </div>
      </div>
    );
  }

  const agents = effectiveData.data;
  const total = effectiveData.meta.total;

  return (
    <div data-testid="agent-browser">
      <input
        data-testid="agent-browser-search-input"
        type="text"
        value={searchText}
        onChange={(e) => setSearchText(e.target.value)}
        placeholder="Search agents by name or instructions..."
        className="border border-gray-300 rounded px-2 py-1 text-sm w-full mb-3"
      />

      {total === 0 ? (
        <div data-testid="agent-browser-no-match">
          No agents match your search. Try broadening your search terms.
        </div>
      ) : (
        <div>
          {agents.map((agent) => (
            <div
              key={agent.id}
              data-testid={`agent-row-${agent.id}`}
              className="border-b border-gray-200 py-2"
            >
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-700">{agent.name}</span>
                <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium">
                  {agent.is_active ? 'In-service' : 'Retired'}
                </span>
                <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                  {agent.can_use ? 'Usable' : 'View only'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default AgentBrowser;
