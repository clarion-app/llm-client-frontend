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
 * `page` is local state, initialized to 1 and exposed via the Prev/Next
 * controls below (`agent-browser-prev-page` / `agent-browser-next-page`,
 * Phase 4/US3, tasks.md T025) — disabled at the bounds using
 * `meta.current_page`/`meta.last_page` from the response, and reset back to
 * 1 whenever the search text changes so a narrowed search never opens on a
 * now-out-of-range page.
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
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useSearchAgentsQuery({ q: searchText || undefined, page });

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchText(e.target.value);
    setPage(1);
  };

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
  const meta = effectiveData.meta;
  const total = meta.total;

  return (
    <div data-testid="agent-browser">
      <input
        data-testid="agent-browser-search-input"
        type="text"
        value={searchText}
        onChange={handleSearchChange}
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

      <div className="flex items-center justify-between mt-3">
        <button
          type="button"
          data-testid="agent-browser-prev-page"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={meta.current_page <= 1}
          className="px-2 py-1 text-sm border border-gray-300 rounded disabled:opacity-50"
        >
          Previous
        </button>
        <button
          type="button"
          data-testid="agent-browser-next-page"
          onClick={() => setPage((p) => p + 1)}
          disabled={meta.current_page >= meta.last_page}
          className="px-2 py-1 text-sm border border-gray-300 rounded disabled:opacity-50"
        >
          Next
        </button>
      </div>
    </div>
  );
}

export default AgentBrowser;
