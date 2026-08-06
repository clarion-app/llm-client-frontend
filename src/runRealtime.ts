/**
 * Side-effect module: registers handlers for the three Phase 6 (US3) live-
 * update broadcast events — RunUpdated, RunStepUpdated, RunActionUpdated
 * (contracts/run-realtime-events.md). Importing this module wires up the
 * realtime listeners, mirroring serverStatusRealtime.ts's structure.
 *
 * Each handler is an "upsert by id" into the matching runApi cache entry
 * when one exists, falling back to tag invalidation when it doesn't — so a
 * duplicate or out-of-order delivery is harmless (the payload is always a
 * full snapshot of the row, never a delta), and an event for a
 * collapsed/never-fetched section is simply dropped rather than fabricating
 * a cache entry no one asked for.
 *
 * RunActionUpdated additionally invalidates the `RunActions`-tagged
 * getActionDetail cache entry for that exact action id on every delivery.
 * Because RTK Query only actually re-fetches an invalidated tag for an
 * actively-subscribed query, "only re-fetch when that action's detail panel
 * is open" falls out of RTK Query's own subscription semantics — no
 * separate "is the panel open" tracking is needed here.
 */

import { registerUserChannelHandler } from '@clarion-app/frontend-base';
import { runApi } from './runApi';
import type { RunSummary, StepSummary, ActionSummary } from './types';

registerUserChannelHandler({
  event: '.ClarionApp\\LlmClient\\Events\\RunUpdated',
  handler: (payload, dispatch) => {
    const run = payload as RunSummary;
    if (!run || typeof run.id !== 'string') return;

    let patched = false;

    dispatch(
      runApi.util.updateQueryData('getRun', run.id, (draft) => {
        Object.assign(draft, run);
        patched = true;
      }),
    );

    if (!patched) {
      dispatch(runApi.util.invalidateTags([{ type: 'Run', id: run.id }, { type: 'RunList' }]));
    }
  },
});

registerUserChannelHandler({
  event: '.ClarionApp\\LlmClient\\Events\\RunStepUpdated',
  handler: (payload, dispatch) => {
    const step = payload as StepSummary;
    if (!step || typeof step.id !== 'string' || typeof step.run_id !== 'string') return;

    let patched = false;

    dispatch(
      runApi.util.updateQueryData('getRunSteps', step.run_id, (draft) => {
        if (!draft) return;

        const idx = draft.data.findIndex((s) => s.id === step.id);
        if (idx === -1) {
          draft.data.push(step);
        } else {
          draft.data[idx] = step;
        }
        patched = true;
      }),
    );

    if (!patched) {
      dispatch(runApi.util.invalidateTags([{ type: 'RunSteps', id: step.run_id }]));
    }
  },
});

registerUserChannelHandler({
  event: '.ClarionApp\\LlmClient\\Events\\RunActionUpdated',
  handler: (payload, dispatch) => {
    const action = payload as ActionSummary;
    if (!action || typeof action.id !== 'string') return;

    let patched = false;

    if (action.parent_action_id === null) {
      // Top-level action under a step — belongs in getStepActions' cache.
      dispatch(
        runApi.util.updateQueryData(
          'getStepActions',
          { runId: action.run_id, stepId: action.step_id },
          (draft) => {
            if (!draft) return;

            const idx = draft.data.findIndex((a) => a.id === action.id);
            if (idx === -1) {
              draft.data.push(action);
            } else {
              draft.data[idx] = action;
            }
            patched = true;
          },
        ),
      );

      if (!patched) {
        dispatch(runApi.util.invalidateTags([{ type: 'RunActions', id: action.step_id }]));
      }
    } else {
      // Nested under another action — belongs in getActionChildren' cache
      // for that parent.
      const parentActionId = action.parent_action_id;

      dispatch(
        runApi.util.updateQueryData(
          'getActionChildren',
          { runId: action.run_id, actionId: parentActionId },
          (draft) => {
            if (!draft) return;

            const idx = draft.data.findIndex((a) => a.id === action.id);
            if (idx === -1) {
              draft.data.push(action);
            } else {
              draft.data[idx] = action;
            }
            patched = true;
          },
        ),
      );

      if (!patched) {
        dispatch(runApi.util.invalidateTags([{ type: 'RunActions', id: parentActionId }]));
      }
    }

    // Event-triggered (not polling) re-fetch of this exact action's detail
    // panel, if it is currently open (actively subscribed) — a no-op
    // otherwise, per RTK Query's own subscription semantics.
    dispatch(runApi.util.invalidateTags([{ type: 'RunActions', id: action.id }]));
  },
});
