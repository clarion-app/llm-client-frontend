import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useGetRunCasesQuery, useGetRunDetailQuery } from './evalDashboardApi';
import { EvalOutcomeBadge } from './EvalOutcomeBadge';

interface EvalRunBreakdownProps {
  runId?: string;
}

function isForbiddenError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  return (error as { status?: unknown }).status === 403;
}

function isNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  return (error as { status?: unknown }).status === 404;
}

/**
 * EvalRunBreakdown — drills from the dashboard overview into one run's
 * per-case results (US2 Acceptance Scenario 1). Resolves runId purely
 * from the route param, never a required prop — the manifest routes this
 * component with no props. Reachable directly, not only via the
 * dashboard's own link, so both queries carry their own independent
 * operator gate and this screen must render the same generic
 * access-denied state EvalDashboard.tsx renders on a 403, distinct from
 * its own "not available" state on a 404.
 */
export function EvalRunBreakdown({ runId: runIdProp }: EvalRunBreakdownProps = {}): React.ReactElement {
  const { runId: routeRunId } = useParams<{ runId?: string }>();
  const runId = runIdProp ?? routeRunId ?? '';
  const navigate = useNavigate();

  const runDetail = useGetRunDetailQuery(runId, { skip: runId === '' });
  const runCases = useGetRunCasesQuery({ runId }, { skip: runId === '' });

  if (runId === '') {
    return <div data-testid="eval-run-breakdown-not-available">No run was specified.</div>;
  }

  if (isForbiddenError(runDetail.error) || isForbiddenError(runCases.error)) {
    return (
      <div data-testid="eval-dashboard-access-denied">
        You do not have access to this run.
      </div>
    );
  }

  if (isNotFoundError(runDetail.error) || isNotFoundError(runCases.error)) {
    return <div data-testid="eval-run-breakdown-not-available">This run is not available.</div>;
  }

  if (runDetail.isLoading || runCases.isLoading || !runDetail.data || !runCases.data) {
    return <div>Loading…</div>;
  }

  const run = runDetail.data;
  const cases = runCases.data.data;

  return (
    <div data-testid="eval-run-breakdown">
      <h1>{run.agent_label}</h1>
      <div data-testid="eval-run-breakdown-status">{run.status}</div>
      <div data-testid="eval-run-breakdown-outcome-counts" style={{ display: 'flex', gap: '0.75rem' }}>
        {Object.entries(run.outcome_counts).map(([outcome, count]) => (
          <span key={outcome}>
            {outcome}: {count}
          </span>
        ))}
      </div>
      <div>
        {cases.map((caseResult) => (
          <div
            key={caseResult.id}
            data-testid={`eval-run-breakdown-case-row-${caseResult.id}`}
            role="button"
            tabIndex={0}
            onClick={() => navigate(`/clarion-app/llm-client/eval-runs/${runId}/cases/${caseResult.id}`)}
            style={{ cursor: 'pointer', display: 'flex', gap: '0.75rem', padding: '0.5rem 0' }}
          >
            <span>{caseResult.eval_case_id}</span>
            <EvalOutcomeBadge outcome={caseResult.outcome_override ?? caseResult.outcome} />
          </div>
        ))}
      </div>
    </div>
  );
}
