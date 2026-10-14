import React, { useEffect, useState } from 'react';
import { useGetRunProgressQuery } from './runApi';
import { POLLED_STATES, activityText, formatDateTime, formatDuration, stateText } from './resumeText';

/**
 * The progress panel at the top of a run's diagram: the task's state in plain
 * words, what it is doing now, how many steps are committed, how far through
 * its structure it is, the allowance used, how long it has run, when it last
 * made progress and how often it was resumed.
 *
 * When the task has no known structure it says the remaining work is unknown.
 * It never shows a percentage. `runId` comes from the parent, which resolves
 * it from its props or the route; the panel never reads route props itself.
 *
 * The panel refetches on the run's live events (runRealtime.ts) and, as a
 * fallback for when broadcasting is down, polls every ten seconds while the
 * task is working, resuming or waiting to retry the provider.
 */

const POLL_MS = 10_000;

export function RunProgressPanel({ runId }: { runId: string }): React.ReactElement | null {
  const [polling, setPolling] = useState(false);
  const { data } = useGetRunProgressQuery(runId, {
    skip: runId === '',
    pollingInterval: polling ? POLL_MS : 0,
  });

  // An answer that is not a progress view is shown as no panel at all.
  const readable = data !== undefined && typeof data.state === 'string' && typeof data.activity?.kind === 'string';
  const live = readable && POLLED_STATES.includes(data.state);
  useEffect(() => {
    setPolling(live);
  }, [live]);

  if (!readable) return null;

  const activity = activityText(data.activity);
  const rows: [string, string][] = [['Steps completed', String(data.steps_completed)]];
  if (data.allowance) {
    rows.push([data.allowance.label, `${data.allowance.steps_used} of ${data.allowance.max_steps}`]);
  }
  if (data.elapsed_ms !== null) rows.push(['Elapsed', formatDuration(data.elapsed_ms)]);
  if (data.last_progress_at) rows.push(['Last progress', formatDateTime(data.last_progress_at)]);
  rows.push(['Resumes', String(data.resume_count)]);

  return (
    <div data-testid="run-progress-panel" className="run-progress-panel border border-gray-200 rounded p-3 mb-3">
      <div className="text-sm font-medium first-letter:uppercase">{stateText(data)}</div>
      {activity !== null && <div className="text-sm text-gray-700 first-letter:uppercase">{activity}</div>}
      <div className="text-sm text-gray-700">
        {data.structure ? data.structure.label : 'Remaining work: unknown'}
      </div>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        {rows.map(([term, value]) => (
          <React.Fragment key={term}>
            <dt className="text-gray-600 first-letter:uppercase">{term}</dt>
            <dd>{value}</dd>
          </React.Fragment>
        ))}
      </dl>
    </div>
  );
}

export default RunProgressPanel;
