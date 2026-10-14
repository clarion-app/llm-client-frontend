import type { RunProgress, RunProgressState, RunResumeEvent, RunResumeEventLabel } from './types';

/**
 * Every word the progress panel, the resume timeline and the run list badges
 * show about a task being interrupted, resumed or retried. It mirrors the
 * backend's task resume text: plain language, naming the task, never an
 * identifier, an argument, a raw state or kind, or a percentage.
 */

/** A time of day in UTC, so the same text renders in every environment. */
export function formatTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

/** A date and time in UTC. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${formatTime(iso)}`;
}

/** A duration in whole units: "30m 43s", "1h 02m", "12s". */
export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || ms < 0) return '';
  const total = Math.floor(ms / 1000);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  if (hours > 0) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  if (minutes > 0) return `${minutes}m ${String(seconds).padStart(2, '0')}s`;
  return `${seconds}s`;
}

/** The states in which a task is live and its progress is polled as a fallback to live events. */
export const POLLED_STATES: readonly RunProgressState[] = ['working', 'resuming', 'waiting_provider_retry'];

/** The state in words, with the time that matters for it. */
export function stateText(progress: Pick<RunProgress, 'state' | 'interrupted_at' | 'next_attempt_at'>): string {
  switch (progress.state) {
    case 'working':
      return 'Working';
    case 'resuming':
      return 'Resuming — continuing from where it left off';
    case 'interrupted': {
      const at = formatTime(progress.interrupted_at);
      return `interrupted — will resume automatically${at ? ` (found at ${at})` : ''}`;
    }
    case 'waiting_provider_retry': {
      const at = formatTime(progress.next_attempt_at);
      return `waiting to retry the model provider${at ? ` (next attempt at ${at})` : ''}`;
    }
    case 'waiting_on_user':
      return 'Waiting for you';
    case 'finished':
      return 'Finished';
    case 'failed':
      return 'Failed';
    case 'cancelled':
      return 'Cancelled';
    default:
      return 'Working';
  }
}

/** What the task is doing now, in words; null when it is doing nothing to show. */
export function activityText(activity: RunProgress['activity']): string | null {
  switch (activity.kind) {
    case 'waiting_for_model':
      return 'waiting for the model';
    case 'running_tool':
      return activity.label ? `running ${activity.label}` : 'running a tool';
    case 'waiting_on_helpers':
      return activity.label ? `waiting on helpers: ${activity.label}` : 'waiting on helpers';
    case 'waiting_to_retry':
      return 'waiting to retry';
    case 'between_steps':
      return 'between steps';
    default:
      return null;
  }
}

/** The badge a run row shows for an interrupted, resuming or retry-waiting task; null for every other state. */
export function resumeBadgeText(state: string | null | undefined): string | null {
  switch (state) {
    case 'interrupted':
      return 'Interrupted';
    case 'resuming':
      return 'Resuming';
    case 'waiting_provider_retry':
      return 'Waiting to retry';
    default:
      return null;
  }
}

const RETRY_REASONS: Record<string, string> = {
  timeout: 'did not answer in time',
  rate_limited: 'asked us to slow down',
  unavailable: 'was unavailable',
  connection: 'could not be reached',
  incomplete_stream: 'stopped answering part way',
};

const COULD_NOT_RESUME: Record<string, string> = {
  repeated_interruption: 'it was interrupted too many times',
  legacy_insufficient: 'it was started before this version and its progress cannot be continued safely',
  model_unavailable: 'its model is no longer available',
  tool_unavailable: 'a tool it needs is no longer available',
  superseded: 'a newer request took its place',
  ended_without_outcome: 'it ended without a result',
};

function couldNotResumeReason(code: unknown): string {
  if (typeof code !== 'string') return 'for an unknown reason';
  if (code.startsWith('checkpoint_incoherent')) return 'its saved progress could not be read safely';
  return COULD_NOT_RESUME[code] ?? 'for an unknown reason';
}

function labels(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((entry: RunResumeEventLabel) => (entry && (entry.label || entry.tool)) || '')
    .filter((text): text is string => text !== '');
}

/** One timeline entry: a headline and, for a resume, what was reused, run again and left unconfirmed. */
export function eventText(event: RunResumeEvent): { headline: string; details: string[] } {
  const payload = event.payload ?? {};
  const at = formatTime(event.created_at);
  const when = at ? ` at ${at}` : '';
  const details: string[] = [];

  switch (event.kind) {
    case 'interruption_detected':
      return { headline: `Task was found interrupted${when}`, details };
    case 'takeover':
      return { headline: `Another worker took the task over${when}`, details };
    case 'resume_started': {
      const from = payload.from_step ?? event.step_position;
      const reused = labels(payload.reused);
      const rerun = labels(payload.rerun);
      const unknown = labels(payload.outcome_unknown);
      if (reused.length > 0) details.push(`Reused, not repeated: ${reused.join(', ')}`);
      if (rerun.length > 0) details.push(`Run again: ${rerun.join(', ')}`);
      if (unknown.length > 0) details.push(`Outcome unknown, not repeated: ${unknown.join(', ')}`);
      if (payload.model_call_repeated === true) details.push('The model was asked again for this step');
      return { headline: `Resumed from step ${from ?? '?'}${when}`, details };
    }
    case 'provider_retry_scheduled': {
      const reason = typeof payload.reason === 'string' ? RETRY_REASONS[payload.reason] : undefined;
      const next = typeof payload.next_attempt_at === 'string' ? formatTime(payload.next_attempt_at.replace(' ', 'T') + (payload.next_attempt_at.endsWith('Z') ? '' : 'Z')) : '';
      const attempt = event.attempt ? ` (attempt ${event.attempt})` : '';
      const headline = `Model provider ${reason ?? 'failed'}; will retry${attempt}${next ? `, next attempt at ${next}` : ''}`;
      return { headline, details };
    }
    case 'provider_retry_exhausted': {
      const attempts = typeof payload.attempts === 'number' ? ` after ${payload.attempts} attempts` : '';
      return { headline: `Gave up retrying the model provider${attempts}; no further automatic attempts`, details };
    }
    case 'stopped_unresumable': {
      const steps = typeof payload.completed_steps === 'number' ? ` ${payload.completed_steps} steps were completed and are kept.` : '';
      return { headline: `Could not resume the task: ${couldNotResumeReason(payload.reason_code)}.${steps}`, details };
    }
    case 'resume_refused_cancelled':
      return { headline: 'Not resumed: the task was cancelled', details };
    case 'legacy_adopted':
      return { headline: 'This task was started before this version and is now protected against interruption', details };
    default:
      return { headline: `Something happened to this task${when}`, details };
  }
}
