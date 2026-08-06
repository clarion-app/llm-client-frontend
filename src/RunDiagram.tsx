import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import {
  useGetRunQuery,
  useGetRunStepsQuery,
  useGetStepActionsQuery,
  useGetActionChildrenQuery,
  useLazyGetRunStepsQuery,
  useLazyGetStepActionsQuery,
  useLazyGetActionChildrenQuery,
} from './runApi';
import { RunStepNode } from './RunStepNode';
import { RunActionNode } from './RunActionNode';
import { RunElementDetail } from './RunElementDetail';
import type { RunElementSelection } from './RunElementDetail';
import type { RunSummary, StepSummary, ActionSummary, PaginatedEnvelope } from './types';

/**
 * RunDiagram — orchestrates a run's diagram (US1): fetches the run summary
 * and ordered step list on mount, lazy-fetches a step's/action's children
 * only on expansion (FR-011), renders overlapping-timing siblings as
 * visibly overlapping (FR-019), and distinguishes end states visually
 * (FR-003, FR-016).
 *
 * A run whose combined step+action count is small (research.md D5) is
 * auto-expanded on load so the "at a glance" experience (SC-001) holds for
 * the common case without requiring a click; larger runs stay collapsed
 * until the user expands a section explicitly. Phase 7 (US4) adds windowed
 * rendering (`VirtualRow` below) on top of this so SC-003's "page remains
 * responsive" holds at 500+ combined steps/actions, independent of the
 * lazy-fetch behavior above.
 */

const AUTO_EXPAND_THRESHOLD = 50;

/**
 * Below this many items, a list (the step list, or any one step's/action's
 * expanded child list) renders every row directly — no observer, no
 * placeholder rows, since there's nothing to bound. At or above it, T076/
 * research.md D5's windowing applies: a row's full subtree mounts only once
 * it's near the viewport, so DOM node count stays bounded independent of
 * how many steps/actions are *logically* present. This is deliberately a
 * separate constant from AUTO_EXPAND_THRESHOLD — that one governs *fetching*
 * (combined run-level step+action count); this one governs *rendering*, per
 * list, so a run with few steps but one step holding hundreds of actions
 * (research.md D5's own example) still gets its action list windowed even
 * though the step list itself never needs to be.
 */
const VIRTUALIZE_ROW_THRESHOLD = 50;

/** Overscan margin so rows mount well before they'd actually enter the viewport, keeping scroll visually smooth. */
const VIRTUALIZE_ROOT_MARGIN = '800px 0px';

/**
 * Reports whether `ref`'s element is near the viewport, via
 * IntersectionObserver. When windowing isn't `active` for this list (below
 * VIRTUALIZE_ROW_THRESHOLD), or IntersectionObserver isn't available in
 * this environment, every row reports "near" and renders in full — jsdom
 * (this package's test environment) doesn't implement IntersectionObserver,
 * so this fallback also keeps every existing DOM-query-based test assertion
 * valid without any test-specific branching in production code.
 */
