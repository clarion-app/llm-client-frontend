import React from 'react';
import type { RunSummary } from './types';
import { resumeBadgeText } from './resumeText';

/**
 * The badge a run row shows for a task that is interrupted, resuming or
 * waiting to retry the model provider; nothing for any other state or for a
 * run with no resume block.
 */
export function RunResumeBadge({ run }: { run: Pick<RunSummary, 'resume'> }): React.ReactElement | null {
  const label = resumeBadgeText(run.resume?.state);
  if (label === null) return null;
  return (
    <span
      data-testid="run-resume-badge"
      className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800"
    >
      {label}
    </span>
  );
}
