import React, { useMemo, useState } from 'react';
import {
  useListHelpersQuery,
  useListHelperHierarchyQuery,
  useAssignHelperMutation,
  useRemoveHelperMutation,
} from './agentHelperApi';
import { useSearchAgentsQuery } from './agentBrowserApi';
import type { HelperStatus } from './types';

/**
 * ManageHelpersPanel — the owner-only "sub-agent helpers" disclosure this
 * feature adds inline to AgentCard (097-subagent-model, contracts/
 * frontend-subagent-model.md §4). Not routed, not in customFields.clarion —
 * a plain, prop-driven component, colocated the same way AgentCard/
 * ManageSharingPanel themselves are.
 *
 * Collapsed by default. Once expanded, lists the parent agent's current
 * helpers (name, truncated purpose, `helper_status` badge, and a
 * `within_bounds === false` warning badge, US2) via useListHelpersQuery, and
 * a small "Add helper" form (a candidate picker fed by useSearchAgentsQuery,
 * filtered client-side to the caller's own owned agents, excluding this
 * agent itself and its already-assigned helpers, and useAssignHelperMutation
 * on submit).
 *
 * A listHelpers 404 (the agent is no longer owned by the caller) and an
 * assignHelper 422 (self-assignment, exceeds-parent-permissions, and — from
 * Phase 4 on — cycle/depth-limit) are both rendered inline as distinct error
 * states rather than thrown/crashed through.
 */

interface ManageHelpersPanelProps {
  agentId: string;
}

interface HelperCandidate {
  id: string;
  name: string;
  permission: 'owner' | 'use' | 'use_and_edit';
}

const PURPOSE_TRUNCATE_LENGTH = 150;

function truncatePurpose(purpose: string | null | undefined): string {
  if (!purpose) {
    return '';
  }
  if (purpose.length <= PURPOSE_TRUNCATE_LENGTH) {
    return purpose;
  }
  return `${purpose.slice(0, PURPOSE_TRUNCATE_LENGTH)}…`;
}

function statusLabel(status: HelperStatus): string {
  if (status === 'active') return 'Active';
  if (status === 'deactivated') return 'Deactivated';
  return 'Gone';
}

// Reuses AgentCard's existing in-service/retired pill styling
// (`inline-flex items-center rounded-full ... px-2 py-0.5 text-xs
// font-medium`) for visual consistency, with 'gone' distinguished by its own
// color the same way AgentCard's shared-by badge gets its own color.
function statusBadgeClassName(status: HelperStatus): string {
  if (status === 'active') {
    return 'inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium';
  }
  if (status === 'deactivated') {
    return 'inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-medium text-yellow-800';
  }
  return 'inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800';
}

// RTK Query rejects with either a FetchBaseQueryError ({ status, data }) or
// a SerializedError ({ message }) — neither is imported here to keep this
// narrow; this guard covers only the shape this component actually reads.
// Duplicated from ManageSharingPanel.tsx rather than imported (that file
// exports no shared utility module today).
function extractErrorMessage(err: unknown, fallback: string): string {
  if (typeof err !== 'object' || err === null) {
    return fallback;
  }
  const data = (err as { data?: unknown }).data;
  if (data && typeof data === 'object') {
    const body = data as { message?: unknown; error?: unknown };
    if (typeof body.message === 'string' && body.message.length > 0) {
      return body.message;
    }
    if (typeof body.error === 'string' && body.error.length > 0) {
      return body.error;
    }
  }
  return fallback;
}

// The `error` field on a rejected assignHelper response is a machine-readable
// code (`self_assignment`, `exceeds_parent_permissions`, `cycle_detected`,
// `depth_limit_exceeded`) distinguishing which of the four 422 shapes came
// back, so the two structured ones (cycle/depth) can be routed to their own
// distinct inline renderings instead of the generic passthrough.
function extractErrorCode(err: unknown): string | undefined {
  if (typeof err !== 'object' || err === null) {
    return undefined;
  }
  const data = (err as { data?: unknown }).data;
  if (data && typeof data === 'object') {
    const body = data as { error?: unknown };
    if (typeof body.error === 'string' && body.error.length > 0) {
      return body.error;
    }
  }
  return undefined;
}

function hierarchyIndent(depth: number): string {
  return `${Math.max(depth, 0) * 20}px`;
}

