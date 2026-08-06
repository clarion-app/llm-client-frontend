import React, { useState } from 'react';
import { useGetRunQuery, useGetRunStepsQuery, useGetStepActionsQuery, useGetActionChildrenQuery } from './runApi';
import { RunStepNode } from './RunStepNode';
import { RunActionNode } from './RunActionNode';
import { RunElementDetail } from './RunElementDetail';
import type { RunElementSelection } from './RunElementDetail';
import type { RunSummary, StepSummary, ActionSummary } from './types';

/**
 * RunDiagram — orchestrates a run's diagram (US1): fetches the run summary
 * and ordered step list on mount, lazy-fetches a step's/action's children
 * only on expansion (FR-011), renders overlapping-timing siblings as
 * visibly overlapping (FR-019), and distinguishes end states visually
 * (FR-003, FR-016).
 *
 * A run whose combined step+action count is small (research.md D5) is
 * auto-expanded on load so the "at a glance" experience (SC-001) holds for
 * the common case without requiring a click; larger runs stay collapsed
 * until the user expands a section explicitly. Phase 7 (US4) formalizes
 * this threshold with virtualization for very large runs — this is the
 * minimum viable version needed for US1.
 */

const AUTO_EXPAND_THRESHOLD = 50;

function runStatusLabel(run: RunSummary): string {
  switch (run.end_state) {
    case 'in_progress':
      return 'In progress';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    case 'stopped_early':
      return 'Stopped early';
    case 'abandoned':
      return 'Abandoned';
    default:
      return run.end_state;
  }
}

function isNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  return (error as { status?: unknown }).status === 404;
}

/**
 * Compare `[started_at, ended_at]` ranges among siblings and return the set
 * of ids whose range overlaps at least one other sibling's (FR-019). An
 * element still in progress (no `ended_at`) is treated as ending "now" for
 * this comparison only — a rendering rule, not a data change
 * (data-model.md §1.3).
 */
function computeOverlappingIds(actions: ActionSummary[]): Set<string> {
  const overlapping = new Set<string>();
  const ranges = actions.map((action) => ({
    id: action.id,
    start: new Date(action.started_at).getTime(),
    end: action.ended_at ? new Date(action.ended_at).getTime() : Date.now(),
  }));

  for (let i = 0; i < ranges.length; i++) {
    for (let j = i + 1; j < ranges.length; j++) {
      const a = ranges[i];
      const b = ranges[j];
      if (a.start < b.end && b.start < a.end) {
        overlapping.add(a.id);
        overlapping.add(b.id);
      }
    }
  }

  return overlapping;
}

function maxDuration(items: Array<{ duration_ms: number | null }>): number {
  return Math.max(1, ...items.map((item) => item.duration_ms ?? 0));
}

interface ActionContainerProps {
  runId: string;
  action: ActionSummary;
  maxDurationMs: number;
  overlap: boolean;
  autoExpand: boolean;
  onSelect: (selection: RunElementSelection) => void;
}

/** One action node plus its own lazily-fetched (or auto-expanded) children — recursable for nested actions (FR-002). */
function ActionContainer({ runId, action, maxDurationMs, overlap, autoExpand, onSelect }: ActionContainerProps): React.ReactElement {
  const [manuallyExpanded, setManuallyExpanded] = useState(false);
  const isExpanded = action.has_children && (autoExpand || manuallyExpanded);

  const { data: childrenEnvelope } = useGetActionChildrenQuery(
    { runId, actionId: action.id },
    { skip: !isExpanded },
  );
  const children = childrenEnvelope?.data ?? [];
  const childMaxDuration = maxDuration(children);
  const overlappingChildIds = computeOverlappingIds(children);

  return (
    <RunActionNode
      action={action}
      maxDurationMs={maxDurationMs}
      overlap={overlap}
      isExpanded={isExpanded}
      onToggleExpand={() => setManuallyExpanded((v) => !v)}
      onSelect={() => onSelect({ type: 'action', actionId: action.id })}
    >
      {isExpanded &&
        children.map((child) => (
          <ActionContainer
            key={child.id}
            runId={runId}
            action={child}
            maxDurationMs={childMaxDuration}
            overlap={overlappingChildIds.has(child.id)}
            autoExpand={autoExpand}
            onSelect={onSelect}
          />
        ))}
    </RunActionNode>
  );
}

