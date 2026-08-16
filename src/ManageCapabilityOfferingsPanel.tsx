import React, { useMemo, useState } from 'react';
import { useListOfferingsQuery, useOfferMutation, useWithdrawMutation } from './capabilityOfferingApi';
import { useSearchAgentsQuery } from './agentBrowserApi';

/**
 * ManageCapabilityOfferingsPanel — the owner-only "capability offerings"
 * disclosure this feature adds inline to AgentCard (109-agent-as-capability,
 * contracts/capability-offering-api.md), mirroring ManageHelpersPanel.tsx's
 * exact shape. Not routed, not in customFields.clarion.routes — a plain,
 * prop-driven component, colocated the same way AgentCard/ManageHelpersPanel
 * themselves are.
 *
 * Collapsed by default. Once expanded, lists the agent's current offerings
 * (capability_name, truncated capability_description, and the caller
 * agent's name) via useListOfferingsQuery, and a small "Offer as capability"
 * form (a candidate caller-agent picker fed by useSearchAgentsQuery,
 * filtered client-side to the caller's own owned agents excluding this agent
 * itself, plus capability_name/capability_description/input_description
 * fields) using useOfferMutation on submit, and a withdraw action per row
 * using useWithdrawMutation.
 *
 * A listOfferings 404 (the agent is no longer owned by the caller) and an
 * offer 422 (self_offering, capability_offering_cycle) are each rendered
 * inline as distinct error states rather than thrown/crashed through.
 */

interface ManageCapabilityOfferingsPanelProps {
  agentId: string;
}

interface CandidateAgent {
  id: string;
  name: string;
  permission: 'owner' | 'use' | 'use_and_edit';
}

const DESCRIPTION_TRUNCATE_LENGTH = 150;

function truncateDescription(description: string | null | undefined): string {
  if (!description) {
    return '';
  }
  if (description.length <= DESCRIPTION_TRUNCATE_LENGTH) {
    return description;
  }
  return `${description.slice(0, DESCRIPTION_TRUNCATE_LENGTH)}…`;
}

// RTK Query rejects with either a FetchBaseQueryError ({ status, data }) or
// a SerializedError ({ message }) — neither is imported here to keep this
// narrow; this guard covers only the shape this component actually reads.
// Duplicated from ManageHelpersPanel.tsx rather than imported (that file
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

// The `error` field on a rejected offer response is a machine-readable code
// (`self_offering`, `capability_offering_cycle`) distinguishing which of the
// two structured 422 shapes came back, so each can be routed to its own
// distinct inline rendering instead of a generic passthrough.
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

function extractCyclePath(err: unknown): string[] | undefined {
  if (typeof err !== 'object' || err === null) {
    return undefined;
  }
  const data = (err as { data?: unknown }).data;
  if (data && typeof data === 'object') {
    const body = data as { cycle_path?: unknown };
    if (Array.isArray(body.cycle_path)) {
      return body.cycle_path as string[];
    }
  }
  return undefined;
}

