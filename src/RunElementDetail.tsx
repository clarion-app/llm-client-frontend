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

/** One chosen option, as the question record stores it. */
interface QuestionChoice {
  number: number;
  text: string;
}

/** The answer an `ask_user` question said it would assume if nobody answered. */
interface AssumedAnswer {
  raw_reply: string;
  is_selection: boolean;
  selected: QuestionChoice[];
}

/** How the question was to be handled if it went unanswered. */
interface QuestionPolicy {
  if_unanswered: string;
  consequential: boolean;
  effective_wait_minutes: number | null;
  assumed_answer: AssumedAnswer | null;
}

/** The parts of an `ask_user` action's recorded question that the summary shows. */
interface QuestionRecord {
  outcome: string;
  policy: QuestionPolicy | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseChoice(value: unknown): QuestionChoice | null {
  if (!isRecord(value) || typeof value.number !== 'number' || typeof value.text !== 'string') return null;
  return { number: value.number, text: value.text };
}

function parseAssumedAnswer(value: unknown): AssumedAnswer | null {
  if (!isRecord(value) || typeof value.raw_reply !== 'string') return null;
  const selected = Array.isArray(value.selected)
    ? value.selected.map(parseChoice).filter((c): c is QuestionChoice => c !== null)
    : [];
  return { raw_reply: value.raw_reply, is_selection: value.is_selection === true, selected };
}

function parsePolicy(value: unknown): QuestionPolicy | null {
  if (!isRecord(value) || typeof value.if_unanswered !== 'string') return null;
  return {
    if_unanswered: value.if_unanswered,
    consequential: value.consequential === true,
    effective_wait_minutes: typeof value.effective_wait_minutes === 'number' ? value.effective_wait_minutes : null,
    assumed_answer: parseAssumedAnswer(value.assumed_answer),
  };
}

/**
 * The recorded question of an `ask_user` action, or null when the content is
 * not one this summary can read: cut to size (no longer JSON), or written
 * before questions recorded their outcome and policy.
 */
function parseQuestionRecord(content: string | null): QuestionRecord | null {
  if (content === null) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  if (!isRecord(parsed) || typeof parsed.outcome !== 'string' || !('policy' in parsed)) return null;
  return { outcome: parsed.outcome, policy: parsePolicy(parsed.policy) };
}

/** Chosen options as "1. Backend, 3. Docs"; the agent's own words in quotes. */
function assumptionText(assumed: AssumedAnswer): string {
  if (assumed.selected.length > 0) {
    return assumed.selected.map((c) => `${c.number}. ${c.text}`).join(', ');
  }
  return `"${assumed.raw_reply}"`;
}

function questionOutcomeText(record: QuestionRecord): string {
  const assumed = record.policy?.assumed_answer ?? null;
  switch (record.outcome) {
    case 'pending':
      return 'Waiting for an answer';
    case 'answered':
      return 'Answered';
    case 'answered_late':
      return 'Answered after work stopped';
    case 'expired':
      return 'Expired — continued without an answer';
    case 'expired_assumed':
      return assumed ? `Expired — proceeded assuming ${assumptionText(assumed)}` : 'Expired — proceeded on assumption';
    case 'stopped':
      return 'Expired — work stopped';
    case 'withdrawn':
      return 'Withdrawn';
    case 'discarded':
      return 'Discarded — conversation ended or deleted';
    case 'undeliverable':
      return 'Could not be delivered';
    default:
      return record.outcome;
  }
}

function policyText(policy: QuestionPolicy): string {
  const base = policy.if_unanswered === 'proceed_on_assumption' ? 'Proceed on assumption' : 'Stop until answered';
  return policy.consequential ? `${base} (consequential)` : base;
}

/** How an `ask_user` question was to be handled if unanswered, and how it ended. */
function QuestionSummary({ record }: { record: QuestionRecord }): React.ReactElement {
  const { policy } = record;
  const assumed = policy?.assumed_answer ?? null;
  return (
    <div data-testid="run-element-detail-question-summary" className="text-sm my-2">
      <div data-testid="run-element-detail-question-outcome" className="font-medium">
        {questionOutcomeText(record)}
      </div>
      {policy && <div data-testid="run-element-detail-question-policy">If unanswered: {policyText(policy)}</div>}
      {assumed && <div data-testid="run-element-detail-question-assumption">Assumption: {assumptionText(assumed)}</div>}
      {policy && policy.effective_wait_minutes !== null && (
        <div data-testid="run-element-detail-question-period">
          Waiting period: {policy.effective_wait_minutes} {policy.effective_wait_minutes === 1 ? 'minute' : 'minutes'}
        </div>
      )}
    </div>
  );
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
  const questionRecord = actionDetail.target === 'ask_user' ? parseQuestionRecord(actionDetail.content) : null;

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

      {questionRecord && <QuestionSummary record={questionRecord} />}

      <pre data-testid="run-element-detail-content" className="whitespace-pre-wrap text-xs">
        {actionDetail.content ?? 'no content recorded'}
      </pre>
    </div>
  );
}

export default RunElementDetail;
