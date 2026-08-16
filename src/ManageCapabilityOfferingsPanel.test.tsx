import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * 109-agent-as-capability, contracts/capability-offering-api.md —
 * mirrors ManageHelpersPanel.test.tsx's own established convention: mock
 * `./capabilityOfferingApi`'s exported hooks directly rather than mocking
 * the HTTP layer and rendering against a real Redux store, and mock the
 * already-existing `./agentBrowserApi`'s `useSearchAgentsQuery` the same
 * way — this is a unit test of ManageCapabilityOfferingsPanel's own
 * orchestration, not of a real store's wiring.
 *
 * data-testids exercised below (this test's own contract for the
 * implementation, mirroring ManageHelpersPanel.test.tsx's naming scheme):
 *   - root container:            data-testid="manage-capability-offerings-panel"
 *   - collapsed/expand toggle:   data-testid="manage-capability-offerings-toggle"
 *   - expanded content:          data-testid="manage-capability-offerings-content"
 *   - an offering row:           data-testid={`capability-offering-row-${id}`}
 *   - a row's withdraw button:   data-testid={`capability-offering-withdraw-${id}`}
 *   - candidate picker:          data-testid="capability-offering-candidate-select"
 *   - capability name input:     data-testid="capability-offering-name-input"
 *   - capability description:    data-testid="capability-offering-description-input"
 *   - input description:         data-testid="capability-offering-input-description-input"
 *   - offer submit button:       data-testid="capability-offering-submit"
 *   - distinct "agent no longer owned" error (404 on the offerings list):
 *                                data-testid="manage-capability-offerings-not-owned-error"
 *   - 422 self_offering error:   data-testid="manage-capability-offerings-self-offering-error"
 *   - 422 cycle error:           data-testid="manage-capability-offerings-cycle-error"
 */

vi.mock('./capabilityOfferingApi', () => ({
  useListOfferingsQuery: vi.fn(),
  useOfferMutation: vi.fn(),
  useWithdrawMutation: vi.fn(),
}));

vi.mock('./agentBrowserApi', () => ({
  useSearchAgentsQuery: vi.fn(),
}));

const capabilityOfferingApiMocks = await import('./capabilityOfferingApi');
const agentBrowserApiMocks = await import('./agentBrowserApi');
const { ManageCapabilityOfferingsPanel } = await import('./ManageCapabilityOfferingsPanel');

const useListOfferingsQuery = capabilityOfferingApiMocks.useListOfferingsQuery as unknown as ReturnType<typeof vi.fn>;
const useOfferMutation = capabilityOfferingApiMocks.useOfferMutation as unknown as ReturnType<typeof vi.fn>;
const useWithdrawMutation = capabilityOfferingApiMocks.useWithdrawMutation as unknown as ReturnType<typeof vi.fn>;
const useSearchAgentsQuery = agentBrowserApiMocks.useSearchAgentsQuery as unknown as ReturnType<typeof vi.fn>;

const AGENT_ID = 'agent-offered-1';

function makeOffering(overrides: Record<string, any> = {}) {
  return {
    id: 'offering-1',
    offered_agent_id: AGENT_ID,
    offered_agent_name: 'Summarizer',
    caller_agent_id: 'agent-caller-1',
    caller_agent_name: 'Research Assistant',
    capability_name: 'summarize_document',
    capability_description: 'Produces a concise summary of a supplied document or block of text.',
    input_description: 'The document text, or a description of where to find it, to summarize.',
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    ...overrides,
  };
}

function makeCandidate(overrides: Record<string, any> = {}) {
  return {
    id: 'agent-candidate-1',
    name: 'Candidate Agent',
    is_active: true,
    can_use: true,
    current_version_number: 1,
    purpose: 'A candidate agent eligible to receive a capability offering.',
    capabilities: [],
    operation_count: 2,
    memory_enabled: false,
    usage: {
      has_run: false,
      run_count: 0,
      reliability: { invocation_count: 0, success_count: 0, failure_count: 0, low_sample: false, no_activity: true },
      cost: { priced_cost_total: '0.00', request_count: 0, unpriced_request_count: 0, has_estimated_cost: false },
    },
    is_shared: false,
    shared_by: null,
    permission: 'owner',
    ...overrides,
  };
}

let offerTrigger: ReturnType<typeof vi.fn>;
let withdrawTrigger: ReturnType<typeof vi.fn>;

beforeEach(() => {
  useListOfferingsQuery.mockReset();
  useOfferMutation.mockReset();
  useWithdrawMutation.mockReset();
  useSearchAgentsQuery.mockReset();

  useListOfferingsQuery.mockReturnValue({
    data: { data: [] },
    isLoading: false,
    isError: false,
    error: undefined,
  });

  useSearchAgentsQuery.mockReturnValue({
    data: { data: [makeCandidate()], meta: { current_page: 1, per_page: 20, total: 1, last_page: 1 }, total_unfiltered: 1 },
    isLoading: false,
    isError: false,
  });

  offerTrigger = vi.fn(() => ({ unwrap: () => Promise.resolve(makeOffering()) }));
  useOfferMutation.mockReturnValue([offerTrigger, { isLoading: false }]);

  withdrawTrigger = vi.fn(() => ({ unwrap: () => Promise.resolve({ removed: true }) }));
  useWithdrawMutation.mockReturnValue([withdrawTrigger, { isLoading: false }]);
});

function expand() {
  fireEvent.click(screen.getByTestId('manage-capability-offerings-toggle'));
}

describe('ManageCapabilityOfferingsPanel — collapse/expand', () => {
  it('is collapsed by default and expands when the toggle is clicked', () => {
    render(<ManageCapabilityOfferingsPanel agentId={AGENT_ID} />);

    expect(screen.getByTestId('manage-capability-offerings-toggle')).toBeInTheDocument();
    expect(screen.queryByTestId('manage-capability-offerings-content')).not.toBeInTheDocument();

    expand();

    expect(screen.getByTestId('manage-capability-offerings-content')).toBeInTheDocument();
  });
});

describe('ManageCapabilityOfferingsPanel — current offerings', () => {
  it("calls useListOfferingsQuery for this agent once expanded and renders each offering's name, truncated description, and caller agent name", () => {
    useListOfferingsQuery.mockReturnValue({
      data: {
        data: [
          makeOffering({
            id: 'offering-1',
            capability_name: 'summarize_document',
            caller_agent_name: 'Research Assistant',
          }),
        ],
      },
      isLoading: false,
      isError: false,
      error: undefined,
    });

    render(<ManageCapabilityOfferingsPanel agentId={AGENT_ID} />);
    expand();

    expect(useListOfferingsQuery).toHaveBeenCalledWith(expect.objectContaining({ offeredAgentId: AGENT_ID }));

    const row = screen.getByTestId('capability-offering-row-offering-1');
    expect(row.textContent ?? '').toMatch(/summarize_document/);
    expect(row.textContent ?? '').toMatch(/Produces a concise summary/);
    expect(row.textContent ?? '').toMatch(/Research Assistant/);
  });

  it('truncates a long capability_description rather than rendering it in full', () => {
    const longDescription = 'A '.repeat(200) + 'very long description that should not render in full on the card.';
    useListOfferingsQuery.mockReturnValue({
      data: { data: [makeOffering({ capability_description: longDescription })] },
      isLoading: false,
      isError: false,
      error: undefined,
    });

    render(<ManageCapabilityOfferingsPanel agentId={AGENT_ID} />);
    expand();

    const row = screen.getByTestId('capability-offering-row-offering-1');
    expect((row.textContent ?? '').length).toBeLessThan(longDescription.length);
  });
});

describe('ManageCapabilityOfferingsPanel — offer as capability form', () => {
  it('populates the candidate select from useSearchAgentsQuery, excluding the offered agent itself, restricted to owned agents', () => {
    useSearchAgentsQuery.mockReturnValue({
      data: {
        data: [
          makeCandidate({ id: 'agent-eligible-1', name: 'Eligible Owned Agent', permission: 'owner' }),
          makeCandidate({ id: AGENT_ID, name: 'The Offered Agent Itself', permission: 'owner' }),
          makeCandidate({ id: 'agent-not-owned', name: 'Shared Not Owned', permission: 'use' }),
        ],
        meta: { current_page: 1, per_page: 20, total: 3, last_page: 1 },
        total_unfiltered: 3,
      },
      isLoading: false,
      isError: false,
    });

    render(<ManageCapabilityOfferingsPanel agentId={AGENT_ID} />);
    expand();

    const select = screen.getByTestId('capability-offering-candidate-select');
    expect(select.textContent ?? '').toMatch(/Eligible Owned Agent/);
    expect(select.textContent ?? '').not.toMatch(/The Offered Agent Itself/);
    expect(select.textContent ?? '').not.toMatch(/Shared Not Owned/);
  });

  it('calls useOfferMutation with the selected candidate and form fields on submit', async () => {
    useSearchAgentsQuery.mockReturnValue({
      data: {
        data: [makeCandidate({ id: 'agent-eligible-1', name: 'Eligible Owned Agent', permission: 'owner' })],
        meta: { current_page: 1, per_page: 20, total: 1, last_page: 1 },
        total_unfiltered: 1,
      },
      isLoading: false,
      isError: false,
    });

    render(<ManageCapabilityOfferingsPanel agentId={AGENT_ID} />);
    expand();

    fireEvent.change(screen.getByTestId('capability-offering-candidate-select'), {
      target: { value: 'agent-eligible-1' },
    });
    fireEvent.change(screen.getByTestId('capability-offering-name-input'), {
      target: { value: 'summarize_document' },
    });
    fireEvent.change(screen.getByTestId('capability-offering-description-input'), {
      target: { value: 'Produces a concise summary of a supplied document.' },
    });
    fireEvent.change(screen.getByTestId('capability-offering-input-description-input'), {
      target: { value: 'The document text to summarize.' },
    });
    fireEvent.click(screen.getByTestId('capability-offering-submit'));

    await waitFor(() => {
      expect(offerTrigger).toHaveBeenCalledWith(
        expect.objectContaining({
          offeredAgentId: AGENT_ID,
          callerAgentId: 'agent-eligible-1',
          capabilityName: 'summarize_document',
          capabilityDescription: 'Produces a concise summary of a supplied document.',
          inputDescription: 'The document text to summarize.',
        }),
      );
    });
  });
});

describe('ManageCapabilityOfferingsPanel — distinct inline error states', () => {
  it('renders a distinct error state, not the form-validation error, when listing offerings 404s', () => {
    useListOfferingsQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { status: 404, data: { error: 'Agent not found', code: 'agent_not_found' } },
    });

    render(<ManageCapabilityOfferingsPanel agentId={AGENT_ID} />);
    expand();

    expect(screen.getByTestId('manage-capability-offerings-not-owned-error')).toBeInTheDocument();
    expect(screen.queryByTestId('manage-capability-offerings-form-error')).not.toBeInTheDocument();
  });

  it('renders a distinct inline message when offer rejects with a 422 self_offering error', async () => {
    offerTrigger = vi.fn(() => ({
      unwrap: () =>
        Promise.reject({
          status: 422,
          data: { error: 'self_offering', message: 'An agent cannot be offered as a capability to itself.' },
        }),
    }));
    useOfferMutation.mockReturnValue([offerTrigger, { isLoading: false }]);

    render(<ManageCapabilityOfferingsPanel agentId={AGENT_ID} />);
    expand();
    fireEvent.click(screen.getByTestId('capability-offering-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('manage-capability-offerings-self-offering-error').textContent ?? '').toMatch(
        /cannot be offered as a capability to itself/i,
      );
    });
    expect(screen.queryByTestId('manage-capability-offerings-not-owned-error')).not.toBeInTheDocument();
    expect(screen.queryByTestId('manage-capability-offerings-cycle-error')).not.toBeInTheDocument();
  });

  it('renders a distinct inline message, naming the cycle, when offer rejects with a 422 capability_offering_cycle error', async () => {
    offerTrigger = vi.fn(() => ({
      unwrap: () =>
        Promise.reject({
          status: 422,
          data: {
            error: 'capability_offering_cycle',
            cycle_path: ['agentA', 'agentB', 'agentC', 'agentA'],
            message: 'This offering would create a cycle: agentA -> agentB -> agentC -> agentA.',
          },
        }),
    }));
    useOfferMutation.mockReturnValue([offerTrigger, { isLoading: false }]);

    render(<ManageCapabilityOfferingsPanel agentId={AGENT_ID} />);
    expand();
    fireEvent.click(screen.getByTestId('capability-offering-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('manage-capability-offerings-cycle-error').textContent ?? '').toMatch(
        /would create a cycle/i,
      );
    });
    expect(screen.getByTestId('manage-capability-offerings-cycle-error').textContent ?? '').toMatch(/agentA/);
    expect(screen.queryByTestId('manage-capability-offerings-not-owned-error')).not.toBeInTheDocument();
    expect(screen.queryByTestId('manage-capability-offerings-self-offering-error')).not.toBeInTheDocument();
  });
});

