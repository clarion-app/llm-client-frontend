import React from 'react';
import type { AgentSearchEntry, AgentUsageSummary } from './types';

/**
 * AgentCard — the per-agent presentational summary card (095-agent-summary-
 * cards, contracts/frontend-agent-cards.md §3). Replaces AgentBrowser.tsx's
 * former inline row markup (tasks.md Grounding note 12): the name and
 * is_active/can_use badges below are moved here verbatim, unchanged in
 * markup/classNames/wording, so AgentBrowser.test.tsx's and
 * AgentBrowser.pagination.test.tsx's existing row assertions keep passing
 * unmodified.
 *
 * Not routed, not in customFields.clarion, takes no props beyond `agent`
 * (contracts §3) — a plain, prop-driven component.
 *
 * Every field below is read defensively (optional chaining / fallbacks):
 * AgentBrowser.test.tsx's and AgentBrowser.pagination.test.tsx's own
 * `makeAgent()` fixtures predate this feature and do not set the five new
 * fields at all, so this component must render those fixtures without
 * throwing, exactly as it did before this feature (those two files assert
 * only on the name/is_active/can_use badges, never on purpose/capabilities/
 * operation_count/memory_enabled/usage).
 */

const DEFAULT_USAGE: AgentUsageSummary = {
  has_run: false,
  run_count: 0,
  reliability: {
    invocation_count: 0,
    success_count: 0,
    failure_count: 0,
    low_sample: false,
    no_activity: true,
  },
  cost: {
    priced_cost_total: '0.00',
    request_count: 0,
    unpriced_request_count: 0,
    has_estimated_cost: false,
  },
};

export function AgentCard({ agent }: { agent: AgentSearchEntry }): React.ReactElement {
  const capabilities = agent.capabilities ?? [];
  const operationCount = agent.operation_count ?? 0;
  const usage = agent.usage ?? DEFAULT_USAGE;
  const reliability = usage.reliability ?? DEFAULT_USAGE.reliability;
  const cost = usage.cost ?? DEFAULT_USAGE.cost;

  // Driven only by usage.has_run (contracts §3's own explicit rule) — never
  // by cost.request_count or reliability.no_activity, both of which can be
  // non-zero/true on a genuinely-used-but-quiet agent.
  const hasRun = usage.has_run === true;

  let usageStatusText: string;
  if (!hasRun) {
    usageStatusText = 'Not yet used';
  } else if (reliability.no_activity) {
    usageStatusText = 'Used — no tool activity recorded yet';
  } else {
    usageStatusText = 'Used';
  }

  return (
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

      {agent.purpose ? (
        <div
          data-testid="agent-card-purpose"
          className="text-sm text-gray-600 mt-1 line-clamp-2"
        >
          {agent.purpose}
        </div>
      ) : (
        <div data-testid="agent-card-purpose" className="text-sm text-gray-600 mt-1" />
      )}

      <div className="flex items-center gap-1 flex-wrap mt-1">
        {capabilities.map((capability) => (
          <span
            key={capability}
            data-testid="agent-card-capability"
            className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-800"
          >
            {capability}
          </span>
        ))}
        <span
          data-testid="agent-card-memory-badge"
          className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
        >
          {agent.memory_enabled ? 'Memory enabled' : 'No memory access'}
        </span>
      </div>

      <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
        <span data-testid="agent-card-operation-count">~{operationCount} operations</span>
        <span data-testid="agent-card-version">
          {agent.current_version_number != null ? `v${agent.current_version_number}` : 'No version yet'}
        </span>
      </div>

      <div className="mt-1 text-xs text-gray-500">
        <span data-testid="agent-card-usage-status">{usageStatusText}</span>

        {hasRun && (
          <>
            {' '}
            <span data-testid="agent-card-run-count">Ran {usage.run_count} times</span>{' '}
            <span data-testid="agent-card-reliability">
              {reliability.low_sample
                ? 'Too little data yet'
                : `${reliability.success_count} succeeded, ${reliability.failure_count} failed`}
            </span>{' '}
            <span data-testid="agent-card-cost">
              {cost.priced_cost_total}
              {cost.has_estimated_cost && (
                <span data-testid="agent-card-cost-estimated-marker" title="Estimated cost">
                  {' '}
                  (estimated)
                </span>
              )}
            </span>
          </>
        )}
      </div>
    </div>
  );
}

export default AgentCard;
