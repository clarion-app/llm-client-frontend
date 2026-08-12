import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useGetRunCasesQuery, useGetRunDetailQuery } from './evalDashboardApi';
import { EvalOutcomeBadge } from './EvalOutcomeBadge';
import type { EvalRunConsumption } from './types';

interface EvalRunBreakdownProps {
  runId?: string;
}

function formatCost(cost: number | null, unpriced: boolean): string {
  if (unpriced || cost === null) return 'unpriced';
  return `$${cost.toFixed(2)}`;
}

/**
 * What a run consumed to produce its results, alongside — never instead
 * of — its outcome counts. Meaningful at any run status: a run still in
 * progress shows partial, growing consumption for the cases completed so
 * far, never a zero/absent placeholder while cases remain outstanding.
 * The agent-under-test's own figures and what rubric judging separately
 * consumed are kept visibly distinct, never summed together.
 */
function EvalRunConsumptionSummary({ consumption }: { consumption: EvalRunConsumption }): React.ReactElement {
  return (
    <div data-testid="eval-run-breakdown-consumption" style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
      <div>
        <span data-testid="eval-run-breakdown-consumption-total-cost">
          {formatCost(consumption.total_cost, consumption.cost_unpriced)}
        </span>
      </div>
      <div>
        <span data-testid="eval-run-breakdown-consumption-total-tokens">{consumption.total_tokens} tokens</span>
      </div>
      <div>
        <span data-testid="eval-run-breakdown-consumption-tool-invocation-count">
          {consumption.tool_invocation_count} tool calls
        </span>
      </div>
      <div>
        <span data-testid="eval-run-breakdown-consumption-total-duration-ms">
          {consumption.total_duration_ms} ms
        </span>
      </div>
      <div>
        <span>Judging: </span>
        <span data-testid="eval-run-breakdown-consumption-judging-total-cost">
          {formatCost(consumption.judging.total_cost, consumption.judging.cost_unpriced)}
        </span>
        {' · '}
        <span data-testid="eval-run-breakdown-consumption-judging-total-tokens">
          {consumption.judging.total_tokens} tokens
        </span>
        {' · '}
        <span data-testid="eval-run-breakdown-consumption-judging-invocation-count">
          {consumption.judging.invocation_count} calls
        </span>
      </div>
    </div>
  );
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
      <EvalRunConsumptionSummary consumption={run.consumption} />
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