interface StepContainerProps {
  runId: string;
  step: StepSummary;
  maxDurationMs: number;
  autoExpand: boolean;
  onSelect: (selection: RunElementSelection) => void;
}

/** One step node plus its own lazily-fetched (or auto-expanded) top-level actions. */
function StepContainer({ runId, step, maxDurationMs, autoExpand, onSelect }: StepContainerProps): React.ReactElement {
  const [manuallyExpanded, setManuallyExpanded] = useState(false);
  const isExpanded = autoExpand || manuallyExpanded;

  const { data: actionsEnvelope } = useGetStepActionsQuery(
    { runId, stepId: step.id },
    { skip: !isExpanded },
  );
  const actions = actionsEnvelope?.data ?? [];
  const actionMaxDuration = maxDuration(actions);
  const overlappingIds = computeOverlappingIds(actions);

  return (
    <RunStepNode
      step={step}
      maxDurationMs={maxDurationMs}
      isExpanded={isExpanded}
      onToggleExpand={() => setManuallyExpanded((v) => !v)}
      onSelect={() => onSelect({ type: 'step', step })}
    >
      {isExpanded &&
        actions.map((action) => (
          <ActionContainer
            key={action.id}
            runId={runId}
            action={action}
            maxDurationMs={actionMaxDuration}
            overlap={overlappingIds.has(action.id)}
            autoExpand={autoExpand}
            onSelect={onSelect}
          />
        ))}
    </RunStepNode>
  );
}

export interface RunDiagramProps {
  runId: string;
}

export function RunDiagram({ runId }: RunDiagramProps): React.ReactElement {
  const [selected, setSelected] = useState<RunElementSelection | null>(null);

  const { data: run, isLoading: runLoading, isError: runIsError, error: runError } = useGetRunQuery(runId);

  const { data: stepsEnvelope, isLoading: stepsLoading, isError: stepsIsError, error: stepsError } =
    useGetRunStepsQuery(runId, { skip: !run });

  if (isNotFoundError(runError) || isNotFoundError(stepsError)) {
    return (
      <div data-testid="run-diagram-not-available">
        This run is not available. It may not exist, may have been purged, or may belong to another user.
      </div>
    );
  }

  if (runLoading || !run) {
    if (runIsError) {
      return (
        <div data-testid="run-diagram-not-available">
          This run is not available.
        </div>
      );
    }
    return <div>Loading…</div>;
  }

  if (stepsLoading || !stepsEnvelope) {
    if (stepsIsError) {
      return (
        <div data-testid="run-diagram-not-available">
          This run is not available.
        </div>
      );
    }
    return <div data-testid="run-diagram">Loading…</div>;
  }

  const steps = stepsEnvelope.data;
  const isSmallRun = run.step_count + run.action_count <= AUTO_EXPAND_THRESHOLD;
  const stepMaxDuration = maxDuration(steps);

  return (
    <div data-testid="run-diagram">
      <div className="run-diagram__header flex items-center gap-2 mb-3">
        <h2 className="text-lg font-semibold">Run {run.id}</h2>
        <span
          data-testid="run-status-badge"
          className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium"
        >
          {runStatusLabel(run)}
        </span>
      </div>

      {steps.length === 0 ? (
        <div data-testid="run-diagram-empty">This run has no steps recorded yet.</div>
      ) : (
        <div className="run-diagram__body flex gap-4">
          <div className="run-diagram__steps flex-1">
            {steps.map((step) => (
              <StepContainer
                key={step.id}
                runId={runId}
                step={step}
                maxDurationMs={stepMaxDuration}
                autoExpand={isSmallRun}
                onSelect={setSelected}
              />
            ))}
          </div>
          <div className="run-diagram__detail w-80 shrink-0">
            <RunElementDetail runId={runId} selected={selected} />
          </div>
        </div>
      )}
    </div>
  );
}

export default RunDiagram;
