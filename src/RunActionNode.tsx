import React from 'react';
import type { ActionSummary, Delegation } from './types';

/**
 * RunActionNode — one action in a run's diagram: type, target, outcome, a
 * relative-duration bar (or a running/elapsed indicator while still open,
 * FR-004), a failure indicator, and an expand/collapse affordance for
 * nested (action-under-action) children (FR-002) — recursable, since a
 * child action's own children render through this same component.
 *
 * `overlap` is computed by the caller (RunDiagram.tsx) by comparing
 * `[started_at, ended_at]` ranges among siblings (FR-019) and is surfaced
 * here as `data-overlap` so overlapping siblings are visibly distinguishable
 * from purely sequential ones.
 */

export interface RunActionNodeProps {
  action: ActionSummary;
  /** The largest `duration_ms` among this action's siblings, for relative bar sizing. */
  maxDurationMs: number;
  overlap: boolean;
  isExpanded: boolean;
  onToggleExpand: () => void;
  /** Opens this action in the detail panel (FR-005, US2). Optional so this component stays usable without a detail panel wired up. */
  onSelect?: () => void;
  children?: React.ReactNode;
  /**
   * The Delegation row naming this action as its own `parent_action_id`, if
   * one exists (098-delegation-protocol, US3, contracts/delegation-protocol-api.md
   * §4). Resolved by the caller (RunDiagram.tsx) from a run-wide lookup map,
   * never fetched here.
   */
  delegation?: Delegation;
  /** Navigates the diagram to a delegation's own `helper_run_id` (US3). */
  onOpenDelegation?: (helperRunId: string) => void;
}

function actionStatusLabel(action: ActionSummary): string {
  switch (action.outcome) {
    case 'in_progress':
      return 'Running';
    case 'awaiting_confirmation':
      return 'Awaiting confirmation';
    case 'success':
      return 'Success';
    case 'failure':
      return 'Failed';
    case 'unfinished':
      return 'Unfinished';
    default:
      return action.outcome;
  }
}

export function RunActionNode({
  action,
  maxDurationMs,
  overlap,
  isExpanded,
  onToggleExpand,
  onSelect,
  children,
  delegation,
  onOpenDelegation,
}: RunActionNodeProps): React.ReactElement {
  const isRunning = action.outcome === 'in_progress' && action.ended_at === null;
  const isFailed = action.outcome === 'failure';
  const delegationHelperRunId =
    action.action_type === 'delegation' ? delegation?.helper_run_id ?? null : null;

  const widthPct =
    !isRunning && action.duration_ms !== null && maxDurationMs > 0
      ? Math.max(2, (action.duration_ms / maxDurationMs) * 100)
      : 0;

  const activate = () => {
    onToggleExpand();
    onSelect?.();
  };

  return (
    <div
      data-testid={`run-action-${action.id}`}
      data-outcome={action.outcome}
      data-overlap={overlap ? 'true' : 'false'}
      className={`run-action-node border rounded mb-1 ${isFailed ? 'border-red-300' : 'border-gray-200'}`}
    >
      <div
        className="run-action-node__header flex items-center gap-2 px-2 py-1 cursor-pointer"
        role="button"
        tabIndex={0}
        onClick={activate}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') activate();
        }}
      >
        {action.has_children && <span aria-hidden="true">{isExpanded ? '▾' : '▸'}</span>}
        <span className="text-xs uppercase text-gray-500">{action.action_type}</span>
        <span className="font-medium">{action.target ?? '(no target)'}</span>
        <span className={isFailed ? 'text-red-700' : isRunning ? 'text-blue-700' : 'text-green-700'}>
          {actionStatusLabel(action)}
        </span>
        {overlap && (
          <span className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-800">
            concurrent
          </span>
        )}
        {delegationHelperRunId && (
          <button
            type="button"
            data-testid={`run-action-delegation-link-${action.id}`}
            onClick={(e) => {
              e.stopPropagation();
              onOpenDelegation?.(delegationHelperRunId);
            }}
            className="run-action-node__delegation-link text-xs text-blue-700 underline"
          >
            → helper run
          </button>
        )}
      </div>

      {isFailed && action.failure_reason && (
        <div className="run-action-node__failure mx-2 mb-1 text-xs text-red-700">{action.failure_reason}</div>
      )}

      {isRunning ? (
        <div
          data-testid={`run-action-duration-${action.id}`}
          className="run-action-node__running mx-2 mb-1 text-xs text-blue-700"
          style={{ width: '0%' }}
        >
          running… (elapsed since {action.started_at})
        </div>
      ) : (
        <div className="mx-2 mb-1 h-1 bg-gray-100">
          <div
            data-testid={`run-action-duration-${action.id}`}
            className="run-action-node__duration-bar h-1 bg-teal-500"
            style={{ width: `${widthPct}%` }}
          />
        </div>
      )}

      {isExpanded && action.has_children && (
        <div className="run-action-node__children ml-4 pb-1">{children}</div>
      )}
    </div>
  );
}

export default RunActionNode;
