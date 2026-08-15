import React, { useEffect, useMemo, useRef, useState } from 'react';
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

/**
 * User Story 3 (research.md D8): a frontend-only tunable, not a backend
 * contract field — below this total node count (root + every
 * `helper_run_id`-bearing run, i.e. `Object.keys(data.runs).length`), the
 * whole tree auto-expands on load; at or above it, every branch (any node
 * with its own further delegations, including the root's own first tier)
 * starts collapsed, so a large/deep arrangement loads as one entry-point row
 * plus "Expand" affordances rather than a wall of detail (spec.md US3
 * Acceptance Scenario 1).
 */
const AUTO_EXPAND_NODE_THRESHOLD = 15;

function expandedStorageKey(rootRunId: string): string {
  return `arrangement-expanded:${rootRunId}`;
}

interface DescendantFlags {
  hasFailedDescendant: boolean;
  hasInProgressDescendant: boolean;
}

/**
 * Whether any run beneath `runId` (its delegated children, and their
 * children, recursively — never `runId`'s own status) is `failed` or
 * `in_progress` (FR-011 / spec.md US3 Acceptance Scenario 4). Computed once
 * per render via the `memo` map threaded through the recursion, starting
 * from the root, so a collapsed branch can surface the hint without a
 * further fetch — the whole tree is already in hand (research.md D5/D8).
 */
function buildDescendantFlags(
  runId: string,
  delegationsByParentRunId: Record<string, ArrangementDelegation[]>,
  runs: Record<string, RunSummary>,
  memo: Map<string, DescendantFlags>,
): DescendantFlags {
  const cached = memo.get(runId);
  if (cached) return cached;

  let hasFailedDescendant = false;
  let hasInProgressDescendant = false;

  for (const delegation of delegationsByParentRunId[runId] ?? []) {
    if (!delegation.helper_run_id) continue;

    const childRun = runs[delegation.helper_run_id];
    if (childRun?.end_state === 'failed') hasFailedDescendant = true;
    if (childRun?.end_state === 'in_progress') hasInProgressDescendant = true;

    const childFlags = buildDescendantFlags(delegation.helper_run_id, delegationsByParentRunId, runs, memo);
    if (childFlags.hasFailedDescendant) hasFailedDescendant = true;
    if (childFlags.hasInProgressDescendant) hasInProgressDescendant = true;
  }

  const result: DescendantFlags = { hasFailedDescendant, hasInProgressDescendant };
  memo.set(runId, result);
  return result;
}

