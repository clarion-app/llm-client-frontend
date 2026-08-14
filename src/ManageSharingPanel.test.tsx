import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

/**
 * 096-agent-sharing, contracts/frontend-agent-sharing.md §4 — neither
 * `./ManageSharingPanel` nor `./agentShareApi` exists yet (both are later
 * implementation tasks, out of this task's own scope). This file mocks
 * `./agentShareApi`'s exported hooks directly, rather than mocking the HTTP
 * layer (`@clarion-app/frontend-base`'s `createBaseQuery`) and rendering
 * against a real Redux store — this package's usual convention for an
 * already-existing slice (see AgentBrowser.route.test.tsx) — because the
 * real slice module does not exist yet for a real store to be built
 * against. The `./ManageSharingPanel` import below is expected to fail
 * module resolution at collection time; that failure (or, depending on how
 * `vi.mock` resolves a relative specifier with no backing file, a failure
 * resolving `./agentShareApi` itself) is this file's own RED signal.
 *
 * Conventions assumed below (none are pinned by the design docs beyond
 * `agentId` as the prop and the four `agentShareApi` hooks named in
 * contracts §2 — everything else is this test's own contract for the
 * eventual implementation):
 *   - root container:          data-testid="manage-sharing-panel"
 *   - collapsed/expand toggle: data-testid="manage-sharing-toggle"
 *   - expanded content:        data-testid="manage-sharing-content"
 *   - a grant row:             data-testid={`agent-share-row-${recipient_user_id}`}
 *   - recipient picker:        data-testid="share-recipient-select"
 *   - permission picker:       data-testid="share-permission-select"
 *   - grant submit button:     data-testid="share-submit"
 *   - inline validation error (422, e.g. self-share/invalid permission):
 *                              data-testid="manage-sharing-form-error"
 *   - distinct "agent no longer owned" error (404 on the shares list):
 *                              data-testid="manage-sharing-not-owned-error"
 */

vi.mock('./agentShareApi', () => ({
  useListSharesQuery: vi.fn(),
  useListInstallationUsersQuery: vi.fn(),
  useCreateShareMutation: vi.fn(),
  useRevokeShareMutation: vi.fn(),
}));

const agentShareApiMocks = await import('./agentShareApi');
const { ManageSharingPanel } = await import('./ManageSharingPanel');

const useListSharesQuery = agentShareApiMocks.useListSharesQuery as unknown as ReturnType<typeof vi.fn>;
const useListInstallationUsersQuery = agentShareApiMocks.useListInstallationUsersQuery as unknown as ReturnType<typeof vi.fn>;
const useCreateShareMutation = agentShareApiMocks.useCreateShareMutation as unknown as ReturnType<typeof vi.fn>;
const useRevokeShareMutation = agentShareApiMocks.useRevokeShareMutation as unknown as ReturnType<typeof vi.fn>;

function makeShare(overrides: Record<string, any> = {}) {
  return {
    id: 'share-1',
    agent_id: 'agent-1',
    recipient_user_id: 'user-2',
    recipient_name: 'Jamie Lee',
    permission: 'use',
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    ...overrides,
  };
}

function makeInstallationUser(overrides: Record<string, any> = {}) {
  return {
    id: 'user-3',
    name: 'Morgan Blue',
    email: 'morgan@example.com',
    ...overrides,
  };
}

let createShareTrigger: ReturnType<typeof vi.fn>;

beforeEach(() => {
  useListSharesQuery.mockReset();
  useListInstallationUsersQuery.mockReset();
  useCreateShareMutation.mockReset();
  useRevokeShareMutation.mockReset();

  useListSharesQuery.mockReturnValue({
    data: { data: [] },
    isLoading: false,
    isError: false,
    error: undefined,
  });
  useListInstallationUsersQuery.mockReturnValue({
    data: [makeInstallationUser()],
    isLoading: false,
    isError: false,
  });

  createShareTrigger = vi.fn(() => ({ unwrap: () => Promise.resolve(makeShare()) }));
  useCreateShareMutation.mockReturnValue([createShareTrigger, { isLoading: false }]);

  useRevokeShareMutation.mockReturnValue([
    vi.fn(() => ({ unwrap: () => Promise.resolve() })),
    { isLoading: false },
  ]);
});

function expand() {
  fireEvent.click(screen.getByTestId('manage-sharing-toggle'));
}

