import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useGetWorkspaceChangesQuery, useLazyGetWorkspaceChangesQuery } from './workspaceApi';
import type { CodingWorkspaceChangeType, FlatPaginatedEnvelope } from './types';

/**
 * WorkspaceChangeHistory -- routed drill-down screen for one workspace's
 * durable change record (122-workspace-browser-ui, US3). Reached only by
 * navigating from a row in WorkspaceBrowser (contracts/frontend-manifest-
 * wiring.md), never from the menu directly, mirroring RunDiagram's own
 * relationship to RunsList.
 *
 * Routed with a :id param but no required props -- reads the workspace id
 * via useParams() with an explicit-prop fallback, exactly matching
 * RunDiagram.tsx's own since-fixed shape (runId optional, useParams()
 * fallback), not the required-prop defect that shape replaced.
 *
 * Renders most-recent-first exactly as the backend returns it (FR-008 is
 * unconditional -- no client-side re-sort). Enough before/after content is
 * shown per row to distinguish created/modified/deleted from merely "a file
 * was touched" (FR-007): a created entry shows only the new content, a
 * deleted entry shows only the pre-deletion content, and a modified entry
 * shows both sides.
 */

export interface WorkspaceChangeHistoryProps {
  id?: string;
}

interface AccumulatedChanges {
  items: CodingWorkspaceChangeType[];
  hasMore: boolean;
  isLoadingMore: boolean;
  loadMore: () => void;
}

/**
 * Accumulates a paginated change list across "Load more" clicks, mirroring
 * the *form* of RunDiagram.tsx's useAccumulatedPages() (accumulate-on-
 * click, hasMore/isLoadingMore/loadMore) but built against this feature's
 * own flat `{data, total, page, per_page}` envelope (T006/Grounding note
 * 18) -- never PaginatedEnvelope<T>'s nested `.meta.total` shape, which is
 * not interchangeable with it. Deliberately its own, non-shared hook, not
 * an import from RunDiagram.tsx.
 */
