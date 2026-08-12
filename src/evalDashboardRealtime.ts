/**
 * Side-effect module: registers handlers for the two eval-run live-update
 * broadcast events — EvalRunUpdated and EvalRunCaseResultRecorded.
 * Importing this module wires up the realtime listeners, mirroring
 * runRealtime.ts's own structure exactly.
 *
 * EvalRunUpdated carries a full run-detail snapshot and patches the
 * matching getRunDetail cache entry in place when one exists, falling
 * back to tag invalidation when it doesn't — a duplicate or out-of-order
 * delivery is harmless, since the payload is always a full snapshot of
 * the row, never a delta.
 *
 * EvalRunCaseResultRecorded carries a small six-field tick, never a
 * case's full content. When the owning run's case list is already
 * cached, it patches the matching entry in place, or appends a
 * lightweight placeholder (empty content fields, filled in once the full
 * case detail is fetched on demand) when the case isn't yet present in
 * that list; when the run's case list was never fetched at all, it is
 * left untouched rather than fabricating a cache entry no one asked for.
 * Separately, and regardless of the case-list cache state, it
 * invalidates that exact case's getCaseDetail cache tag so an *open*
 * detail panel re-fetches full content on its own — an event-triggered
 * re-fetch, not a poll, the same "small tick, full detail on demand"
 * precedent the run-diagram feature's own action-update handling already
 * established.
 */

import { registerUserChannelHandler } from '@clarion-app/frontend-base';
import { evalDashboardApi } from './evalDashboardApi';
import type { EvalCaseResultSummary, EvalRunDetail } from './types';

interface EvalRunCaseResultRecordedPayload {
  id: string;
  run_id: string;
  eval_case_id: string;
  outcome: string;
  outcome_override: string | null;
  created_at: string;
}

registerUserChannelHandler({
  event: '.ClarionApp\\LlmClient\\Events\\EvalRunUpdated',
  handler: (payload, dispatch) => {
    const run = payload as EvalRunDetail;
    if (!run || typeof run.id !== 'string') return;

    let patched = false;

    dispatch(
      evalDashboardApi.util.updateQueryData('getRunDetail', run.id, (draft) => {
        Object.assign(draft, run);
        patched = true;
      }),
    );

    if (!patched) {
      dispatch(evalDashboardApi.util.invalidateTags([{ type: 'EvalRunDetail', id: run.id }]));
    }
  },
});

registerUserChannelHandler({
  event: '.ClarionApp\\LlmClient\\Events\\EvalRunCaseResultRecorded',
  handler: (payload, dispatch) => {
    const tick = payload as EvalRunCaseResultRecordedPayload;
    if (!tick || typeof tick.id !== 'string' || typeof tick.run_id !== 'string') return;

    dispatch(
      evalDashboardApi.util.updateQueryData('getRunCases', { runId: tick.run_id }, (draft) => {
        if (!draft) return;

        const idx = draft.data.findIndex((c) => c.id === tick.id);

        if (idx === -1) {
          const placeholder: EvalCaseResultSummary = {
            id: tick.id,
            eval_case_id: tick.eval_case_id,
            eval_case_version_id: '',
            outcome: tick.outcome as EvalCaseResultSummary['outcome'],
            outcome_override: tick.outcome_override as EvalCaseResultSummary['outcome_override'],
            produced_response: null,
            attempted_actions: [],
            expectation_results: [],
            error_message: null,
            created_at: tick.created_at,
          };
          draft.data.push(placeholder);
        } else {
          draft.data[idx] = {
            ...draft.data[idx],
            eval_case_id: tick.eval_case_id,
            outcome: tick.outcome as EvalCaseResultSummary['outcome'],
            outcome_override: tick.outcome_override as EvalCaseResultSummary['outcome_override'],
            created_at: tick.created_at,
          };
        }
      }),
    );

    // Event-triggered (not polling) re-fetch of this exact case's detail
    // panel, if it is currently open (actively subscribed) — a no-op
    // otherwise, per RTK Query's own subscription semantics.
    dispatch(evalDashboardApi.util.invalidateTags([{ type: 'EvalCaseDetail', id: tick.id }]));
  },
});