export function ManageHelpersPanel({ agentId }: ManageHelpersPanelProps): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [cycleError, setCycleError] = useState<string | null>(null);
  const [depthError, setDepthError] = useState<string | null>(null);
  const [hierarchyExpanded, setHierarchyExpanded] = useState(false);

  const { data: helpersData, isError: helpersIsError } = useListHelpersQuery({ agentId });
  const { data: hierarchyData } = useListHelperHierarchyQuery({ agentId }, { skip: !hierarchyExpanded });
  const { data: candidatesData } = useSearchAgentsQuery({});
  const [assignHelper, { isLoading: isAssigning }] = useAssignHelperMutation();
  const [removeHelper] = useRemoveHelperMutation();

  const helpers = useMemo(() => helpersData?.data ?? [], [helpersData]);
  const hierarchyEntries = useMemo(() => hierarchyData?.data ?? [], [hierarchyData]);

  const eligibleCandidates: HelperCandidate[] = useMemo(() => {
    const assignedHelperIds = new Set(helpers.map((h) => h.helper_agent_id));
    const rawCandidates = (candidatesData?.data ?? []) as HelperCandidate[];
    return rawCandidates.filter(
      (candidate) =>
        candidate.permission === 'owner' &&
        candidate.id !== agentId &&
        !assignedHelperIds.has(candidate.id),
    );
  }, [candidatesData, helpers, agentId]);

  const effectiveCandidateId = selectedCandidateId || eligibleCandidates[0]?.id || '';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setCycleError(null);
    setDepthError(null);
    try {
      await assignHelper({ agentId, helperAgentId: effectiveCandidateId }).unwrap();
      setSelectedCandidateId('');
    } catch (err) {
      const code = extractErrorCode(err);
      const message = extractErrorMessage(err, 'Could not assign this helper. Please check your selection and try again.');
      if (code === 'cycle_detected') {
        setCycleError(message);
      } else if (code === 'depth_limit_exceeded') {
        setDepthError(message);
      } else {
        setFormError(message);
      }
    }
  };

  const handleRemove = (helperAgentId: string) => {
    void removeHelper({ agentId, helperAgentId }).unwrap();
  };

  return (
    <div data-testid="manage-helpers-panel">
      <button type="button" data-testid="manage-helpers-toggle" onClick={() => setExpanded((prev) => !prev)}>
        {expanded ? 'Hide helpers' : 'Manage helpers'}
      </button>

      {expanded && (
        <div data-testid="manage-helpers-content">
          {helpersIsError ? (
            <div data-testid="manage-helpers-not-owned-error">
              This agent is no longer available to manage helpers for.
            </div>
          ) : (
            <>
              <ul>
                {helpers.map((helper) => (
                  <li key={helper.id} data-testid={`agent-helper-row-${helper.helper_agent_id}`}>
                    {helper.helper_name} — {truncatePurpose(helper.helper_purpose)}{' '}
                    <span
                      data-testid={`agent-helper-status-${helper.helper_agent_id}`}
                      className={statusBadgeClassName(helper.helper_status)}
                    >
                      {statusLabel(helper.helper_status)}
                    </span>
                    {helper.within_bounds === false && (
                      <span data-testid={`agent-helper-warning-${helper.helper_agent_id}`}>
                        Exceeds parent — narrowed automatically
                      </span>
                    )}{' '}
                    <button
                      type="button"
                      data-testid={`agent-helper-remove-${helper.helper_agent_id}`}
                      onClick={() => handleRemove(helper.helper_agent_id)}
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>

              <form onSubmit={handleSubmit}>
                <select
                  data-testid="helper-candidate-select"
                  value={effectiveCandidateId}
                  onChange={(e) => setSelectedCandidateId(e.target.value)}
                >
                  {eligibleCandidates.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name}
                    </option>
                  ))}
                </select>

                <button type="submit" data-testid="helper-assign-submit" disabled={isAssigning}>
                  Add helper
                </button>
              </form>

              {formError && <div data-testid="manage-helpers-form-error">{formError}</div>}
              {cycleError && <div data-testid="manage-helpers-cycle-error">{cycleError}</div>}
              {depthError && <div data-testid="manage-helpers-depth-error">{depthError}</div>}

              <button
                type="button"
                data-testid="helper-hierarchy-toggle"
                onClick={() => setHierarchyExpanded((prev) => !prev)}
              >
                {hierarchyExpanded ? 'Hide full chain' : 'View full chain'}
              </button>

              {hierarchyExpanded && (
                <div data-testid="helper-hierarchy-content">
                  {hierarchyEntries.map((entry) => (
                    <div
                      key={entry.agent_id}
                      data-testid={`helper-hierarchy-entry-${entry.agent_id}`}
                      style={{ paddingLeft: hierarchyIndent(entry.depth) }}
                    >
                      {entry.name} — {statusLabel(entry.helper_status)}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default ManageHelpersPanel;