function useAccumulatedChanges(
  pageOneData: FlatPaginatedEnvelope<CodingWorkspaceChangeType> | undefined,
  fetchPage: (page: number) => Promise<FlatPaginatedEnvelope<CodingWorkspaceChangeType>>,
): AccumulatedChanges {
  const [extraItems, setExtraItems] = useState<CodingWorkspaceChangeType[]>([]);
  const [pagesLoaded, setPagesLoaded] = useState(1);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  const pageOneItems = pageOneData?.data ?? [];
  const total = pageOneData?.total ?? pageOneItems.length;
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

function operationLabel(operation: CodingWorkspaceChangeType['operation']): string {
  switch (operation) {
    case 'created':
      return 'Created';
    case 'modified':
      return 'Modified';
    case 'deleted':
      return 'Deleted';
    default:
      return operation;
  }
}

interface ContentSideProps {
  testId: string;
  label: string;
  content: string | null;
  truncated: boolean;
  binary: boolean;
  size: number | null;
}

/** One side (before/after) of a change's content, honoring the binary/truncated mutual-exclusion invariant (contracts/workspace-change-history-api.md). */
function ContentSide({ testId, label, content, truncated, binary, size }: ContentSideProps): React.ReactElement {
  return (
    <div data-testid={testId} style={{ marginTop: '0.5rem' }}>
      <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary, #6b7280)' }}>
        {label}
      </div>
      {binary ? (
        <div data-testid={`${testId}-binary`} style={{ fontSize: '0.8125rem' }}>
          Binary content{size !== null ? ` (${size} bytes)` : ''} not shown.
        </div>
      ) : (
        <>
          {truncated && (
            <div data-testid={`${testId}-truncated`} style={{ fontSize: '0.75rem', color: 'var(--color-warning, #92400e)' }}>
              Truncated -- showing only the recorded portion.
            </div>
          )}
          <pre style={{ whiteSpace: 'pre-wrap', fontSize: '0.8125rem', margin: '0.25rem 0 0' }}>
            {content ?? 'no content recorded'}
          </pre>
        </>
      )}
    </div>
  );
}

interface WorkspaceChangeRowProps {
  change: CodingWorkspaceChangeType;
}

function WorkspaceChangeRow({ change }: WorkspaceChangeRowProps): React.ReactElement {
  const unattributed = change.agent_name === null && change.conversation_id === null;
  const showOld = change.operation === 'modified' || change.operation === 'deleted';
  const showNew = change.operation === 'modified' || change.operation === 'created';

  return (
    <div
      data-testid={`workspace-change-row-${change.id}`}
      style={{
        border: '1px solid var(--border-color, #d1d5db)',
        borderRadius: '0.5rem',
        padding: '1rem',
        marginBottom: '0.75rem',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '0.5rem' }}>
        <div data-testid={`workspace-change-path-${change.id}`} style={{ fontWeight: 600, fontSize: '0.9375rem' }}>
          {change.path}
        </div>
        <div
          data-testid={`workspace-change-operation-${change.id}`}
          style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-secondary, #6b7280)' }}
        >
          {operationLabel(change.operation)}
        </div>
      </div>

      <div
        data-testid={`workspace-change-timestamp-${change.id}`}
        style={{ fontSize: '0.8125rem', color: 'var(--text-secondary, #6b7280)' }}
      >
        {change.created_at}
      </div>

      <div
        data-testid={`workspace-change-attribution-${change.id}`}
        style={{ fontSize: '0.8125rem', color: 'var(--text-secondary, #6b7280)' }}
      >
        {unattributed ? 'Unattributed' : `${change.agent_name ?? 'Unknown agent'} — conversation ${change.conversation_id ?? '—'}`}
      </div>

      {showOld && (
        <ContentSide
          testId={`workspace-change-old-content-${change.id}`}
          label="Before"
          content={change.old_content}
          truncated={change.old_content_truncated}
          binary={change.old_binary}
          size={change.old_size}
        />
      )}
      {showNew && (
        <ContentSide
          testId={`workspace-change-new-content-${change.id}`}
          label="After"
          content={change.new_content}
          truncated={change.new_content_truncated}
          binary={change.new_binary}
          size={change.new_size}
        />
      )}
    </div>
  );
}

export function WorkspaceChangeHistory({ id: idProp }: WorkspaceChangeHistoryProps = {}): React.ReactElement {
  // useParams() outside a Router returns {} rather than throwing, so a
  // caller that passes `id` explicitly (the tests) needs no router in
  // scope.
  const { id: routeId } = useParams<{ id?: string }>();
  const workspaceId = idProp ?? routeId ?? '';

  const {
    data: changesEnvelope,
    isLoading,
    isError,
  } = useGetWorkspaceChangesQuery({ id: workspaceId }, { skip: workspaceId === '' });
  const [triggerGetWorkspaceChanges] = useLazyGetWorkspaceChangesQuery();
  const acc = useAccumulatedChanges(changesEnvelope, (page) =>
    triggerGetWorkspaceChanges({ id: workspaceId, page }).unwrap(),
  );

  // No id in the prop and none in the route -- nothing to render but the
  // same uniform "not available" state a foreign/nonexistent workspace id
  // gets (FR-013); never an indefinite spinner.
  if (workspaceId === '' || isError) {
    return (
      <div data-testid="workspace-change-history-not-available">
        This workspace is not available. It may not exist or may belong to another user.
      </div>
    );
  }

  if (isLoading || !changesEnvelope) {
    return <div data-testid="workspace-change-history">Loading…</div>;
  }

  const changes = acc.items;

  return (
    <div data-testid="workspace-change-history">
      <h1 style={{ margin: '0 0 1rem', fontSize: '1.5rem', fontWeight: 700 }}>Change history</h1>

      {changes.length === 0 ? (
        <div
          data-testid="workspace-change-history-empty"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '3rem 1rem',
            textAlign: 'center',
            color: 'var(--text-secondary, #6b7280)',
          }}
        >
          <h2 style={{ margin: '0 0 0.5rem', fontSize: '1.25rem', color: 'var(--text-primary, #111827)' }}>
            No changes recorded yet
          </h2>
          <p style={{ margin: 0, fontSize: '0.875rem' }}>
            Once an agent creates, modifies, or deletes a file here, it will appear in this history.
          </p>
        </div>
      ) : (
        <div data-testid="workspace-change-list">
          {changes.map((change) => (
            <WorkspaceChangeRow key={change.id} change={change} />
          ))}
        </div>
      )}

      {acc.hasMore && (
        <button
          type="button"
          data-testid="workspace-change-history-load-more"
          onClick={acc.loadMore}
          disabled={acc.isLoadingMore}
          className="text-sm text-blue-700 underline mt-1 mb-2"
        >
          {acc.isLoadingMore ? 'Loading…' : 'Load more'}
        </button>
      )}
    </div>
  );
}

export default WorkspaceChangeHistory;
