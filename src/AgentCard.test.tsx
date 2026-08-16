import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AgentCard } from './AgentCard';

/**
 * 096-agent-sharing, contracts/frontend-agent-sharing.md §4 — `AgentCard.tsx`
 * does not read `is_shared`/`shared_by`/`permission` yet (that extension is
 * a later implementation task, out of scope here), so `./ManageSharingPanel`
 * is not actually imported by production code today either. It is mocked
 * below anyway, per this package's own established convention for a
 * not-yet-existing sibling component (ModelSetup.test.tsx's `./EmptyState`/
 * `./RolesPanel` mocks, RoleCard.test.tsx's `./ModelPicker` mock), so that
 * once `AgentCard.tsx` is extended to render `<ManageSharingPanel />` this
 * file keeps testing `AgentCard`'s own orchestration rather than
 * `ManageSharingPanel`'s internals.
 */
vi.mock('./ManageSharingPanel', () => ({
  ManageSharingPanel: () => React.createElement('div', { 'data-testid': 'manage-sharing-panel-mock' }, 'Mock Manage Sharing Panel'),
}));

/**
 * 097-subagent-model, contracts/frontend-subagent-model.md §4 — `AgentCard.tsx`
 * does not render `ManageHelpersPanel` yet (that extension is a later
 * implementation task, T033, out of scope here), so `./ManageHelpersPanel`
 * is not actually imported by production code today either. Mocked below
 * for the identical reason `./ManageSharingPanel` is mocked above — this
 * file keeps testing `AgentCard`'s own orchestration rather than
 * `ManageHelpersPanel`'s internals, once `AgentCard.tsx` is extended to
 * render it.
 */
vi.mock('./ManageHelpersPanel', () => ({
  ManageHelpersPanel: () => React.createElement('div', { 'data-testid': 'manage-helpers-panel-mock' }, 'Mock Manage Helpers Panel'),
}));

/**
 * 109-agent-as-capability, contracts/capability-offering-api.md — mocked
 * for the identical reason `./ManageSharingPanel`/`./ManageHelpersPanel`
 * are mocked above: `ManageCapabilityOfferingsPanel` calls RTK Query hooks
 * of its own (`useListOfferingsQuery`/`useSearchAgentsQuery`/etc.), which
 * throw outside a real `<Provider>` — this file renders `AgentCard` with no
 * store, since it is a unit test of `AgentCard`'s own orchestration, not of
 * `ManageCapabilityOfferingsPanel`'s internals.
 */
vi.mock('./ManageCapabilityOfferingsPanel', () => ({
  ManageCapabilityOfferingsPanel: () =>
    React.createElement('div', { 'data-testid': 'manage-capability-offerings-panel-mock' }, 'Mock Manage Capability Offerings Panel'),
}));

/**
 * Phase 3 (US1 + US2, 095-agent-summary-cards), contracts/
 * frontend-agent-cards.md §3-§4, data-model.md §8 — the new presentational
 * `AgentCard` component this feature adds, replacing `AgentBrowser.tsx`'s
 * current inline row markup (tasks.md Grounding note 12).
 *
 * `./AgentCard` does not exist yet (Phase 3's own implementation, T023-
 * T024, comes after these tests). This file is written first, per this
 * package's own established TDD convention, and is expected to fail at
 * collection time because the import above cannot resolve that module.
 *
 * The `AgentReliabilitySummary`/`AgentCostSummary`/`AgentUsageSummary`
 * interfaces, and the enlarged `AgentSearchEntry`, that this feature adds
 * to `types.ts` (T021/T022) don't exist yet either, so this file defines
 * its own local fixture shape mirroring contracts/frontend-agent-cards.md
 * §2 exactly, rather than importing from `types.ts` — vitest transpiles
 * test files without type-checking them (no `--typecheck`, no
 * `vite-plugin-checker` in this repo's vitest.config), so this has no
 * bearing on whether the tests below run/fail for the right reason.
 */

interface AgentReliabilitySummary {
  invocation_count: number;
  success_count: number;
  failure_count: number;
  low_sample: boolean;
  no_activity: boolean;
}

interface AgentCostSummary {
  priced_cost_total: string;
  request_count: number;
  unpriced_request_count: number;
  has_estimated_cost: boolean;
}

