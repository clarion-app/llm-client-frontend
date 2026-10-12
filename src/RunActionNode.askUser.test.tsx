import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RunActionNode, type RunActionNodeProps } from './RunActionNode';
import type { ActionSummary } from './types';

/**
 * An `ask_user` action says how its question ended, from what the action
 * summary carries (the summary has no snapshot content):
 *
 * - a `failure` whose reason is `question expired_assumed` is labelled
 *   "Expired — proceeded on assumption", not "Failed";
 * - the waiting (`awaiting_confirmation`) ask of a run stopped on its
 *   question — the caller passes `questionStopped` from the run summary —
 *   is labelled "Expired — work stopped" instead of "Waiting for your
 *   answer";
 * - every other label is unchanged.
 */

// `questionStopped` is not yet part of the component's props; this view of
// the component keeps the file compiling either way.
const Node = RunActionNode as unknown as React.ComponentType<RunActionNodeProps & { questionStopped?: boolean }>;

function makeAction(overrides: Partial<ActionSummary> = {}): ActionSummary {
  return {
    id: 'action-1',
    run_id: 'run-1',
    step_id: 'step-1',
    parent_action_id: null,
    action_type: 'tool_invocation',
    target: 'ask_user',
    outcome: 'success',
    failure_reason: null,
    started_at: '2026-10-12T09:00:00.000000Z',
    ended_at: '2026-10-12T09:30:00.000000Z',
    duration_ms: 1800000,
    has_children: false,
    ...overrides,
  };
}

function renderNode(action: ActionSummary, questionStopped?: boolean) {
  const extra = questionStopped === undefined ? {} : { questionStopped };
  render(
    <Node action={action} maxDurationMs={1000} overlap={false} isExpanded={false} onToggleExpand={() => {}} {...extra} />,
  );

  return screen.getByTestId(`run-action-${action.id}`).textContent ?? '';
}

const waitingAsk = (id = 'action-ask') =>
  makeAction({ id, outcome: 'awaiting_confirmation', ended_at: null, duration_ms: null });

describe('RunActionNode — how an ask_user question ended', () => {
  it('labels an ask that proceeded on its assumption "Expired — proceeded on assumption"', () => {
    const text = renderNode(
      makeAction({ id: 'action-assumed', outcome: 'failure', failure_reason: 'question expired_assumed' }),
    );

    expect(text).toContain('Expired — proceeded on assumption');
    expect(text).not.toContain('Failed');
  });

  it('labels the waiting ask of a stopped run "Expired — work stopped"', () => {
    const text = renderNode(waitingAsk(), true);

    expect(text).toContain('Expired — work stopped');
    expect(text).not.toContain('Waiting for your answer');
  });

  it('keeps "Waiting for your answer" for a waiting ask when the run is not stopped', () => {
    expect(renderNode(waitingAsk('action-pending'), false)).toContain('Waiting for your answer');
  });

  it('keeps "Waiting for your answer" when the caller says nothing about a stop', () => {
    const text = renderNode(waitingAsk('action-older'));

    expect(text).toContain('Waiting for your answer');
    expect(text).not.toContain('Expired');
  });

  it('keeps "Awaiting confirmation" for any other action awaiting confirmation, even in a stopped run', () => {
    const text = renderNode(
      makeAction({
        id: 'action-confirm',
        target: 'execute_operation',
        outcome: 'awaiting_confirmation',
        ended_at: null,
        duration_ms: null,
      }),
      true,
    );

    expect(text).toContain('Awaiting confirmation');
    expect(text).not.toContain('Expired');
  });

  it('keeps an answered ask "Success", even in a run stopped on a later question', () => {
    const text = renderNode(makeAction({ id: 'action-answered' }), true);

    expect(text).toContain('Success');
    expect(text).not.toContain('Expired');
  });

  it('keeps every other ended ask "Failed" with its reason', () => {
    for (const reason of ['question expired', 'question withdrawn', 'question undeliverable']) {
      const id = `action-${reason.replace(/\s+/g, '-')}`;
      const text = renderNode(makeAction({ id, outcome: 'failure', failure_reason: reason }));

      expect(text).toContain('Failed');
      expect(text).toContain(reason);
      expect(text).not.toContain('Expired —');
    }
  });

  it('labels a failure "question expired_assumed" only on an ask_user action', () => {
    const text = renderNode(
      makeAction({
        id: 'action-other',
        target: 'execute_operation',
        outcome: 'failure',
        failure_reason: 'question expired_assumed',
      }),
    );

    expect(text).toContain('Failed');
    expect(text).not.toContain('Expired — proceeded on assumption');
  });
});
