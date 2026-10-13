import React from 'react';
import { RunSummary } from './types';

/**
 * The badge a run shows for its task's budget: paused at, stopped at or
 * concluded at the ceiling. Null when the task is in any other state, or
 * the run is no task's root or paused run.
 */
export function taskBudgetBadge(run: Pick<RunSummary, 'task_budget'>): string | null {
  const budget = run.task_budget;
  if (!budget) return null;
  switch (budget.state) {
    case 'paused':
      return budget.sub_state === 'stopped' ? 'Stopped at budget ceiling' : 'Paused at budget ceiling';
    case 'halted':
      return 'Stopped at budget ceiling';
    case 'concluded':
      return 'Concluded at budget ceiling';
    default:
      return null;
  }
}

/** The task-budget badge for a run header or row; renders nothing when there is none. */
export function RunTaskBudgetBadge({ run }: { run: Pick<RunSummary, 'task_budget'> }): React.ReactElement | null {
  const label = taskBudgetBadge(run);
  if (label === null) return null;
  return (
    <span
      data-testid="run-task-budget-badge"
      className="inline-flex items-center rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800"
    >
      {label}
    </span>
  );
}