interface AgentUsageSummary {
  has_run: boolean;
  run_count: number;
  reliability: AgentReliabilitySummary;
  cost: AgentCostSummary;
}

interface AgentCardFixture {
  id: string;
  name: string;
  is_active: boolean;
  can_use: boolean;
  current_version_number: number | null;
  purpose: string;
  capabilities: string[];
  operation_count: number;
  memory_enabled: boolean;
  usage: AgentUsageSummary;
}

function makeReliability(overrides: Partial<AgentReliabilitySummary> = {}): AgentReliabilitySummary {
  return {
    invocation_count: 0,
    success_count: 0,
    failure_count: 0,
    low_sample: false,
    no_activity: true,
    ...overrides,
  };
}

function makeCost(overrides: Partial<AgentCostSummary> = {}): AgentCostSummary {
  return {
    priced_cost_total: '0.00',
    request_count: 0,
    unpriced_request_count: 0,
    has_estimated_cost: false,
    ...overrides,
  };
}

function makeUsage(overrides: Partial<AgentUsageSummary> = {}): AgentUsageSummary {
  return {
    has_run: false,
    run_count: 0,
    reliability: makeReliability(),
    cost: makeCost(),
    ...overrides,
  };
}

function makeAgent(overrides: Partial<AgentCardFixture> = {}): AgentCardFixture {
  return {
    id: 'agent-1',
    name: 'Customer Support Agent',
    is_active: true,
    can_use: true,
    current_version_number: 3,
    purpose: 'Helps customers troubleshoot billing issues.',
    capabilities: ['memory_read', 'memory_search'],
    operation_count: 14,
    memory_enabled: true,
    usage: makeUsage(),
    ...overrides,
  };
}

// =====================================================================
// T012 — US1 (spec.md Acceptance Scenarios, FR-001/FR-002/FR-003, SC-001):
// every field on this card is rendered directly, with no click-through.
// =====================================================================

describe('AgentCard — US1: what an agent is and what it can do, at a glance', () => {
  it("renders agent.name plus the existing is_active/can_use badges identically to AgentBrowser.tsx's current row markup", () => {
    const agent = makeAgent({ id: 'agent-active', name: 'Active Helper', is_active: true, can_use: true });

    render(<AgentCard agent={agent} />);

    const row = screen.getByTestId('agent-row-agent-active');
    expect(row.textContent ?? '').toMatch(/Active Helper/);
    expect(row.textContent ?? '').toMatch(/in.?service/i);
    expect(row.textContent ?? '').toMatch(/usable/i);
  });

  it('renders the retired/view-only badge wording for an inactive, view-only agent', () => {
    const agent = makeAgent({ id: 'agent-retired', name: 'Retired Helper', is_active: false, can_use: false });

    render(<AgentCard agent={agent} />);

    const row = screen.getByTestId('agent-row-agent-retired');
    expect(row.textContent ?? '').toMatch(/retired/i);
    expect(row.textContent ?? '').toMatch(/view.?only/i);
  });

  it('renders agent.purpose text directly on the card', () => {
    const agent = makeAgent({ purpose: 'Answers billing questions and issues refunds.' });

    render(<AgentCard agent={agent} />);

    expect(screen.getByTestId('agent-card-purpose').textContent ?? '').toMatch(
      /Answers billing questions and issues refunds\./,
    );
  });

  it('renders agent.capabilities as a badge per array entry', () => {
    const agent = makeAgent({ capabilities: ['memory_read', 'memory_search', 'web_search'] });

    render(<AgentCard agent={agent} />);

    const badges = screen.getAllByTestId('agent-card-capability');
    expect(badges).toHaveLength(3);
    const texts = badges.map((b) => b.textContent ?? '');
    expect(texts.some((t) => /memory_read/.test(t))).toBe(true);
    expect(texts.some((t) => /memory_search/.test(t))).toBe(true);
    expect(texts.some((t) => /web_search/.test(t))).toBe(true);
  });

  it('renders zero capability badges for an agent with no capabilities, without throwing', () => {
    const agent = makeAgent({ capabilities: [] });

    render(<AgentCard agent={agent} />);

    expect(screen.queryAllByTestId('agent-card-capability')).toHaveLength(0);
  });

  it('renders a distinct memory badge reflecting agent.memory_enabled true vs. false', () => {
    const { unmount } = render(<AgentCard agent={makeAgent({ id: 'agent-mem-on', memory_enabled: true })} />);
    const enabledBadge = screen.getByTestId('agent-card-memory-badge');
    expect(enabledBadge.textContent ?? '').toMatch(/memory/i);
    expect(enabledBadge.textContent ?? '').not.toMatch(/no memory|memory[^a-z]*(off|disabled|none)/i);
    unmount();

    render(<AgentCard agent={makeAgent({ id: 'agent-mem-off', memory_enabled: false })} />);
    const disabledBadge = screen.getByTestId('agent-card-memory-badge');
    expect(disabledBadge.textContent ?? '').toMatch(/memory/i);
    expect(disabledBadge.textContent ?? '').toMatch(/no memory|memory[^a-z]*(off|disabled|none)/i);
  });

  it('renders agent.operation_count with approximating wording, never a bare number', () => {
    const agent = makeAgent({ operation_count: 14 });

    render(<AgentCard agent={agent} />);

    const opText = screen.getByTestId('agent-card-operation-count').textContent ?? '';
    expect(opText).toMatch(/14/);
    expect(opText).toMatch(/operations?/i);
    // contracts/frontend-agent-cards.md §3's own "not more precise than it
    // is" rule — the figure must never be presented as a bare, exact count.
    expect(opText.trim()).not.toBe('14');
    expect(opText.trim()).not.toMatch(/^14\s*operations?$/i);
  });

  it('renders a zero operation count without being excluded or blank (Edge Case, quickstart step 10)', () => {
    const agent = makeAgent({ operation_count: 0 });

    render(<AgentCard agent={agent} />);

    const opText = screen.getByTestId('agent-card-operation-count').textContent ?? '';
    expect(opText).toMatch(/0/);
    expect(opText.trim()).not.toBe('');
  });

  it('renders agent.current_version_number', () => {
    const agent = makeAgent({ current_version_number: 3 });

    render(<AgentCard agent={agent} />);

    expect(screen.getByTestId('agent-card-version').textContent ?? '').toMatch(/v\s?3/i);
  });
});

