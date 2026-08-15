import React from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useGetRunArrangementQuery } from './runApi';
import type { ArrangementDelegation, ArrangementResponse, RunSummary } from './types';

/**
 * RunArrangement — the shape of a finished (or in-progress) multi-agent
 * delegation tree at a glance (106-multi-agent-run-view, US1): entry-point
 * agent, every contributor, the delegation relationships between them,
 * concurrent-vs-sequential ordering, and each contributor's own
 * outcome/duration — reusing 070's `RunDiagram`/`RunSummary` visual
 * vocabulary rather than inventing a second one (research.md D6/D7).
 *
 * The whole tree arrives in one fetch (research.md D5 — a delegation tree
 * is architecturally bounded, unlike a run's own step/action count), so no
 * further requests are made as the user explores it; clicking a contributor
 * navigates to the existing, unmodified `RunDiagram` route for that
 * contributor's own `run_id` (research.md D5's "expand for detail" is a
 * full navigation, not an in-place fetch).
 */

export interface RunArrangementProps {
  /**
   * The run to render the arrangement for. Optional: the route registered
   * in `package.json`'s `customFields.clarion.routes` is
   * `/clarion-app/llm-client/runs/:id/arrangement` and renders
   * `<RunArrangement />` with no props (mirrors `RunDiagram.tsx`'s own
   * already-fixed signature, 070's own reconciliation fix — never
   * reproduce that defect class), so the id comes from the `:id` route
   * param whenever it isn't passed explicitly.
   */
  runId?: string;
}

function isNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  return (error as { status?: unknown }).status === 404;
}

function runStatusLabel(run: RunSummary | undefined): string {
  if (!run) return 'Unknown';
  switch (run.end_state) {
    case 'in_progress':
      return 'In progress';
    case 'completed':
      return 'Completed';
    case 'failed':
      return 'Failed';
    case 'stopped_early':
      return 'Stopped early';
    case 'abandoned':
      return 'Abandoned';
    default:
      return run.end_state;
  }
}

function delegationStatusLabel(status: ArrangementDelegation['status']): string {
  switch (status) {
    case 'queued':
      return 'Queued';
    case 'in_progress':
      return 'In progress';
    case 'completed':
      return 'Completed';
    case 'exhausted':
      return 'Exhausted';
    case 'failed':
      return 'Failed';
    default:
      return status;
  }
}

function formatDuration(durationMs: number | null | undefined): string {
  if (durationMs === null || durationMs === undefined) return '';
  if (durationMs < 1000) return `${durationMs}ms`;
  return `${(durationMs / 1000).toFixed(1)}s`;
}

/**
 * Compare `[started_at, completed_at]` ranges among sibling delegations
 * (delegations sharing the same `parent_run_id`) and return the set of
 * delegation ids whose range overlaps at least one sibling's — the same
 * "detect concurrency by comparing time ranges among siblings" rule 070's
 * data-model.md §1.3 established for actions under a step, reused here for
 * delegations under a parent run (research.md D6). A still-open delegation
 * (no `completed_at`) is treated as ending "now" for this comparison only.
 */
function computeOverlappingDelegationIds(delegations: ArrangementDelegation[]): Set<string> {
  const overlapping = new Set<string>();
  const ranges = delegations.map((d) => ({
    id: d.id,
    start: new Date(d.started_at).getTime(),
    end: d.completed_at ? new Date(d.completed_at).getTime() : Date.now(),
  }));

  for (let i = 0; i < ranges.length; i++) {
    for (let j = i + 1; j < ranges.length; j++) {
      const a = ranges[i];
      const b = ranges[j];
      if (a.start < b.end && b.start < a.end) {
        overlapping.add(a.id);
        overlapping.add(b.id);
      }
    }
  }

  return overlapping;
}

function maxDuration(runs: Array<RunSummary | undefined>): number {
  return Math.max(1, ...runs.map((run) => run?.duration_ms ?? 0));
}

interface DelegationNodeProps {
  delegation: ArrangementDelegation;
  overlap: boolean;
  arrangement: ArrangementResponse;
  delegationsByParentRunId: Record<string, ArrangementDelegation[]>;
  onOpenRun: (runId: string) => void;
  /** The largest duration_ms among this delegation's own siblings, for relative bar sizing (mirrors RunActionNode's maxDurationMs). */
  siblingMaxDurationMs: number;
}

