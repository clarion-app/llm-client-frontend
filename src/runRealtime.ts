/**
 * Side-effect module: registers handlers for the three Phase 6 (US3) live-
 * update broadcast events — RunUpdated, RunStepUpdated, RunActionUpdated
 * (contracts/run-realtime-events.md) — plus, since 106-multi-agent-run-view
 * Phase 4 (US2), DelegationUpdated (data-model.md §3.1). Importing this
 * module wires up the realtime listeners, mirroring
 * serverStatusRealtime.ts's structure.
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
 *
 * DelegationUpdated (research.md D4/D7) and the extended RunUpdated handler
 * both need to find a *matching* cached `getRunArrangement` entry, but
 * neither payload carries the arrangement's own root_run_id (a delegation
 * only knows its own parent_run_id, not the ultimate root of whatever
 * transitively-reachable tree it may be part of; a run update names only
 * its own run id). `runApi.util.selectCachedArgsForQuery(state,
 * 'getRunArrangement')` (dispatched as a thunk, since `dispatch` here is the
 * real store dispatch — react-redux's `useDispatch()`, over a store built
 * with RTK's default thunk middleware, per useUserChannel.ts) enumerates
 * every currently-cached arrangement's own runId, so each handler can check
 * each one in turn rather than guessing which single entry (if any) it
 * belongs to.
 */

import { registerUserChannelHandler } from '@clarion-app/frontend-base';
import { runApi } from './runApi';
import type { RunSummary, StepSummary, ActionSummary, ArrangementDelegation } from './types';

/**
 * Every runId currently holding a cached `getRunArrangement` result —
 * shared by the DelegationUpdated handler and the extended RunUpdated
 * handler below.
 */
function cachedArrangementRunIds(getState: () => unknown): string[] {
  return runApi.util.selectCachedArgsForQuery(getState() as never, 'getRunArrangement');
}

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

    // 106-multi-agent-run-view (US2, T031): also patch this run's own
    // entry inside every currently-cached `getRunArrangement` result's
    // `runs` map, if this run id is one of the ones it already knows about
    // — independent of whether the plain `getRun` cache above was patched
    // (a contributor's own run may never have been fetched via `getRun`
    // directly, only ever surfaced inside an arrangement).
    dispatch((innerDispatch: typeof dispatch, getState: () => unknown) => {
      const arrangementRunIds = cachedArrangementRunIds(getState);

      arrangementRunIds.forEach((arrangementRunId) => {
        innerDispatch(
          runApi.util.updateQueryData('getRunArrangement', arrangementRunId, (draft) => {
            if (run.id in draft.runs) {
              draft.runs[run.id] = run;
            }
          }),
        );
      });
    });
  },
});

registerUserChannelHandler({
  event: '.ClarionApp\\LlmClient\\Events\\DelegationUpdated',
  handler: (payload, dispatch) => {
    const delegation = payload as ArrangementDelegation;
    if (!delegation || typeof delegation.id !== 'string') return;

    dispatch((innerDispatch: typeof dispatch, getState: () => unknown) => {
      const arrangementRunIds = cachedArrangementRunIds(getState);

      arrangementRunIds.forEach((arrangementRunId) => {
        let belongsHere = false;
        let missingRunEntry = false;

        innerDispatch(
          runApi.util.updateQueryData('getRunArrangement', arrangementRunId, (draft) => {
            const idx = draft.delegations.findIndex((d) => d.id === delegation.id);

            if (idx !== -1) {
              draft.delegations[idx] = delegation;
              belongsHere = true;
            } else if (delegation.parent_run_id && delegation.parent_run_id in draft.runs) {
              // A genuinely new delegation belonging to this arrangement
              // (its parent is a run already known to this tree) — upsert
              // it in, rather than dropping it silently.
              draft.delegations.push(delegation);
              belongsHere = true;
            }

            if (belongsHere && delegation.helper_run_id && !(delegation.helper_run_id in draft.runs)) {
              missingRunEntry = true;
            }
          }),
        );

        if (belongsHere && missingRunEntry) {
          // The delegation now names a contributor run this cache entry
          // doesn't have a RunSummary for yet (e.g. the admission
          // transition just stamped helper_run_id) — invalidate as a
          // fallback so the next fetch picks it up (research.md D7),
          // rather than trying to patch in a partial/synthetic RunSummary.
          innerDispatch(runApi.util.invalidateTags([{ type: 'Arrangement', id: arrangementRunId }]));
        }
      });
    });
  },
});

registerUserChannelHandler({
  event: '.ClarionApp\\LlmClient\\Events\\RunStepUpdated',
  handler: (payload, dispatch) => {
    const step = payload as StepSummary;
    if (!step || typeof step.id !== 'string' || typeof step.run_id !== 'string') return;

    let patched = false;

    dispatch(
      runApi.util.updateQueryData('getRunSteps', { runId: step.run_id }, (draft) => {
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