// =====================================================================
// T013 — US2 (spec.md Acceptance Scenarios, FR-004..FR-008, SC-002/SC-005)
// extends this same file, sequenced after T012's own describe block, with
// the full range of `usage` shapes.
// =====================================================================

describe('AgentCard — US2: whether an agent is working well, at a glance', () => {
  it('renders a distinct "Not yet used" branch driven only by usage.has_run, even when other usage fields are inconsistent with never-run', () => {
    // Deliberately inconsistent fixture: has_run is false, but cost and
    // reliability carry non-zero/non-default values a naive implementation
    // might read instead of usage.has_run itself (mutation-checklist row 8's
    // own inverse guard, contracts/frontend-agent-cards.md §3).
    const agent = makeAgent({
      usage: {
        has_run: false,
        run_count: 5,
        reliability: makeReliability({
          invocation_count: 20,
          success_count: 18,
          failure_count: 2,
          no_activity: false,
        }),
        cost: makeCost({ request_count: 20, priced_cost_total: '4.20' }),
      },
    });

    render(<AgentCard agent={agent} />);

    expect(screen.getByTestId('agent-card-usage-status').textContent ?? '').toMatch(/not yet used/i);
  });

  it('renders run_count, reliability ratio, and priced_cost_total for a used agent with full activity', () => {
    const agent = makeAgent({
      usage: {
        has_run: true,
        run_count: 7,
        reliability: makeReliability({
          invocation_count: 20,
          success_count: 18,
          failure_count: 2,
          no_activity: false,
        }),
        cost: makeCost({ request_count: 20, priced_cost_total: '4.20' }),
      },
    });

    render(<AgentCard agent={agent} />);

    expect(screen.queryByTestId('agent-card-usage-status')?.textContent ?? '').not.toMatch(/not yet used/i);
    expect(screen.getByTestId('agent-card-run-count').textContent ?? '').toMatch(/7/);
    const reliabilityText = screen.getByTestId('agent-card-reliability').textContent ?? '';
    expect(reliabilityText).toMatch(/18/);
    expect(reliabilityText).toMatch(/2/);
    expect(screen.getByTestId('agent-card-cost').textContent ?? '').toMatch(/4\.20/);
  });

  it('renders a used-but-tool-quiet state distinctly from the never-run state when reliability.no_activity is true', () => {
    const usedQuiet = makeAgent({
      id: 'agent-used-quiet',
      usage: {
        has_run: true,
        run_count: 3,
        reliability: makeReliability({ invocation_count: 0, success_count: 0, failure_count: 0, no_activity: true }),
        cost: makeCost({ request_count: 3, priced_cost_total: '1.00' }),
      },
    });

    const { unmount } = render(<AgentCard agent={usedQuiet} />);
    const usedQuietStatus = screen.getByTestId('agent-card-usage-status').textContent ?? '';
    expect(usedQuietStatus).not.toMatch(/not yet used/i);
    unmount();

    const neverRun = makeAgent({ id: 'agent-never-run', usage: makeUsage({ has_run: false }) });
    render(<AgentCard agent={neverRun} />);
    const neverRunStatus = screen.getByTestId('agent-card-usage-status').textContent ?? '';
    expect(neverRunStatus).toMatch(/not yet used/i);

    // The two states must actually read differently from one another, not
    // just each individually pass its own assertion above.
    expect(usedQuietStatus.trim().toLowerCase()).not.toBe(neverRunStatus.trim().toLowerCase());
  });

  it('renders a "too little data yet" treatment instead of presenting the ratio at face value when reliability.low_sample is true', () => {
    const agent = makeAgent({
      usage: {
        has_run: true,
        run_count: 1,
        reliability: makeReliability({
          invocation_count: 2,
          success_count: 2,
          failure_count: 0,
          low_sample: true,
          no_activity: false,
        }),
        cost: makeCost({ request_count: 2 }),
      },
    });

    render(<AgentCard agent={agent} />);

    expect(screen.getByTestId('agent-card-reliability').textContent ?? '').toMatch(
      /too little data|not enough data|low sample/i,
    );
  });

  it('renders a visual marker on the cost figure when has_estimated_cost is true', () => {
    const agent = makeAgent({
      usage: {
        has_run: true,
        run_count: 2,
        reliability: makeReliability({ invocation_count: 2, success_count: 2, failure_count: 0, no_activity: false }),
        cost: makeCost({ request_count: 2, priced_cost_total: '0.50', has_estimated_cost: true }),
      },
    });

    render(<AgentCard agent={agent} />);

    expect(screen.getByTestId('agent-card-cost-estimated-marker')).toBeInTheDocument();
  });

  it('does not render an estimated-cost marker when has_estimated_cost is false', () => {
    const agent = makeAgent({
      usage: {
        has_run: true,
        run_count: 2,
        reliability: makeReliability({ invocation_count: 2, success_count: 2, failure_count: 0, no_activity: false }),
        cost: makeCost({ request_count: 2, priced_cost_total: '0.50', has_estimated_cost: false }),
      },
    });

    render(<AgentCard agent={agent} />);

    expect(screen.queryByTestId('agent-card-cost-estimated-marker')).not.toBeInTheDocument();
  });

  it('renders a run_count of 0 with has_run true as "has been used," never as "not yet used" (retention-aged-out case)', () => {
    const agent = makeAgent({
      usage: {
        has_run: true,
        run_count: 0,
        reliability: makeReliability({ invocation_count: 5, success_count: 5, failure_count: 0, no_activity: false }),
        cost: makeCost({ request_count: 5, priced_cost_total: '2.00' }),
      },
    });

    render(<AgentCard agent={agent} />);

    expect(screen.getByTestId('agent-card-usage-status').textContent ?? '').not.toMatch(/not yet used/i);
    expect(screen.getByTestId('agent-card-run-count').textContent ?? '').toMatch(/0/);
  });
});

