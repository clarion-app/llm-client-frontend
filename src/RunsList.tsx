import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useGetRunsQuery } from './runApi';
import type { RunSummary } from './types';

/**
 * RunsList — the entry point for finding a run with no visible triggering
 * message (US6, FR-024/FR-025): a minimal chronological list of the
 * caller's own runs (interactive and system-initiated alike), each showing
 * start time and lifecycle state, navigating to that run's diagram
 * (RunDiagram.tsx) on selection. Mirrors Conversations.tsx's
 * list-and-navigate structure.
 */

/** UTC-based, locale-independent rendering of an ISO timestamp — deterministic across test/runtime environments. */
function formatStartedAt(startedAt: string): string {
  const date = new Date(startedAt);
  if (Number.isNaN(date.getTime())) {
    return startedAt;
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())} UTC`;
}

function runKindLabel(kind: RunSummary['kind']): string {
  return kind === 'interactive' ? 'Interactive' : 'System-initiated';
}

function runStatusLabel(endState: RunSummary['end_state']): string {
  switch (endState) {
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
      return endState;
  }
}

export function RunsList(): React.ReactElement {
  const navigate = useNavigate();
  const { data, isLoading, isError } = useGetRunsQuery();

  if (isLoading) {
    return <div data-testid="runs-list">Loading...</div>;
  }

  if (isError) {
    return <div data-testid="runs-list">Error loading runs</div>;
  }

  const runs = data?.data ?? [];

  if (runs.length === 0) {
    return (
      <div data-testid="runs-list">
        <div data-testid="runs-list-empty">No runs found</div>
      </div>
    );
  }

  return (
    <div data-testid="runs-list">
      {runs.map((run) => (
        <div
          key={run.id}
          data-testid={`run-row-${run.id}`}
          className="border-b border-gray-200 py-2 cursor-pointer"
          onClick={() => navigate(`/clarion-app/llm-client/runs/${run.id}`)}
        >
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-700">{formatStartedAt(run.started_at)}</span>
            <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
              {runKindLabel(run.kind)}
            </span>
            <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium">
              {runStatusLabel(run.end_state)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default RunsList;
