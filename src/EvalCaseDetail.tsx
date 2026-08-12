import React from 'react';
import { useParams } from 'react-router-dom';
import { useGetCaseDetailQuery } from './evalDashboardApi';
import { EvalOutcomeBadge } from './EvalOutcomeBadge';

interface EvalCaseDetailProps {
  runId?: string;
  caseResultId?: string;
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
 * EvalCaseDetail — the full evidence behind one case's result (US2
 * Acceptance Scenarios 2-3): what it was given, what a correct response
 * should have looked like, what the agent produced, and why it was
 * scored that way. Resolves runId/caseResultId purely from route params,
 * never required props. Reachable directly, so its own 403/404 handling
 * never depends on having passed through the breakdown screen first —
 * a 403 renders the same generic access-denied state as
 * EvalDashboard.tsx/EvalRunBreakdown.tsx, distinct from the 404 state.
 */
export function EvalCaseDetail({
  runId: runIdProp,
  caseResultId: caseResultIdProp,
}: EvalCaseDetailProps = {}): React.ReactElement {
  const params = useParams<{ runId?: string; caseResultId?: string }>();
  const runId = runIdProp ?? params.runId ?? '';
  const caseResultId = caseResultIdProp ?? params.caseResultId ?? '';

  const { data, isLoading, error } = useGetCaseDetailQuery(
    { runId, caseResultId },
    { skip: runId === '' || caseResultId === '' },
  );

  if (runId === '' || caseResultId === '') {
    return <div data-testid="eval-case-detail-not-available">No case was specified.</div>;
  }

  if (isForbiddenError(error)) {
    return (
      <div data-testid="eval-dashboard-access-denied">
        You do not have access to this case.
      </div>
    );
  }

  if (isNotFoundError(error)) {
    return <div data-testid="eval-case-detail-not-available">This case is not available.</div>;
  }

  if (isLoading || !data) {
    return <div>Loading…</div>;
  }

  const effectiveOutcome = data.outcome_override ?? data.outcome;

  return (
    <div data-testid="eval-case-detail">
      <EvalOutcomeBadge outcome={effectiveOutcome} />
      <div data-testid="eval-case-detail-given">{data.given}</div>
      <div data-testid="eval-case-detail-expected-behavior">{data.expected_behavior}</div>
      <div data-testid="eval-case-detail-produced-response">{data.produced_response}</div>
      <div data-testid="eval-case-detail-attempted-actions">
        {data.attempted_actions.map((action, index) => (
          <div key={index}>{action.tool}</div>
        ))}
      </div>
      {data.error_message && <div data-testid="eval-case-detail-error">{data.error_message}</div>}
      <div>
        {data.expectation_results.map((expectation, index) => (
          <div key={index} data-testid={`eval-case-detail-expectation-${index}`}>
            <span>{expectation.kind}</span>
            <span>{expectation.criteria}</span>
            <span>{expectation.met ? 'Met' : 'Not met'}</span>
            {expectation.judgment && (
              <div data-testid={`eval-case-detail-expectation-${index}-judgment`}>
                {expectation.judgment.justification}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
