import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { useGetOverviewQuery } from './evalDashboardApi';
import { EvalTrendChart } from './EvalTrendChart';
import { EvalPersistentFailuresList } from './EvalPersistentFailuresList';
import { EvalDashboardEmptyState } from './EvalDashboardEmptyState';

interface EvalDashboardProps {
  agentLabel?: string;
}

function isForbiddenError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  return (error as { status?: unknown }).status === 403;
}

/**
 * EvalDashboard — an agent's quality at a glance (US1): current pass rate,
 * a trend over recent history, and its most persistently failing cases,
 * or an explanatory empty state for an agent with no runs yet. Resolves
 * agentLabel purely from the route param — the manifest routes this
 * component with no props, so a required prop here would always be
 * undefined in the host app.
 */
export function EvalDashboard({ agentLabel: agentLabelProp }: EvalDashboardProps = {}): React.ReactElement {
  const { agentLabel: routeAgentLabel } = useParams<{ agentLabel?: string }>();
  const agentLabel = agentLabelProp ?? routeAgentLabel ?? '';

  const { data, isLoading, isError, error } = useGetOverviewQuery(
    { agentLabel },
    { skip: agentLabel === '' },
  );

  if (agentLabel === '') {
    return <div data-testid="eval-dashboard-not-available">No agent was specified.</div>;
  }

  if (isForbiddenError(error)) {
    return (
      <div data-testid="eval-dashboard-access-denied">
        You do not have access to this dashboard.
      </div>
    );
  }

  if (isLoading || !data) {
    if (isError) {
      return (
        <div data-testid="eval-dashboard-access-denied">
          Unable to load this dashboard.
        </div>
      );
    }
    return <div>Loading…</div>;
  }

  // The empty state means "this agent has produced nothing to look at
  // yet", which is not the same as "no run has *finished* yet": an agent
  // whose only runs are still in progress (or ended incomplete) has a null
  // current_pass_rate while its trend buckets and persistent-failure
  // ranking already hold real, recorded results. Showing the "run this
  // agent's suite" explanation over that data would both hide it and state
  // something untrue, so the empty state is gated on all three parts of
  // the overview being empty, and a missing pass rate alone is reported as
  // exactly that.
  const hasNoResultsAtAll =
    data.current_pass_rate === null &&
    data.trend.buckets.length === 0 &&
    data.persistent_failures.length === 0;

  return (
    <div data-testid="eval-dashboard">
      <h1>{data.agent_label}</h1>
      {hasNoResultsAtAll ? (
        <EvalDashboardEmptyState />
      ) : (
        <>
          {data.current_pass_rate === null ? (
            <div data-testid="eval-dashboard-pass-rate-pending">
              No completed run yet.
            </div>
          ) : (
            <>
              <div data-testid="eval-dashboard-pass-rate">
                {Math.round(data.current_pass_rate.pass_rate * 100)}%
              </div>
              <Link
                data-testid="eval-dashboard-current-run-link"
                to={`/clarion-app/llm-client/eval-runs/${data.current_pass_rate.run_id}`}
              >
                View most recent run
              </Link>
            </>
          )}
          <EvalTrendChart buckets={data.trend.buckets} />
          <EvalPersistentFailuresList failures={data.persistent_failures} />
        </>
      )}
    </div>
  );
}