export function ManageCapabilityOfferingsPanel({ agentId }: ManageCapabilityOfferingsPanelProps): React.ReactElement {
  const [expanded, setExpanded] = useState(false);
  const [selectedCandidateId, setSelectedCandidateId] = useState('');
  const [capabilityName, setCapabilityName] = useState('');
  const [capabilityDescription, setCapabilityDescription] = useState('');
  const [inputDescription, setInputDescription] = useState('');
  const [formError, setFormError] = useState<string | null>(null);
  const [selfOfferingError, setSelfOfferingError] = useState<string | null>(null);
  const [cycleError, setCycleError] = useState<{ message: string; cyclePath?: string[] } | null>(null);

  const { data: offeringsData, isError: offeringsIsError } = useListOfferingsQuery({ offeredAgentId: agentId });
  const { data: candidatesData } = useSearchAgentsQuery({});
  const [offer, { isLoading: isOffering }] = useOfferMutation();
  const [withdraw] = useWithdrawMutation();

  const offerings = useMemo(() => offeringsData?.data ?? [], [offeringsData]);

  const eligibleCandidates: CandidateAgent[] = useMemo(() => {
    const rawCandidates = (candidatesData?.data ?? []) as CandidateAgent[];
    return rawCandidates.filter((candidate) => candidate.permission === 'owner' && candidate.id !== agentId);
  }, [candidatesData, agentId]);

  const effectiveCandidateId = selectedCandidateId || eligibleCandidates[0]?.id || '';

  const clearErrors = () => {
    setFormError(null);
    setSelfOfferingError(null);
    setCycleError(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    clearErrors();
    try {
      await offer({
        offeredAgentId: agentId,
        callerAgentId: effectiveCandidateId,
        capabilityName,
        capabilityDescription,
        inputDescription,
      }).unwrap();
      setSelectedCandidateId('');
      setCapabilityName('');
      setCapabilityDescription('');
      setInputDescription('');
    } catch (err) {
      const code = extractErrorCode(err);
      const message = extractErrorMessage(err, 'Could not create this offering. Please check your selection and try again.');
      if (code === 'self_offering') {
        setSelfOfferingError(message);
      } else if (code === 'capability_offering_cycle') {
        setCycleError({ message, cyclePath: extractCyclePath(err) });
      } else {
        setFormError(message);
      }
    }
  };

  const handleWithdraw = (callerAgentId: string) => {
    void withdraw({ offeredAgentId: agentId, callerAgentId }).unwrap();
  };

  return (
    <div data-testid="manage-capability-offerings-panel">
      <button
        type="button"
        data-testid="manage-capability-offerings-toggle"
        onClick={() => setExpanded((prev) => !prev)}
      >
        {expanded ? 'Hide capability offerings' : 'Manage capability offerings'}
      </button>

      {expanded && (
        <div data-testid="manage-capability-offerings-content">
          {offeringsIsError ? (
            <div data-testid="manage-capability-offerings-not-owned-error">
              This agent is no longer available to manage capability offerings for.
            </div>
          ) : (
            <>
              <ul>
                {offerings.map((offering) => (
                  <li key={offering.id} data-testid={`capability-offering-row-${offering.id}`}>
                    {offering.capability_name} — {truncateDescription(offering.capability_description)} (offered to{' '}
                    {offering.caller_agent_name}){' '}
                    <button
                      type="button"
                      data-testid={`capability-offering-withdraw-${offering.id}`}
                      onClick={() => handleWithdraw(offering.caller_agent_id)}
                    >
                      Withdraw
                    </button>
                  </li>
                ))}
              </ul>

              <form onSubmit={handleSubmit}>
                <select
                  data-testid="capability-offering-candidate-select"
                  value={effectiveCandidateId}
                  onChange={(e) => setSelectedCandidateId(e.target.value)}
                >
                  {eligibleCandidates.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name}
                    </option>
                  ))}
                </select>

                <input
                  type="text"
                  data-testid="capability-offering-name-input"
                  placeholder="Capability name"
                  value={capabilityName}
                  onChange={(e) => setCapabilityName(e.target.value)}
                />

                <textarea
                  data-testid="capability-offering-description-input"
                  placeholder="Capability description"
                  value={capabilityDescription}
                  onChange={(e) => setCapabilityDescription(e.target.value)}
                />

                <textarea
                  data-testid="capability-offering-input-description-input"
                  placeholder="Input description"
                  value={inputDescription}
                  onChange={(e) => setInputDescription(e.target.value)}
                />

                <button type="submit" data-testid="capability-offering-submit" disabled={isOffering}>
                  Offer as capability
                </button>
              </form>

              {formError && <div data-testid="manage-capability-offerings-form-error">{formError}</div>}
              {selfOfferingError && (
                <div data-testid="manage-capability-offerings-self-offering-error">{selfOfferingError}</div>
              )}
              {cycleError && (
                <div data-testid="manage-capability-offerings-cycle-error">
                  {cycleError.message}
                  {cycleError.cyclePath && (
                    <span data-testid="manage-capability-offerings-cycle-path">
                      {' '}
                      ({cycleError.cyclePath.join(' -> ')})
                    </span>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default ManageCapabilityOfferingsPanel;