describe('ManageSharingPanel — collapse/expand', () => {
  it('is collapsed by default and expands when the toggle is clicked', () => {
    render(<ManageSharingPanel agentId="agent-1" />);

    expect(screen.getByTestId('manage-sharing-toggle')).toBeInTheDocument();
    expect(screen.queryByTestId('manage-sharing-content')).not.toBeInTheDocument();

    expand();

    expect(screen.getByTestId('manage-sharing-content')).toBeInTheDocument();
  });
});

describe('ManageSharingPanel — current grants', () => {
  it("calls useListSharesQuery for this agent once expanded and renders each grant's recipient name and permission", () => {
    useListSharesQuery.mockReturnValue({
      data: {
        data: [
          makeShare({ recipient_user_id: 'user-2', recipient_name: 'Jamie Lee', permission: 'use' }),
          makeShare({
            id: 'share-2',
            recipient_user_id: 'user-4',
            recipient_name: 'Taylor Fox',
            permission: 'use_and_edit',
          }),
        ],
      },
      isLoading: false,
      isError: false,
      error: undefined,
    });

    render(<ManageSharingPanel agentId="agent-1" />);
    expand();

    expect(useListSharesQuery).toHaveBeenCalledWith(expect.objectContaining({ agentId: 'agent-1' }));

    const jamieRow = screen.getByTestId('agent-share-row-user-2');
    expect(jamieRow.textContent ?? '').toMatch(/Jamie Lee/);
    expect(jamieRow.textContent ?? '').toMatch(/\buse\b/i);

    const taylorRow = screen.getByTestId('agent-share-row-user-4');
    expect(taylorRow.textContent ?? '').toMatch(/Taylor Fox/);
    expect(taylorRow.textContent ?? '').toMatch(/use.?and.?edit/i);
  });
});

describe('ManageSharingPanel — grant form', () => {
  it('lists installation users from useListInstallationUsersQuery in the recipient picker and calls useCreateShareMutation on submit', async () => {
    useListInstallationUsersQuery.mockReturnValue({
      data: [makeInstallationUser({ id: 'user-5', name: 'Robin Chen' })],
      isLoading: false,
      isError: false,
    });

    render(<ManageSharingPanel agentId="agent-1" />);
    expand();

    expect(useListInstallationUsersQuery).toHaveBeenCalled();

    const recipientSelect = screen.getByTestId('share-recipient-select');
    expect(recipientSelect.textContent ?? '').toMatch(/Robin Chen/);

    fireEvent.change(recipientSelect, { target: { value: 'user-5' } });
    fireEvent.change(screen.getByTestId('share-permission-select'), { target: { value: 'use_and_edit' } });
    fireEvent.click(screen.getByTestId('share-submit'));

    await waitFor(() => {
      expect(createShareTrigger).toHaveBeenCalledWith(
        expect.objectContaining({ agentId: 'agent-1', recipientUserId: 'user-5', permission: 'use_and_edit' }),
      );
    });
  });

  it('renders an inline error, not a thrown exception, when the create mutation rejects with a 422 (self-share/invalid permission)', async () => {
    createShareTrigger = vi.fn(() => ({
      unwrap: () =>
        Promise.reject({
          status: 422,
          data: { error: 'Cannot share an agent with yourself', code: 'validation_error' },
        }),
    }));
    useCreateShareMutation.mockReturnValue([createShareTrigger, { isLoading: false }]);

    render(<ManageSharingPanel agentId="agent-1" />);
    expand();
    fireEvent.click(screen.getByTestId('share-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('manage-sharing-form-error')).toBeInTheDocument();
    });
    expect(screen.queryByTestId('manage-sharing-not-owned-error')).not.toBeInTheDocument();
  });
});

describe('ManageSharingPanel — agent no longer owned', () => {
  it('renders a distinct error state, not the form-validation error, when listing shares 404s', () => {
    useListSharesQuery.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      error: { status: 404, data: { error: 'Agent not found', code: 'agent_not_found' } },
    });

    render(<ManageSharingPanel agentId="agent-1" />);
    expand();

    expect(screen.getByTestId('manage-sharing-not-owned-error')).toBeInTheDocument();
    expect(screen.queryByTestId('manage-sharing-form-error')).not.toBeInTheDocument();
  });
});