// =====================================================================
// T021 (096-agent-sharing, US1), contracts/frontend-agent-sharing.md §4 —
// the "Shared by {name}" marking and the owner-only ManageSharingPanel slot
// this feature adds to AgentCard. Neither is implemented yet: the two
// positive-case tests below are expected to fail against the current
// component (no such element/child is ever rendered today); the two
// negative-case tests happen to already hold trivially (the component
// renders neither element for any fixture today) and are kept for symmetry
// with the eventual implementation's own four-way branch.
// =====================================================================

interface AgentShareOwnerFixture {
  id: string;
  name: string;
}

type AgentSharingFixtureFields = {
  is_shared: boolean;
  shared_by: AgentShareOwnerFixture | null;
  permission: 'owner' | 'use' | 'use_and_edit';
};

function makeSharedAgent(
  overrides: Partial<AgentCardFixture & AgentSharingFixtureFields> = {},
) {
  return {
    ...makeAgent(),
    is_shared: false,
    shared_by: null,
    permission: 'use' as const,
    ...overrides,
  };
}

describe('AgentCard — 096-agent-sharing US1: "Shared by" marking and owner-only sharing panel', () => {
  it('renders "Shared by {name}" when is_shared is true and shared_by names the owner', () => {
    const agent = makeSharedAgent({
      is_shared: true,
      shared_by: { id: 'owner-1', name: 'Alex Rivera' },
    });

    render(<AgentCard agent={agent as any} />);

    expect(screen.getByTestId('agent-card-shared-by').textContent ?? '').toMatch(/Shared by Alex Rivera/);
  });

  it('renders no "Shared by" element when is_shared is false', () => {
    const agent = makeSharedAgent({ is_shared: false, shared_by: null });

    render(<AgentCard agent={agent as any} />);

    expect(screen.queryByTestId('agent-card-shared-by')).not.toBeInTheDocument();
  });

  it('renders ManageSharingPanel when permission is owner', () => {
    const agent = makeSharedAgent({ permission: 'owner' });

    render(<AgentCard agent={agent as any} />);

    expect(screen.getByTestId('manage-sharing-panel-mock')).toBeInTheDocument();
  });

  it.each(['use', 'use_and_edit'] as const)('renders no ManageSharingPanel when permission is %s', (permission) => {
    const agent = makeSharedAgent({ permission });

    render(<AgentCard agent={agent as any} />);

    expect(screen.queryByTestId('manage-sharing-panel-mock')).not.toBeInTheDocument();
  });
});