/**
 * One delegation edge: the helper agent it named, whether it ever started
 * (FR-013 — a `queued`/no-`helper_run_id` row renders distinctly from a
 * started-then-failed contributor), and — when it did start — the
 * contributor node (its own status/duration, plus its own further
 * delegations, recursively).
 */
function DelegationNode({
  delegation,
  overlap,
  arrangement,
  delegationsByParentRunId,
  onOpenRun,
  siblingMaxDurationMs,
}: DelegationNodeProps): React.ReactElement {
  const neverStarted = delegation.helper_run_id === null;
  const helperRun = delegation.helper_run_id ? arrangement.runs[delegation.helper_run_id] : undefined;

  return (
    <div
      data-testid={`run-arrangement-delegation-${delegation.id}`}
      data-status={delegation.status}
      data-overlap={overlap ? 'true' : 'false'}
      className="run-arrangement-delegation border-l-2 border-gray-200 pl-3 mb-2"
    >
      <div className="run-arrangement-delegation__header flex items-center gap-2">
        <span className="font-medium">{delegation.helper_agent_name ?? 'Unknown agent'}</span>
        <span className="text-xs uppercase text-gray-500">{delegationStatusLabel(delegation.status)}</span>
        {overlap && (
          <span
            data-testid={`run-arrangement-concurrent-${delegation.id}`}
            className="inline-flex items-center rounded-full bg-purple-100 px-2 py-0.5 text-xs text-purple-800"
          >
            concurrent
          </span>
        )}
        {neverStarted ? (
          <span
            data-testid={`run-arrangement-never-started-${delegation.id}`}
            className="text-xs text-gray-500 italic"
          >
            never started
          </span>
        ) : (
          <button
            type="button"
            data-testid={`run-arrangement-open-${delegation.helper_run_id}`}
            onClick={() => onOpenRun(delegation.helper_run_id as string)}
            className="run-arrangement-delegation__open-link text-xs text-blue-700 underline"
          >
            → open run
          </button>
        )}
      </div>

      {!neverStarted && delegation.helper_run_id && (
        <RunNode
          runId={delegation.helper_run_id}
          run={helperRun}
          arrangement={arrangement}
          delegationsByParentRunId={delegationsByParentRunId}
          onOpenRun={onOpenRun}
          isRoot={false}
          siblingMaxDurationMs={siblingMaxDurationMs}
        />
      )}
    </div>
  );
}

interface RunNodeProps {
  runId: string;
  run: RunSummary | undefined;
  arrangement: ArrangementResponse;
  delegationsByParentRunId: Record<string, ArrangementDelegation[]>;
  onOpenRun: (runId: string) => void;
  isRoot: boolean;
  /** The largest duration_ms among this node's own siblings, for relative bar sizing (mirrors RunActionNode's maxDurationMs). The root has no siblings, so it sizes against its own duration. */
  siblingMaxDurationMs: number;
}

/**
 * One contributor's own node: status/duration (FR-004/FR-005, reusing
 * `RunSummary.end_state`'s existing vocabulary, plus a relative duration
 * bar mirroring `RunActionNode`'s own visual vocabulary) plus its own
 * further delegations, rendered as children with a concurrent/sequential
 * distinction derived from sibling time-range overlap.
 */
