import React from 'react';
import type { StepSummary } from './types';

/**
 * RunStepNode — one step in a run's diagram: position, outcome, a
 * relative-duration bar (or a running/elapsed indicator while still open,
 * FR-004), an action-count badge, and an expand/collapse affordance for its
 * actions (rendered by the caller as `children`, lazily fetched only once
 * expanded — RunDiagram.tsx owns that fetch).
 */

export interface RunStepNodeProps {
  step: StepSummary;
  /** The largest `duration_ms` among this step's siblings, for relative bar sizing. */
  maxDurationMs: number;
  isExpanded: boolean;
  onToggleExpand: () => void;
  /** Opens this step in the detail panel (FR-005, US2). Optional so this component stays usable without a detail panel wired up. */
  onSelect?: () => void;
  children?: React.ReactNode;
}

function stepStatusLabel(step: StepSummary): string {
  switch (step.end_state) {
    case 'in_progress':
      return 'Running';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    case 'stopped_early':
      return 'Stopped early';
    case 'abandoned':
      return 'Abandoned';
    default:
      return step.end_state;
  }
}

export function RunStepNode({
  step,
  maxDurationMs,
  isExpanded,
  onToggleExpand,
  onSelect,
  children,
}: RunStepNodeProps): React.ReactElement {
  const isRunning = step.end_state === 'in_progress' && step.ended_at === null;
  const isFailed = step.end_state === 'failed';
  const isAbandoned = step.end_state === 'abandoned';

  const widthPct =
    !isRunning && step.duration_ms !== null && maxDurationMs > 0
      ? Math.max(2, (step.duration_ms / maxDurationMs) * 100)
      : 0;

  const activate = () => {
    onToggleExpand();
    onSelect?.();
  };

  return (
    <div
      data-testid={`run-step-${step.id}`}
      data-outcome={step.end_state}
      className="run-step-node border border-gray-200 rounded mb-2"
    >
      <div
        className="run-step-node__header flex items-center gap-2 px-2 py-1 cursor-pointer"
        role="button"
        tabIndex={0}
        onClick={activate}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') activate();
        }}
      >
        <span aria-hidden="true">{isExpanded ? '▾' : '▸'}</span>
        <span className="font-semibold">Step {step.position}</span>
        <span
          className={
            isFailed ? 'text-red-700' : isAbandoned ? 'text-amber-700' : isRunning ? 'text-blue-700' : 'text-green-700'
          }
        >
          {stepStatusLabel(step)}
        </span>
        {step.action_count > 0 && (
          <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs">
            {step.action_count} action{step.action_count === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {isRunning ? (
        <div
          data-testid={`run-step-duration-${step.id}`}
          className="run-step-node__running mx-2 mb-1 text-xs text-blue-700"
          style={{ width: '0%' }}
        >
          running… (elapsed since {step.started_at})
        </div>
      ) : (
        <div className="mx-2 mb-1 h-1 bg-gray-100">
          <div
            data-testid={`run-step-duration-${step.id}`}
            className="run-step-node__duration-bar h-1 bg-blue-500"
            style={{ width: `${widthPct}%` }}
          />
        </div>
      )}

      {isExpanded && <div className="run-step-node__actions ml-4 pb-1">{children}</div>}
    </div>
  );
}

export default RunStepNode;