// =====================================================================
// T020 (097-subagent-model), contracts/frontend-subagent-model.md §4 — the
// owner-only ManageHelpersPanel slot this feature adds to AgentCard,
// mirroring the ManageSharingPanel gate test above exactly.
// =====================================================================

describe('AgentCard — 097-subagent-model US1: owner-only helpers panel', () => {
  it('renders ManageHelpersPanel when permission is owner', () => {
    const agent = makeSharedAgent({ permission: 'owner' });

    render(<AgentCard agent={agent as any} />);

    expect(screen.getByTestId('manage-helpers-panel-mock')).toBeInTheDocument();
  });

  it.each(['use', 'use_and_edit'] as const)('renders no ManageHelpersPanel when permission is %s', (permission) => {
    const agent = makeSharedAgent({ permission });

    render(<AgentCard agent={agent as any} />);

    expect(screen.queryByTestId('manage-helpers-panel-mock')).not.toBeInTheDocument();
  });
});

// =====================================================================
// T051 (109-agent-as-capability), contracts/capability-offering-api.md —
// the owner-only ManageCapabilityOfferingsPanel slot this feature adds to
// AgentCard, mirroring the ManageSharingPanel/ManageHelpersPanel gate
// tests above exactly.
// =====================================================================

describe('AgentCard — 109-agent-as-capability US-shared: owner-only capability offerings panel', () => {
  it('renders ManageCapabilityOfferingsPanel when permission is owner', () => {
    const agent = makeSharedAgent({ permission: 'owner' });

    render(<AgentCard agent={agent as any} />);

    expect(screen.getByTestId('manage-capability-offerings-panel-mock')).toBeInTheDocument();
  });

  it.each(['use', 'use_and_edit'] as const)('renders no ManageCapabilityOfferingsPanel when permission is %s', (permission) => {
    const agent = makeSharedAgent({ permission });

    render(<AgentCard agent={agent as any} />);

    expect(screen.queryByTestId('manage-capability-offerings-panel-mock')).not.toBeInTheDocument();
  });
});