describe('ManageCapabilityOfferingsPanel — withdraw action', () => {
  it('renders a "Withdraw" button for each listed offering', () => {
    useListOfferingsQuery.mockReturnValue({
      data: { data: [makeOffering({ id: 'offering-1' }), makeOffering({ id: 'offering-2', capability_name: 'other_capability' })] },
      isLoading: false,
      isError: false,
      error: undefined,
    });

    render(<ManageCapabilityOfferingsPanel agentId={AGENT_ID} />);
    expand();

    expect(screen.getByTestId('capability-offering-withdraw-offering-1').textContent ?? '').toMatch(/withdraw/i);
    expect(screen.getByTestId('capability-offering-withdraw-offering-2').textContent ?? '').toMatch(/withdraw/i);
  });

  it('calls useWithdrawMutation with the correct offeredAgentId/callerAgentId when a row\'s "Withdraw" button is clicked', async () => {
    useListOfferingsQuery.mockReturnValue({
      data: { data: [makeOffering({ id: 'offering-1', caller_agent_id: 'agent-caller-1' })] },
      isLoading: false,
      isError: false,
      error: undefined,
    });

    render(<ManageCapabilityOfferingsPanel agentId={AGENT_ID} />);
    expand();

    fireEvent.click(screen.getByTestId('capability-offering-withdraw-offering-1'));

    await waitFor(() => {
      expect(withdrawTrigger).toHaveBeenCalledWith(
        expect.objectContaining({ offeredAgentId: AGENT_ID, callerAgentId: 'agent-caller-1' }),
      );
    });
  });

  it('on a successful withdraw, the offerings list re-fetches and the withdrawn offering no longer appears while another still-listed offering remains', async () => {
    useListOfferingsQuery.mockReturnValue({
      data: {
        data: [
          makeOffering({ id: 'offering-1', caller_agent_id: 'agent-caller-1' }),
          makeOffering({ id: 'offering-2', caller_agent_id: 'agent-caller-2', capability_name: 'other_capability' }),
        ],
      },
      isLoading: false,
      isError: false,
      error: undefined,
    });

    const { rerender } = render(<ManageCapabilityOfferingsPanel agentId={AGENT_ID} />);
    expand();

    expect(screen.getByTestId('capability-offering-row-offering-1')).toBeInTheDocument();
    expect(screen.getByTestId('capability-offering-row-offering-2')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('capability-offering-withdraw-offering-1'));

    await waitFor(() => {
      expect(withdrawTrigger).toHaveBeenCalledWith(
        expect.objectContaining({ offeredAgentId: AGENT_ID, callerAgentId: 'agent-caller-1' }),
      );
    });

    // Simulate the cache invalidation this mutation's `invalidatesTags:
    // ['CapabilityOfferings']` triggers in the real store: useListOfferingsQuery's
    // next call now returns the post-withdraw list.
    useListOfferingsQuery.mockReturnValue({
      data: { data: [makeOffering({ id: 'offering-2', caller_agent_id: 'agent-caller-2', capability_name: 'other_capability' })] },
      isLoading: false,
      isError: false,
      error: undefined,
    });

    rerender(<ManageCapabilityOfferingsPanel agentId={AGENT_ID} />);

    expect(screen.queryByTestId('capability-offering-row-offering-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('capability-offering-row-offering-2')).toBeInTheDocument();
  });
});
