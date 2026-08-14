import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * 097-subagent-model, contracts/frontend-subagent-model.md §4 — neither
 * `./ManageHelpersPanel` nor `./agentHelperApi` exists yet (both are later
 * implementation tasks, T029/T031, out of this task's own scope). This file
 * mocks `./agentHelperApi`'s exported hooks directly, rather than mocking
 * the HTTP layer (`@clarion-app/frontend-base`'s `createBaseQuery`) and
 * rendering against a real Redux store — this package's usual convention
 * for an already-existing slice (see AgentBrowser.route.test.tsx) — because
 * the real slice module does not exist yet for a real store to be built
 * against (ManageSharingPanel.test.tsx's own precedent, mirrored here). The
 * "Add helper" candidate picker reuses the already-existing
 * `./agentBrowserApi`'s `useSearchAgentsQuery` (contracts §2), which is
 * mocked the same way for the same reason: this is a unit test of
 * `ManageHelpersPanel`'s own orchestration, not of a real store's wiring.
 * The `./ManageHelpersPanel` import below is expected to fail module
 * resolution at collection time; that failure (or, depending on how
 * `vi.mock` resolves a relative specifier with no backing file, a failure
 * resolving `./agentHelperApi` itself) is this file's own RED signal.
 *
 * Conventions assumed below (none are pinned by the design docs beyond the
 * data-testids named in contracts §4 — everything else is this test's own
 * contract for the eventual implementation):
 *   - root container:            data-testid="manage-helpers-panel"
 *   - collapsed/expand toggle:   data-testid="manage-helpers-toggle"
 *   - expanded content:          data-testid="manage-helpers-content"
 *   - a helper row:              data-testid={`agent-helper-row-${helper_agent_id}`}
 *   - a helper's status badge:   data-testid={`agent-helper-status-${helper_agent_id}`}
 *   - a helper's warning badge:  data-testid={`agent-helper-warning-${helper_agent_id}`}
 *   - candidate picker:          data-testid="helper-candidate-select"
 *   - assign submit button:      data-testid="helper-assign-submit"
 *   - inline validation error (422, e.g. self_assignment/exceeds_parent_permissions):
 *                                data-testid="manage-helpers-form-error"
 *   - distinct "agent no longer owned" error (404 on the helpers list):
 *                                data-testid="manage-helpers-not-owned-error"
 */

vi.mock('./agentHelperApi', () => ({
  useListHelpersQuery: vi.fn(),
  useListHelperHierarchyQuery: vi.fn(),
  useAssignHelperMutation: vi.fn(),
  useRemoveHelperMutation: vi.fn(),
}));

vi.mock('./agentBrowserApi', () => ({
  useSearchAgentsQuery: vi.fn(),
}));

const agentHelperApiMocks = await import('./agentHelperApi');
const agentBrowserApiMocks = await import('./agentBrowserApi');
const { ManageHelpersPanel } = await import('./ManageHelpersPanel');

const useListHelpersQuery = agentHelperApiMocks.useListHelpersQuery as unknown as ReturnType<typeof vi.fn>;
const useListHelperHierarchyQuery = agentHelperApiMocks.useListHelperHierarchyQuery as unknown as ReturnType<typeof vi.fn>;
const useAssignHelperMutation = agentHelperApiMocks.useAssignHelperMutation as unknown as ReturnType<typeof vi.fn>;
const useRemoveHelperMutation = agentHelperApiMocks.useRemoveHelperMutation as unknown as ReturnType<typeof vi.fn>;
const useSearchAgentsQuery = agentBrowserApiMocks.useSearchAgentsQuery as unknown as ReturnType<typeof vi.fn>;

const PARENT_ID = 'agent-parent-1';

function makeHelper(overrides: Record<string, any> = {}) {
  return {
    id: 'helper-assignment-1',
    parent_agent_id: PARENT_ID,
    helper_agent_id: 'agent-helper-1',
    helper_name: 'Billing Lookup Helper',
    helper_purpose:
      'Looks up billing records and account history so the parent agent never has to ask the customer twice for the same details.',
    helper_status: 'active',
    within_bounds: true,
    effective_operation_count: 3,
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
    purpose: 'A candidate agent eligible to become a helper.',
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

let assignHelperTrigger: ReturnType<typeof vi.fn>;
let removeHelperTrigger: ReturnType<typeof vi.fn>;

beforeEach(() => {
  useListHelpersQuery.mockReset();
  useListHelperHierarchyQuery.mockReset();
  useAssignHelperMutation.mockReset();
  useRemoveHelperMutation.mockReset();
  useSearchAgentsQuery.mockReset();

  useListHelpersQuery.mockReturnValue({
    data: { data: [] },
    isLoading: false,
    isError: false,
    error: undefined,
  });

  useListHelperHierarchyQuery.mockReturnValue({
    data: { data: [], truncated: false },
    isLoading: false,
    isError: false,
  });

  useSearchAgentsQuery.mockReturnValue({
    data: { data: [makeCandidate()], meta: { current_page: 1, per_page: 20, total: 1, last_page: 1 }, total_unfiltered: 1 },
    isLoading: false,
    isError: false,
  });

  assignHelperTrigger = vi.fn(() => ({ unwrap: () => Promise.resolve(makeHelper()) }));
  useAssignHelperMutation.mockReturnValue([assignHelperTrigger, { isLoading: false }]);

  removeHelperTrigger = vi.fn(() => ({ unwrap: () => Promise.resolve() }));
  useRemoveHelperMutation.mockReturnValue([removeHelperTrigger, { isLoading: false }]);
});

function expand() {
  fireEvent.click(screen.getByTestId('manage-helpers-toggle'));
}

describe('ManageHelpersPanel — collapse/expand', () => {
  it('is collapsed by default and expands when the toggle is clicked', () => {
    render(<ManageHelpersPanel agentId={PARENT_ID} />);

    expect(screen.getByTestId('manage-helpers-toggle')).toBeInTheDocument();
    expect(screen.queryByTestId('manage-helpers-content')).not.toBeInTheDocument();

    expand();

    expect(screen.getByTestId('manage-helpers-content')).toBeInTheDocument();
  });
});

describe('ManageHelpersPanel — current helpers', () => {
  it("calls useListHelpersQuery for this agent once expanded and renders each helper's name, truncated purpose, and status badge", () => {
    useListHelpersQuery.mockReturnValue({
      data: {
        data: [
          makeHelper({
            helper_agent_id: 'agent-helper-1',
            helper_name: 'Billing Lookup Helper',
            helper_status: 'active',
          }),
          makeHelper({
            id: 'helper-assignment-2',
            helper_agent_id: 'agent-helper-2',
            helper_name: 'Refund Processor Helper',
            helper_status: 'deactivated',
          }),
        ],
      },
      isLoading: false,
      isError: false,
      error: undefined,
    });

    render(<ManageHelpersPanel agentId={PARENT_ID} />);
    expand();

    expect(useListHelpersQuery).toHaveBeenCalledWith(expect.objectContaining({ agentId: PARENT_ID }));

    const activeRow = screen.getByTestId('agent-helper-row-agent-helper-1');
    expect(activeRow.textContent ?? '').toMatch(/Billing Lookup Helper/);
    expect(activeRow.textContent ?? '').toMatch(/Looks up billing records/);
    expect(screen.getByTestId('agent-helper-status-agent-helper-1').textContent ?? '').toMatch(/active/i);

    const deactivatedRow = screen.getByTestId('agent-helper-row-agent-helper-2');
    expect(deactivatedRow.textContent ?? '').toMatch(/Refund Processor Helper/);
    expect(screen.getByTestId('agent-helper-status-agent-helper-2').textContent ?? '').toMatch(/deactivated/i);
  });

  it("truncates a long helper_purpose rather than rendering it in full", () => {
    const longPurpose = 'A '.repeat(200) + 'very long purpose string that should not render in full on the card.';
    useListHelpersQuery.mockReturnValue({
      data: { data: [makeHelper({ helper_purpose: longPurpose })] },
      isLoading: false,
      isError: false,
      error: undefined,
    });

    render(<ManageHelpersPanel agentId={PARENT_ID} />);
    expand();

    const row = screen.getByTestId('agent-helper-row-agent-helper-1');
    expect((row.textContent ?? '').length).toBeLessThan(longPurpose.length);
  });
});

describe('ManageHelpersPanel — add helper form', () => {
  it('populates the candidate select from useSearchAgentsQuery, excluding the parent itself and already-assigned helpers, restricted to owned agents', () => {
    useListHelpersQuery.mockReturnValue({
      data: { data: [makeHelper({ helper_agent_id: 'agent-already-helper' })] },
      isLoading: false,
      isError: false,
      error: undefined,
    });

    useSearchAgentsQuery.mockReturnValue({
      data: {
        data: [
          makeCandidate({ id: 'agent-eligible-1', name: 'Eligible Owned Agent', permission: 'owner' }),
          makeCandidate({ id: PARENT_ID, name: 'The Parent Itself', permission: 'owner' }),
          makeCandidate({ id: 'agent-already-helper', name: 'Already A Helper', permission: 'owner' }),
          makeCandidate({ id: 'agent-not-owned', name: 'Shared Not Owned', permission: 'use' }),
        ],
        meta: { current_page: 1, per_page: 20, total: 4, last_page: 1 },
        total_unfiltered: 4,
      },
      isLoading: false,
      isError: false,
    });

    render(<ManageHelpersPanel agentId={PARENT_ID} />);
    expand();

    const select = screen.getByTestId('helper-candidate-select');
    expect(select.textContent ?? '').toMatch(/Eligible Owned Agent/);
    expect(select.textContent ?? '').not.toMatch(/The Parent Itself/);
    expect(select.textContent ?? '').not.toMatch(/Already A Helper/);
    expect(select.textContent ?? '').not.toMatch(/Shared Not Owned/);
  });

  it('calls useAssignHelperMutation with the selected candidate on submit', async () => {
    useSearchAgentsQuery.mockReturnValue({
      data: {
        data: [makeCandidate({ id: 'agent-eligible-1', name: 'Eligible Owned Agent', permission: 'owner' })],
        meta: { current_page: 1, per_page: 20, total: 1, last_page: 1 },
        total_unfiltered: 1,
      },
      isLoading: false,
      isError: false,
    });

    render(<ManageHelpersPanel agentId={PARENT_ID} />);
    expand();

    fireEvent.change(screen.getByTestId('helper-candidate-select'), { target: { value: 'agent-eligible-1' } });
    fireEvent.click(screen.getByTestId('helper-assign-submit'));

    await waitFor(() => {
      expect(assignHelperTrigger).toHaveBeenCalledWith(
        expect.objectContaining({ agentId: PARENT_ID, helperAgentId: 'agent-eligible-1' }),
      );
    });
  });

  it('renders the server\'s own message inline, not a thrown exception, when assignment rejects with a 422 self_assignment error', async () => {
    assignHelperTrigger = vi.fn(() => ({
      unwrap: () =>
        Promise.reject({
          status: 422,
          data: { error: 'self_assignment', message: 'An agent cannot be assigned as its own helper.' },
        }),
    }));
    useAssignHelperMutation.mockReturnValue([assignHelperTrigger, { isLoading: false }]);

    render(<ManageHelpersPanel agentId={PARENT_ID} />);
    expand();
    fireEvent.click(screen.getByTestId('helper-assign-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('manage-helpers-form-error').textContent ?? '').toMatch(
        /an agent cannot be assigned as its own helper/i,
      );
    });
    expect(screen.queryByTestId('manage-helpers-not-owned-error')).not.toBeInTheDocument();
  });

  it('renders the server\'s own message inline when assignment rejects with a 422 exceeds_parent_permissions error', async () => {
    assignHelperTrigger = vi.fn(() => ({
      unwrap: () =>
        Promise.reject({
          status: 422,
          data: {
            error: 'exceeds_parent_permissions',
            excess_operation_ids: ['delete_account'],
            message: 'This helper can do things the parent agent cannot: delete_account.',
          },
        }),
    }));
    useAssignHelperMutation.mockReturnValue([assignHelperTrigger, { isLoading: false }]);

    render(<ManageHelpersPanel agentId={PARENT_ID} />);
    expand();
    fireEvent.click(screen.getByTestId('helper-assign-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('manage-helpers-form-error').textContent ?? '').toMatch(
        /this helper can do things the parent agent cannot/i,
      );
    });
    expect(screen.queryByTestId('manage-helpers-not-owned-error')).not.toBeInTheDocument();
  });
});

describe('ManageHelpersPanel — agent no longer owned', () => {
  it('renders a distinct error state, not the form-validation error, when listing helpers 404s', () => {
    useListHelpersQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { status: 404, data: { error: 'Agent not found', code: 'agent_not_found' } },
    });

    render(<ManageHelpersPanel agentId={PARENT_ID} />);
    expand();

    expect(screen.getByTestId('manage-helpers-not-owned-error')).toBeInTheDocument();
    expect(screen.queryByTestId('manage-helpers-form-error')).not.toBeInTheDocument();
  });
});

/**
 * T022 (US2) — a `within_bounds: false` fixture on a listed helper row
 * renders the "Exceeds parent — narrowed automatically" warning badge
 * (contracts §4), informational only, and must not block the row from
 * otherwise rendering its name/purpose/status normally.
 */
describe('ManageHelpersPanel — 097-subagent-model US2: within_bounds warning badge', () => {
  it('renders a warning badge on a helper row whose within_bounds is false', () => {
    useListHelpersQuery.mockReturnValue({
      data: {
        data: [
          makeHelper({
            helper_agent_id: 'agent-helper-exceeds',
            helper_name: 'Overreaching Helper',
            within_bounds: false,
          }),
        ],
      },
      isLoading: false,
      isError: false,
      error: undefined,
    });

    render(<ManageHelpersPanel agentId={PARENT_ID} />);
    expand();

    expect(screen.getByTestId('agent-helper-warning-agent-helper-exceeds').textContent ?? '').toMatch(
      /exceeds parent.*narrowed automatically/i,
    );
  });

  it('renders no warning badge on a helper row whose within_bounds is true', () => {
    useListHelpersQuery.mockReturnValue({
      data: {
        data: [
          makeHelper({
            helper_agent_id: 'agent-helper-fine',
            helper_name: 'Well-Behaved Helper',
            within_bounds: true,
          }),
        ],
      },
      isLoading: false,
      isError: false,
      error: undefined,
    });

    render(<ManageHelpersPanel agentId={PARENT_ID} />);
    expand();

    expect(screen.queryByTestId('agent-helper-warning-agent-helper-fine')).not.toBeInTheDocument();
  });

  it('still renders the row name/purpose/status normally alongside the warning badge — informational only, never blocking', () => {
    useListHelpersQuery.mockReturnValue({
      data: {
        data: [
          makeHelper({
            helper_agent_id: 'agent-helper-exceeds',
            helper_name: 'Overreaching Helper',
            helper_status: 'active',
            within_bounds: false,
          }),
        ],
      },
      isLoading: false,
      isError: false,
      error: undefined,
    });

    render(<ManageHelpersPanel agentId={PARENT_ID} />);
    expand();

    const row = screen.getByTestId('agent-helper-row-agent-helper-exceeds');
    expect(row.textContent ?? '').toMatch(/Overreaching Helper/);
    expect(screen.getByTestId('agent-helper-status-agent-helper-exceeds').textContent ?? '').toMatch(/active/i);
    expect(screen.getByTestId('agent-helper-warning-agent-helper-exceeds')).toBeInTheDocument();
  });
});