function RunNode({
  runId,
  run,
  arrangement,
  delegationsByParentRunId,
  onOpenRun,
  isRoot,
  siblingMaxDurationMs,
}: RunNodeProps): React.ReactElement {
  const children = delegationsByParentRunId[runId] ?? [];
  const overlappingIds = computeOverlappingDelegationIds(children);
  const childSiblingMaxDuration = maxDuration(
    children.map((d) => (d.helper_run_id ? arrangement.runs[d.helper_run_id] : undefined)),
  );
  const widthPct = run && run.duration_ms !== null ? Math.max(2, (run.duration_ms / siblingMaxDurationMs) * 100) : 0;

  return (
    <div data-testid={`run-arrangement-node-${runId}`} className="run-arrangement-node">
      <div
        data-testid={isRoot ? 'run-arrangement-entry-point' : `run-arrangement-run-${runId}`}
        data-end-state={run?.end_state ?? 'unknown'}
        role="button"
        tabIndex={0}
        onClick={() => onOpenRun(runId)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onOpenRun(runId);
        }}
        className={`run-arrangement-node__status flex items-center gap-2 cursor-pointer ${
          run?.end_state === 'failed' ? 'text-red-700' : run?.end_state === 'in_progress' ? 'text-blue-700' : 'text-green-700'
        }`}
      >
        {isRoot && <span className="text-xs uppercase text-gray-500">entry point</span>}
        <span>{runStatusLabel(run)}</span>
        {run && <span className="text-xs text-gray-500">{formatDuration(run.duration_ms)}</span>}
      </div>

      {run && run.duration_ms !== null && (
        <div className="run-arrangement-node__duration-track mt-0.5 h-1 bg-gray-100">
          <div
            data-testid={`run-arrangement-duration-${runId}`}
            className="run-arrangement-node__duration-bar h-1 bg-teal-500"
            style={{ width: `${widthPct}%` }}
          />
        </div>
      )}

      {children.length > 0 && (
        <div className="run-arrangement-node__children ml-4 mt-1">
          {children.map((delegation) => (
            <DelegationNode
              key={delegation.id}
              delegation={delegation}
              overlap={overlappingIds.has(delegation.id)}
              arrangement={arrangement}
              delegationsByParentRunId={delegationsByParentRunId}
              onOpenRun={onOpenRun}
              siblingMaxDurationMs={childSiblingMaxDuration}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function RunArrangement({ runId: runIdProp }: RunArrangementProps = {}): React.ReactElement {
  const navigate = useNavigate();

  // `useParams()` outside a Router returns `{}` rather than throwing, so a
  // caller that passes `runId` explicitly (the tests, and any in-context
  // embed) needs no router in scope.
  const { id: routeRunId } = useParams<{ id?: string }>();
  const runId = runIdProp ?? routeRunId ?? '';

  const { data, isLoading, isError, error } = useGetRunArrangementQuery(runId, { skip: runId === '' });

  const handleOpenRun = (targetRunId: string) => {
    navigate(`/clarion-app/llm-client/runs/${targetRunId}`);
  };

  // No id in the prop and none in the route — nothing to render but the
  // same uniform "not available" state an absent/foreign run gets
  // (FR-014); never an indefinite spinner.
  if (runId === '') {
    return (
      <div data-testid="run-arrangement-not-available">
        This arrangement is not available. It may not exist, may have been purged, or may belong to another user.
      </div>
    );
  }

  if (isNotFoundError(error)) {
    return (
      <div data-testid="run-arrangement-not-available">
        This arrangement is not available. It may not exist, may have been purged, or may belong to another user.
      </div>
    );
  }

  if (isLoading || !data) {
    if (isError) {
      return <div data-testid="run-arrangement-not-available">This arrangement is not available.</div>;
    }
    return <div data-testid="run-arrangement">Loading…</div>;
  }

  const delegationsByParentRunId: Record<string, ArrangementDelegation[]> = {};
  data.delegations.forEach((delegation) => {
    if (!delegation.parent_run_id) return;
    (delegationsByParentRunId[delegation.parent_run_id] ??= []).push(delegation);
  });

  const rootRun = data.runs[data.root_run_id];

  return (
    <div data-testid="run-arrangement">
      <div className="run-arrangement__header flex items-center gap-2 mb-3">
        <h2 className="text-lg font-semibold">Arrangement for run {data.root_run_id}</h2>
        {data.truncated && (
          <span
            data-testid="run-arrangement-truncated"
            className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800"
          >
            Showing a partial view — this arrangement is very large
          </span>
        )}
      </div>

      {!data.has_delegations ? (
        <div data-testid="run-arrangement-empty">
          This response was produced by a single agent — there is no multi-agent collaboration to show.
        </div>
      ) : (
        <RunNode
          runId={data.root_run_id}
          run={rootRun}
          arrangement={data}
          delegationsByParentRunId={delegationsByParentRunId}
          onOpenRun={handleOpenRun}
          isRoot
          siblingMaxDurationMs={maxDuration([rootRun])}
        />
      )}
    </div>
  );
}

export default RunArrangement;
