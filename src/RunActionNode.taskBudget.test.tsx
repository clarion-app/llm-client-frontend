import { describe, it, expect } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { RunActionNode } from './RunActionNode';
import type { ActionSummary, Delegation } from './types';

/**
 * A delegation stopped by its task's budget says so.
 *
 * A helper stopped by the task budget leaves its delegation action
 * `unfinished`; the action summary carries no result, so the label comes
 * from the delegation row the diagram already resolves for the action and
 * passes as `delegation` (the `GET agent-runs/{id}/delegations` row, whose
 * `result_reason` is `task_budget`). Such an action reads "Stopped by task
 * budget" instead of "Unfinished"; every other delegation keeps its label.
 */

function action(overrides: Partial<ActionSummary> = {}): ActionSummary {
  return {
    id: 'action-d',
    run_id: 'run-1',
    step_id: 'step-1',
    parent_action_id: null,
    action_type: 'delegation',
    target: 'helper-a',
    outcome: 'unfinished',
    failure_reason: null,
    started_at: '2026-10-12T09:00:00.000000Z',
    ended_at: '2026-10-12T09:00:30.000000Z',
    duration_ms: 30000,
    has_children: false,
    ...overrides,
  };
}

function delegation(resultReason: string | null, overrides: Record<string, any> = {}): Delegation {
  return {
    id: 'del-1',
    parent_conversation_id: 'conv-1',
    helper_agent_id: 'agent-a',
    helper_agent_name: 'helper-a',
    helper_conversation_id: 'conv-h',
    depth: 1,
    status: 'exhausted',
    task: 'Look into it',
    context: null,
    parent_run_id: 'run-1',
    parent_action_id: 'action-d',
    helper_run_id: 'run-h',
    outcome_summary: null,
    started_at: '2026-10-12T09:00:00.000000Z',
    completed_at: '2026-10-12T09:00:30.000000Z',
    batch_id: null,
    result_status: 'partial',
    result_reason: resultReason,
    ...overrides,
  } as Delegation;
}

function label(a: ActionSummary, d?: Delegation): string {
  cleanup();
  render(<RunActionNode action={a} maxDurationMs={30000} overlap={false} isExpanded={false} onToggleExpand={() => {}} delegation={d} />);

  return screen.getByTestId(`run-action-${a.id}`).textContent ?? '';
}

describe('RunActionNode — a delegation stopped by the task budget', () => {
  it('labels it "Stopped by task budget"', () => {
    const text = label(action(), delegation('task_budget'));

    expect(text).toContain('Stopped by task budget');
    expect(text).not.toContain('Unfinished');
  });

  it.each([
    ['its own bound', delegation('bound_exceeded')],
    ['no result yet', delegation(null)],
    ['no delegation row', undefined],
  ])('keeps "Unfinished" for a delegation stopped otherwise (%s)', (_label, d) => {
    const text = label(action(), d);

    expect(text).toContain('Unfinished');
    expect(text).not.toContain('Stopped by task budget');
  });

  it('labels only the delegation action itself', () => {
    const text = label(action({ action_type: 'tool_invocation', target: 'list_applications', outcome: 'success' }), delegation('task_budget'));

    expect(text).toContain('Success');
    expect(text).not.toContain('Stopped by task budget');
  });
});
