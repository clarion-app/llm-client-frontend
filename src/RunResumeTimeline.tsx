import React from 'react';
import { useGetRunResumeEventsQuery } from './runApi';
import { eventText } from './resumeText';

/**
 * The timeline of a task's interruptions, resumes and provider retries inside
 * a run's diagram: one entry per event, oldest first, in plain words. A resume
 * names what it reused, ran again and could not confirm by the labels of those
 * actions. No identifier, argument or raw event kind is ever shown. Renders
 * nothing for a run that has none.
 *
 * Events come fifty to a page with the newest last, so a long history shows
 * its first page and its last, and says how many it left out between them.
 */
export function RunResumeTimeline({ runId }: { runId: string }): React.ReactElement | null {
  const first = useGetRunResumeEventsQuery({ runId }, { skip: runId === '' });
  const lastPage = first.data?.meta?.last_page ?? 1;
  const last = useGetRunResumeEventsQuery({ runId, page: lastPage }, { skip: runId === '' || lastPage <= 1 });

  const head = Array.isArray(first.data?.data) ? first.data.data : [];
  const tail = lastPage > 1 && Array.isArray(last.data?.data) ? last.data.data : [];
  if (head.length === 0 && tail.length === 0) return null;

  const total = first.data?.meta?.total ?? head.length;
  const hidden = lastPage > 1 && last.data ? total - head.length - tail.length : 0;

  return (
    <ul data-testid="run-resume-timeline" className="run-resume-timeline text-sm mb-3 list-disc pl-5">
      {head.map((event) => (
        <TimelineEntry key={event.id} event={event} />
      ))}
      {hidden > 0 && <li className="text-gray-600">{hidden} earlier events are not shown</li>}
      {tail.map((event) => (
        <TimelineEntry key={event.id} event={event} />
      ))}
    </ul>
  );
}

function TimelineEntry({ event }: { event: Parameters<typeof eventText>[0] }): React.ReactElement {
  const { headline, details } = eventText(event);
  return (
    <li>
      <span>{headline}</span>
      {details.map((line) => (
        <div key={line} className="pl-2 text-gray-700">
          {line}
        </div>
      ))}
    </li>
  );
}

export default RunResumeTimeline;