interface DelegationNodeProps {
  delegation: ArrangementDelegation;
  overlap: boolean;
  arrangement: ArrangementResponse;
  delegationsByParentRunId: Record<string, ArrangementDelegation[]>;
  onOpenRun: (runId: string) => void;
  /** The largest duration_ms among this delegation's own siblings, for relative bar sizing (mirrors RunActionNode's maxDurationMs). */
  siblingMaxDurationMs: number;
  /** User Story 3: ids of contributor runs whose own further delegations are currently shown. */
  expandedIds: Set<string>;
  onToggleExpand: (runId: string) => void;
  descendantFlags: Map<string, DescendantFlags>;
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
  expandedIds,
  onToggleExpand,
  descendantFlags,
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
          expandedIds={expandedIds}
          onToggleExpand={onToggleExpand}
          descendantFlags={descendantFlags}
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
  /** User Story 3: ids of contributor runs whose own further delegations are currently shown. */
  expandedIds: Set<string>;
  onToggleExpand: (runId: string) => void;
  descendantFlags: Map<string, DescendantFlags>;
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
  expandedIds,
  onToggleExpand,
  descendantFlags,
}: RunNodeProps): React.ReactElement {
  const children = delegationsByParentRunId[runId] ?? [];
  const overlappingIds = computeOverlappingDelegationIds(children);
  const childSiblingMaxDuration = maxDuration(
    children.map((d) => (d.helper_run_id ? arrangement.runs[d.helper_run_id] : undefined)),
  );
  const widthPct = run && run.duration_ms !== null ? Math.max(2, (run.duration_ms / siblingMaxDurationMs) * 100) : 0;
  const isExpanded = expandedIds.has(runId);
  const flags = descendantFlags.get(runId);
  const showCollapsedHint = children.length > 0 && !isExpanded && flags && (flags.hasFailedDescendant || flags.hasInProgressDescendant);

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
        <div className="run-arrangement-node__branch-controls mt-1 flex items-center gap-2">
          <button
            type="button"
            data-testid={`run-arrangement-toggle-${runId}`}
            data-expanded={isExpanded ? 'true' : 'false'}
            onClick={() => onToggleExpand(runId)}
            className="text-xs font-medium text-blue-700 underline"
          >
            {isExpanded ? 'Collapse' : `Expand (${children.length})`}
          </button>
          {showCollapsedHint && (
            <span
              data-testid={`run-arrangement-collapsed-hint-${runId}`}
              data-has-failed={flags?.hasFailedDescendant ? 'true' : 'false'}
              data-has-in-progress={flags?.hasInProgressDescendant ? 'true' : 'false'}
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs ${
                flags?.hasFailedDescendant ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'
              }`}
            >
              {flags?.hasFailedDescendant ? 'Contains a failed contributor' : 'Contains an in-progress contributor'}
            </span>
          )}
        </div>
      )}

      {children.length > 0 && isExpanded && (
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
              expandedIds={expandedIds}
              onToggleExpand={onToggleExpand}
              descendantFlags={descendantFlags}
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

  // User Story 3 (research.md D8/D8a): all of the following hooks must run
  // on every render, unconditionally, before any early return below — they
  // guard internally against `data` being undefined instead.
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const initializedForRootRunId = useRef<string | null>(null);

  const delegationsByParentRunId = useMemo<Record<string, ArrangementDelegation[]>>(() => {
    const map: Record<string, ArrangementDelegation[]> = {};
    if (!data) return map;
    data.delegations.forEach((delegation) => {
      if (!delegation.parent_run_id) return;
      (map[delegation.parent_run_id] ??= []).push(delegation);
    });
    return map;
  }, [data]);

  const descendantFlags = useMemo(() => {
    const memo = new Map<string, DescendantFlags>();
    if (data) {
      buildDescendantFlags(data.root_run_id, delegationsByParentRunId, data.runs, memo);
    }
    return memo;
  }, [data, delegationsByParentRunId]);

  // Read the persisted expand/collapse shape once per root_run_id (research.md
  // D8a) — falling back to the D8 auto-expand-below-threshold default when
  // nothing is stored (e.g. first visit to this arrangement this session).
  useEffect(() => {
    if (!data) return;
    if (initializedForRootRunId.current === data.root_run_id) return;
    initializedForRootRunId.current = data.root_run_id;

    let stored: string[] | null = null;
    try {
      const raw = sessionStorage.getItem(expandedStorageKey(data.root_run_id));
      if (raw) stored = JSON.parse(raw) as string[];
    } catch {
      stored = null;
    }

    if (stored) {
      setExpandedIds(new Set(stored));
      return;
    }

    const nodeCount = Object.keys(data.runs).length;
    if (nodeCount <= AUTO_EXPAND_NODE_THRESHOLD) {
      setExpandedIds(new Set(Object.keys(delegationsByParentRunId)));
    } else {
      setExpandedIds(new Set());
    }
  }, [data, delegationsByParentRunId]);

  // Persist on every toggle (research.md D8a). Runs alongside the
  // initialization effect above too (harmless — it just re-writes the same
  // value the read above just produced).
  useEffect(() => {
    if (!data) return;
    try {
      sessionStorage.setItem(expandedStorageKey(data.root_run_id), JSON.stringify(Array.from(expandedIds)));
    } catch {
      // sessionStorage unavailable (e.g. private-browsing quota) -- the
      // expand/collapse state itself still works for this render, it just
      // won't survive a navigation away and back. Best-effort only.
    }
  }, [data, expandedIds]);

  const handleToggleExpand = (targetRunId: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(targetRunId)) {
        next.delete(targetRunId);
      } else {
        next.add(targetRunId);
      }
      return next;
    });
  };

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
          expandedIds={expandedIds}
          onToggleExpand={handleToggleExpand}
          descendantFlags={descendantFlags}
        />
      )}
    </div>
  );
}

export default RunArrangement;
