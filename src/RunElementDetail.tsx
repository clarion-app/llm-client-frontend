import React from 'react';
import { useGetActionDetailQuery } from './runApi';
import type { StepSummary } from './types';

/**
 * RunElementDetail — the detail panel opened when a step or action node is
 * selected in the diagram (US2, FR-005). A step's timing renders straight
 * from the StepSummary the caller already has cached from the step list —
 * no fetch (US2 Acceptance Scenario 1). An action fetches its own detail
 * (the only endpoint that returns `content`) and renders content, result,
 * timing, recorded failure text, and — when `content_truncated` is true — a
 * visible truncation notice rather than presenting the content as complete
 * (FR-006, FR-007).
 */

export type RunElementSelection =
  | { type: 'step'; step: StepSummary }
  | { type: 'action'; actionId: string };

export interface RunElementDetailProps {
  runId: string;
  selected: RunElementSelection | null;
}

function formatDuration(durationMs: number | null): string {
  if (durationMs === null) {
    return '—';
  }
  return `${durationMs} ms`;
}

export function RunElementDetail({ runId, selected }: RunElementDetailProps): React.ReactElement | null {
  const actionId = selected?.type === 'action' ? selected.actionId : undefined;

  const {
    data: actionDetail,
    isLoading: actionLoading,
    isError: actionIsError,
  } = useGetActionDetailQuery({ runId, actionId: actionId ?? '' }, { skip: actionId === undefined });

  if (selected === null) {
    return null;
  }

  if (selected.type === 'step') {
    const { step } = selected;
    return (
      <div data-testid="run-element-detail" className="run-element-detail">
        <h3 className="font-semibold">Step {step.position}</h3>
        <div data-testid="run-element-detail-started-at">Started: {step.started_at}</div>
        <div data-testid="run-element-detail-ended-at">Ended: {step.ended_at ?? '—'}</div>
        <div data-testid="run-element-detail-duration">Duration: {formatDuration(step.duration_ms)}</div>
      </div>
    );
  }

  if (actionIsError) {
    return (
      <div data-testid="run-element-detail-not-available">
        This element is not available. It may not exist, may have been purged, or may belong to another user.
      </div>
    );
  }

  if (actionLoading || !actionDetail) {
    return <div data-testid="run-element-detail">Loading…</div>;
  }

  const isFailed = actionDetail.outcome === 'failure';

  return (
    <div data-testid="run-element-detail" className="run-element-detail">
      <h3 className="text-xs uppercase text-gray-500">{actionDetail.action_type}</h3>
      <div className="font-medium">{actionDetail.target ?? '(no target)'}</div>
      <div data-testid="run-element-detail-started-at">Started: {actionDetail.started_at}</div>
      <div data-testid="run-element-detail-ended-at">Ended: {actionDetail.ended_at ?? '—'}</div>
      <div data-testid="run-element-detail-duration">Duration: {formatDuration(actionDetail.duration_ms)}</div>

      {isFailed && actionDetail.failure_reason && (
        <div data-testid="run-element-detail-failure" className="text-red-700">
          {actionDetail.failure_reason}
        </div>
      )}

      {actionDetail.content_truncated && (
        <div data-testid="run-element-detail-truncated-notice" className="text-amber-700 text-xs">
          Content was truncated because it exceeded the recorded size limit.
        </div>
      )}

      <pre data-testid="run-element-detail-content" className="whitespace-pre-wrap text-xs">
        {actionDetail.content ?? 'no content recorded'}
      </pre>
    </div>
  );
}

export default RunElementDetail;