function useNearViewport(active: boolean): [React.RefObject<HTMLDivElement>, boolean] {
  const ref = useRef<HTMLDivElement>(null);
  const [isNear, setIsNear] = useState(!active);

  useEffect(() => {
    if (!active || typeof IntersectionObserver === 'undefined' || !ref.current) {
      setIsNear(true);
      return;
    }
    setIsNear(false);
    const el = ref.current;
    const observer = new IntersectionObserver(([entry]) => setIsNear(entry.isIntersecting), {
      rootMargin: VIRTUALIZE_ROOT_MARGIN,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [active]);

  return [ref, isNear];
}

interface VirtualRowProps {
  /** Whether this row belongs to a list currently above VIRTUALIZE_ROW_THRESHOLD. */
  active: boolean;
  /** Reserved height for the collapsed placeholder, so the list's scroll extent doesn't jump as rows mount/unmount. */
  placeholderHeight: number;
  children: React.ReactNode;
}

/**
 * Wraps one row of a steps/actions list. Renders `children` only once the
 * row is near the viewport (or when windowing is inactive/unsupported);
 * otherwise renders a height-preserving placeholder instead of the row's
 * full subtree — the mechanism behind T076/SC-003's "page remains
 * responsive" for very large runs.
 */
function VirtualRow({ active, placeholderHeight, children }: VirtualRowProps): React.ReactElement {
  const [ref, isNear] = useNearViewport(active);
  return <div ref={ref}>{isNear ? children : <div style={{ height: placeholderHeight }} aria-hidden="true" />}</div>;
}

function runStatusLabel(run: RunSummary): string {
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

function isNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  return (error as { status?: unknown }).status === 404;
}

/**
 * Compare `[started_at, ended_at]` ranges among siblings and return the set
 * of ids whose range overlaps at least one other sibling's (FR-019). An
 * element still in progress (no `ended_at`) is treated as ending "now" for
 * this comparison only — a rendering rule, not a data change
 * (data-model.md §1.3).
 */
function computeOverlappingIds(actions: ActionSummary[]): Set<string> {
  const overlapping = new Set<string>();
  const ranges = actions.map((action) => ({
    id: action.id,
    start: new Date(action.started_at).getTime(),
    end: action.ended_at ? new Date(action.ended_at).getTime() : Date.now(),
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

function maxDuration(items: Array<{ duration_ms: number | null }>): number {
  return Math.max(1, ...items.map((item) => item.duration_ms ?? 0));
}

interface AccumulatedPages<T> {
  items: T[];
  hasMore: boolean;
  isLoadingMore: boolean;
  loadMore: () => void;
}

/**
 * Accumulates a paginated list across "Load more" clicks (FR-012, US4
 * Acceptance Scenario 4). The backend already supports `page`/`per_page` on
 * all three list endpoints (contracts/run-read-api.md), but the diagram
 * previously only ever fetched page 1 of the steps list, a step's actions,
 * or an action's children — so anything beyond a list's first page was
 * permanently unreachable in the UI even though the backend held it.
 *
 * `pageOneData` is the already-fetched first page (the normal
 * `useGetXQuery` hook, unchanged — still its own RTK Query cache entry, so
 * runRealtime.ts's live-update upserts into it keep working exactly as
 * before). `fetchPage` requests one additional page (via the matching
 * `useLazyGetXQuery` trigger) and its results are appended to local
 * component state — a full re-fetch-and-replace of everything already
 * loaded is neither needed nor desired.
 */
function useAccumulatedPages<T>(
  pageOneData: PaginatedEnvelope<T> | undefined,
  fetchPage: (page: number) => Promise<PaginatedEnvelope<T>>,
): AccumulatedPages<T> {
  const [extraItems, setExtraItems] = useState<T[]>([]);
  const [pagesLoaded, setPagesLoaded] = useState(1);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const pageOneItems = pageOneData?.data ?? [];
  const total = pageOneData?.meta.total ?? pageOneItems.length;
  const items = extraItems.length === 0 ? pageOneItems : [...pageOneItems, ...extraItems];
  const hasMore = items.length < total;

  const loadMore = () => {
    if (isLoadingMore) return;
    setIsLoadingMore(true);
    fetchPage(pagesLoaded + 1)
      .then((envelope) => {
        setExtraItems((prev) => [...prev, ...envelope.data]);
        setPagesLoaded((p) => p + 1);
        setIsLoadingMore(false);
      })
      .catch(() => {
        setIsLoadingMore(false);
      });
  };

  return { items, hasMore, isLoadingMore, loadMore };
}

interface LoadMoreButtonProps {
  testId: string;
  label: string;
  acc: AccumulatedPages<unknown>;
}

/** Shared "Load more" affordance for the steps list, a step's action list, and an action's children list (FR-012). */
function LoadMoreButton({ testId, label, acc }: LoadMoreButtonProps): React.ReactElement | null {
  if (!acc.hasMore) return null;
  return (
    <button
      type="button"
      data-testid={testId}
      onClick={acc.loadMore}
      disabled={acc.isLoadingMore}
      className="run-diagram__load-more text-sm text-blue-700 underline mt-1 mb-2"
    >
      {acc.isLoadingMore ? 'Loading…' : label}
    </button>
  );
}

interface ActionContainerProps {
  runId: string;
  action: ActionSummary;
  maxDurationMs: number;
  overlap: boolean;
  autoExpand: boolean;
  onSelect: (selection: RunElementSelection) => void;
}

/** One action node plus its own lazily-fetched (or auto-expanded) children — recursable for nested actions (FR-002). */
function ActionContainer({ runId, action, maxDurationMs, overlap, autoExpand, onSelect }: ActionContainerProps): React.ReactElement {
  const [manuallyExpanded, setManuallyExpanded] = useState(false);
  const isExpanded = action.has_children && (autoExpand || manuallyExpanded);

  const { data: childrenEnvelope } = useGetActionChildrenQuery(
    { runId, actionId: action.id },
    { skip: !isExpanded },
  );
  const [triggerGetActionChildren] = useLazyGetActionChildrenQuery();
  const childrenAcc = useAccumulatedPages<ActionSummary>(childrenEnvelope, (page) =>
    triggerGetActionChildren({ runId, actionId: action.id, page }).unwrap(),
  );
  const children = childrenAcc.items;
  const childMaxDuration = maxDuration(children);
  const overlappingChildIds = computeOverlappingIds(children);

  return (
    <RunActionNode
      action={action}
      maxDurationMs={maxDurationMs}
      overlap={overlap}
      isExpanded={isExpanded}
      onToggleExpand={() => setManuallyExpanded((v) => !v)}
      onSelect={() => onSelect({ type: 'action', actionId: action.id })}
    >
      {isExpanded && (
        <>
          {children.map((child) => (
            <VirtualRow key={child.id} active={children.length > VIRTUALIZE_ROW_THRESHOLD} placeholderHeight={40}>
              <ActionContainer
                runId={runId}
                action={child}
                maxDurationMs={childMaxDuration}
                overlap={overlappingChildIds.has(child.id)}
                autoExpand={autoExpand}
                onSelect={onSelect}
              />
            </VirtualRow>
          ))}
          <LoadMoreButton
            testId={`run-action-children-load-more-${action.id}`}
            label="Load more"
            acc={childrenAcc}
          />
        </>
      )}
    </RunActionNode>
  );
}

interface StepContainerProps {
  runId: string;
  step: StepSummary;
  maxDurationMs: number;
  autoExpand: boolean;
  onSelect: (selection: RunElementSelection) => void;
}

/** One step node plus its own lazily-fetched (or auto-expanded) top-level actions. */
function StepContainer({ runId, step, maxDurationMs, autoExpand, onSelect }: StepContainerProps): React.ReactElement {
  const [manuallyExpanded, setManuallyExpanded] = useState(false);
  const isExpanded = autoExpand || manuallyExpanded;

  const { data: actionsEnvelope } = useGetStepActionsQuery(
    { runId, stepId: step.id },
    { skip: !isExpanded },
  );
  const [triggerGetStepActions] = useLazyGetStepActionsQuery();
  const actionsAcc = useAccumulatedPages<ActionSummary>(actionsEnvelope, (page) =>
    triggerGetStepActions({ runId, stepId: step.id, page }).unwrap(),
  );
  const actions = actionsAcc.items;
  const actionMaxDuration = maxDuration(actions);
  const overlappingIds = computeOverlappingIds(actions);

  return (
    <RunStepNode
      step={step}
      maxDurationMs={maxDurationMs}
      isExpanded={isExpanded}
      onToggleExpand={() => setManuallyExpanded((v) => !v)}
      onSelect={() => onSelect({ type: 'step', step })}
    >
      {isExpanded && (
        <>
          {actions.map((action) => (
            <VirtualRow key={action.id} active={actions.length > VIRTUALIZE_ROW_THRESHOLD} placeholderHeight={40}>
              <ActionContainer
                runId={runId}
                action={action}
                maxDurationMs={actionMaxDuration}
                overlap={overlappingIds.has(action.id)}
                autoExpand={autoExpand}
                onSelect={onSelect}
              />
            </VirtualRow>
          ))}
          <LoadMoreButton
            testId={`run-step-actions-load-more-${step.id}`}
            label="Load more"
            acc={actionsAcc}
          />
        </>
      )}
    </RunStepNode>
  );
}

export interface RunDiagramProps {
  /**
   * The run to render. Optional: the route registered in `package.json`'s
   * `customFields.clarion.routes` is `/clarion-app/llm-client/runs/:id` and
   * renders `<RunDiagram />` with no props (the host app generates its route
   * table from that manifest — see `frontend/vite-plugins/dynamicRoutes.ts`),
   * so the id comes from the `:id` route param whenever it isn't passed
   * explicitly. `RunsList.tsx` navigates to exactly that path (US6 Acceptance
   * Scenario 2 / SC-010: selecting a run opens that run's diagram).
   */
  runId?: string;
}

export function RunDiagram({ runId: runIdProp }: RunDiagramProps = {}): React.ReactElement {
  const [selected, setSelected] = useState<RunElementSelection | null>(null);

  // `useParams()` outside a Router returns `{}` rather than throwing, so a
  // caller that passes `runId` explicitly (the tests, and any in-context
  // embed) needs no router in scope.
  const { id: routeRunId } = useParams<{ id?: string }>();
  const runId = runIdProp ?? routeRunId ?? '';

  const { data: run, isLoading: runLoading, isError: runIsError, error: runError } = useGetRunQuery(runId, {
    skip: runId === '',
  });

  const { data: stepsEnvelope, isLoading: stepsLoading, isError: stepsIsError, error: stepsError } =
    useGetRunStepsQuery({ runId }, { skip: !run });

  const [triggerGetRunSteps] = useLazyGetRunStepsQuery();
  const stepsAcc = useAccumulatedPages<StepSummary>(stepsEnvelope, (page) =>
    triggerGetRunSteps({ runId, page }).unwrap(),
  );

  // No id in the prop and none in the route — nothing to render but the same
  // uniform "not available" state an absent/foreign run gets (FR-014); never
  // an indefinite spinner.
  if (runId === '') {
    return (
      <div data-testid="run-diagram-not-available">
        This run is not available. It may not exist, may have been purged, or may belong to another user.
      </div>
    );
  }

  if (isNotFoundError(runError) || isNotFoundError(stepsError)) {
    return (
      <div data-testid="run-diagram-not-available">
        This run is not available. It may not exist, may have been purged, or may belong to another user.
      </div>
    );
  }

  if (runLoading || !run) {
    if (runIsError) {
      return (
        <div data-testid="run-diagram-not-available">
          This run is not available.
        </div>
      );
    }
    return <div>Loading…</div>;
  }

  if (stepsLoading || !stepsEnvelope) {
    if (stepsIsError) {
      return (
        <div data-testid="run-diagram-not-available">
          This run is not available.
        </div>
      );
    }
    return <div data-testid="run-diagram">Loading…</div>;
  }

  const steps = stepsAcc.items;
  const isSmallRun = run.step_count + run.action_count <= AUTO_EXPAND_THRESHOLD;
  const stepMaxDuration = maxDuration(steps);

  return (
    <div data-testid="run-diagram">
      <div className="run-diagram__header flex items-center gap-2 mb-3">
        <h2 className="text-lg font-semibold">Run {run.id}</h2>
        <span
          data-testid="run-status-badge"
          className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium"
        >
          {runStatusLabel(run)}
        </span>
      </div>

      {steps.length === 0 ? (
        <div data-testid="run-diagram-empty">This run has no steps recorded yet.</div>
      ) : (
        <div className="run-diagram__body flex gap-4">
          <div className="run-diagram__steps flex-1">
            {steps.map((step) => (
              <VirtualRow key={step.id} active={steps.length > VIRTUALIZE_ROW_THRESHOLD} placeholderHeight={56}>
                <StepContainer
                  runId={runId}
                  step={step}
                  maxDurationMs={stepMaxDuration}
                  autoExpand={isSmallRun}
                  onSelect={setSelected}
                />
              </VirtualRow>
            ))}
            <LoadMoreButton testId="run-steps-load-more" label="Load more steps" acc={stepsAcc} />
          </div>
          <div className="run-diagram__detail w-80 shrink-0">
            <RunElementDetail runId={runId} selected={selected} />
          </div>
        </div>
      )}
    </div>
  );
}

export default RunDiagram;
