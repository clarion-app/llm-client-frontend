import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { serverApi } from './serverApi';
import { serverStatusApi } from './serverStatusApi';
import { modelApi } from './modelApi';
import { ServerCard } from './ServerCard';
import { RoleAssignmentsType, ServerStatusType, ServerType } from './types';

vi.mock('.', () => ({
  backend: {
    url: 'http://localhost:8000',
    token: 'test-token',
    user: { id: 'user-1', name: 'Test User', email: 'test@test.com' },
  },
}));

let capturedRequests: any[] = [];

vi.mock('@clarion-app/frontend-base', () => ({
  createBackendConfig: () => ({
    backend: { url: 'http://localhost:8000', user: { id: '', name: '', email: '' } },
    updateFrontend: () => {},
  }),
  createBaseQuery: () => async (args: any) => {
    capturedRequests.push(args);
    return { data: {} };
  },
}));

function createTestStore() {
  return configureStore({
    reducer: {
      [serverApi.reducerPath]: serverApi.reducer,
      [serverStatusApi.reducerPath]: serverStatusApi.reducer,
      [modelApi.reducerPath]: modelApi.reducer,
    },
    middleware: (getDefault) =>
      getDefault().concat(serverApi.middleware, serverStatusApi.middleware, modelApi.middleware),
  });
}

function renderCard(
  server: ServerType,
  status: ServerStatusType | null,
  roleAssignments: RoleAssignmentsType | null = null,
) {
  const store = createTestStore();
  return render(
    <Provider store={store}>
      <ServerCard server={server} status={status} roleAssignments={roleAssignments} />
    </Provider>,
  );
}

function makeRoleDescriptor(
  role: 'inference' | 'embedding' | 'image',
  overrides: Partial<RoleAssignmentsType['inference']> = {},
): RoleAssignmentsType['inference'] {
  return {
    role,
    effective: { status: 'unassigned', scope: null, server: null, model: null, reason: null },
    user_assignment: null,
    installation_assignment: null,
    ...overrides,
  };
}

function makeServer(overrides: Partial<ServerType> = {}): ServerType {
  return {
    id: 'srv-1',
    name: 'Local Server',
    server_url: 'http://localhost:8080',
    provider_type: 'openai',
    ...overrides,
  } as ServerType;
}

function makeStatus(overrides: Partial<ServerStatusType> = {}): ServerStatusType {
  return {
    server_id: 'srv-1',
    connection_status: 'never_checked',
    in_flight: false,
    last_outcome: null,
    last_error: null,
    model_count: 0,
    triggered_by: null,
    last_refresh_at: null,
    ...overrides,
  };
}

describe('ServerCard', () => {
  beforeEach(() => {
    vi.restoreAllMocks?.();
    capturedRequests = [];
  });

  /* -----------------------------------------------------------------
   * FR-016: status badge distinguishes the four connection_status values
   * ----------------------------------------------------------------- */
  describe('status badge distinguishes connection_status values (FR-016)', () => {
    it.each([
      ['never_checked', 'Not Checked'],
      ['reachable', 'Connected'],
      ['unreachable', 'Unreachable'],
      ['auth_rejected', 'Auth Failed'],
    ] as const)('renders a distinct badge for %s', (connectionStatus, expectedLabel) => {
      renderCard(makeServer(), makeStatus({ connection_status: connectionStatus }));
      const badge = screen.getByTestId('status-badge');
      expect(badge.textContent).toBe(expectedLabel);
    });
  });

  /* -----------------------------------------------------------------
   * US3-2: auth_rejected renders an edit-token affordance
   * ----------------------------------------------------------------- */
  it('renders an edit-token affordance when auth_rejected (US3-2)', () => {
    renderCard(makeServer(), makeStatus({ connection_status: 'auth_rejected', last_outcome: 'auth_rejected' }));

    expect(screen.getByTestId('edit-token-button')).toBeInTheDocument();
  });

  it('does not render the edit-token affordance for a reachable server', () => {
    renderCard(makeServer(), makeStatus({ connection_status: 'reachable', last_outcome: 'models_updated', model_count: 3 }));

    expect(screen.queryByTestId('edit-token-button')).not.toBeInTheDocument();
  });

  /* -----------------------------------------------------------------
   * US3-1: unreachable renders that server's models as possibly stale,
   * not hidden.
   * ----------------------------------------------------------------- */
  it('marks existing models as possibly stale (not hidden) when unreachable (US3-1)', () => {
    renderCard(
      makeServer(),
      makeStatus({ connection_status: 'unreachable', last_outcome: 'unreachable', model_count: 5 }),
    );

    // Models are not hidden — the count is still shown.
    expect(screen.getByText(/5 models/)).toBeInTheDocument();
    // ...but flagged as possibly stale, since the server can't currently confirm them.
    expect(screen.getByTestId('stale-models-notice')).toBeInTheDocument();
  });

  /* -----------------------------------------------------------------
   * zero_models renders distinctly from never_checked and from a
   * failed fetch (http_error / unreachable).
   * ----------------------------------------------------------------- */
  it('renders zero_models distinctly from never_checked and from a failed fetch', () => {
    renderCard(
      makeServer(),
      makeStatus({ connection_status: 'reachable', last_outcome: 'zero_models', model_count: 0 }),
    );

    expect(screen.getByTestId('zero-models-notice')).toBeInTheDocument();
  });

  it('does not render the zero_models notice for a never_checked server', () => {
    renderCard(makeServer(), makeStatus({ connection_status: 'never_checked' }));

    expect(screen.queryByTestId('zero-models-notice')).not.toBeInTheDocument();
  });

  it('does not render the zero_models notice for a server with a failed fetch', () => {
    renderCard(
      makeServer(),
      makeStatus({ connection_status: 'unreachable', last_outcome: 'http_error', last_error: 'HTTP 404 Not Found' }),
    );

    expect(screen.queryByTestId('zero-models-notice')).not.toBeInTheDocument();
  });

  /* -----------------------------------------------------------------
   * FR-019a: http_error renders distinctly from unreachable, showing
   * the HTTP status the server returned.
   * ----------------------------------------------------------------- */
  it('shows the HTTP status from a http_error outcome, distinct from unreachable (FR-019a)', () => {
    renderCard(
      makeServer(),
      makeStatus({ connection_status: 'unreachable', last_outcome: 'http_error', last_error: 'HTTP 404 Not Found' }),
    );

    const detail = screen.getByTestId('http-error-detail');
    expect(detail.textContent).toContain('404');

    // Distinct from a plain "unreachable" (connection-refused) outcome, which
    // has no HTTP status to show.
    expect(screen.queryByTestId('http-error-detail')).not.toBeNull();
  });

  it('does not render an http-error-detail for a plain unreachable outcome', () => {
    renderCard(
      makeServer(),
      makeStatus({ connection_status: 'unreachable', last_outcome: 'unreachable' }),
    );

    expect(screen.queryByTestId('http-error-detail')).not.toBeInTheDocument();
  });

  /* -----------------------------------------------------------------
   * FR-026 / SC-008: in-flight beyond 60s renders "did not complete",
   * never an indefinite spinner.
   * ----------------------------------------------------------------- */
  it('renders a "did not complete" notice instead of an indefinite spinner past 60s (FR-026, SC-008)', () => {
    renderCard(
      makeServer(),
      makeStatus({
        connection_status: 'reachable',
        in_flight: false, // Server-computed: the 60s window has already elapsed.
        last_outcome: 'did_not_complete',
        refresh_started_at: new Date(Date.now() - 90_000).toISOString(),
      } as any),
    );

    expect(screen.getByTestId('did-not-complete-notice')).toBeInTheDocument();
    expect(screen.queryByTestId('in-flight-indicator')).not.toBeInTheDocument();
  });

  it('still shows the in-flight indicator, not the did-not-complete notice, while genuinely in flight', () => {
    renderCard(
      makeServer(),
      makeStatus({ connection_status: 'reachable', in_flight: true, last_outcome: null }),
    );

    expect(screen.getByTestId('in-flight-indicator')).toBeInTheDocument();
    expect(screen.queryByTestId('did-not-complete-notice')).not.toBeInTheDocument();
  });

  /* -----------------------------------------------------------------
   * Edge case: very long server names/addresses wrap or scroll without
   * breaking the card layout; the address stays readable.
   * ----------------------------------------------------------------- */
  it('wraps very long server names and addresses instead of overflowing the card', () => {
    const longName = 'A'.repeat(120) + ' Production Inference Cluster';
    const longUrl = 'https://' + 'very-long-subdomain-segment-'.repeat(10) + 'example.com:8443/v1';

    renderCard(
      makeServer({ name: longName, server_url: longUrl }),
      makeStatus({ connection_status: 'reachable', last_outcome: 'models_updated', model_count: 2 }),
    );

    const nameEl = screen.getByText(longName);
    const urlEl = screen.getByText(new RegExp(longUrl.slice(0, 40)));

    // The address must remain fully present in the DOM (readable) and the
    // card must adopt a wrapping strategy rather than clipping/overflowing.
    expect(urlEl.textContent).toContain(longUrl);
    expect(nameEl).toHaveStyle({ overflowWrap: 'anywhere' });
    expect(urlEl).toHaveStyle({ overflowWrap: 'anywhere' });
  });

  /* -----------------------------------------------------------------
   * FR-020, SC-005, US4-3: deleting a server confirms first, and names
   * the roles the deletion would break, computed on the frontend from
   * GET /role-assignment (research.md D13).
   * ----------------------------------------------------------------- */
  describe('delete confirmation (FR-020, SC-005)', () => {
    it('opens ConfirmDialog on delete and deletes nothing yet', () => {
      renderCard(makeServer(), makeStatus());

      fireEvent.click(screen.getByTestId('delete-button'));

      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
      expect(capturedRequests.some((r) => typeof r === 'object' && r.method === 'DELETE')).toBe(false);
    });

    it('deletes nothing when the confirmation is cancelled', async () => {
      renderCard(makeServer(), makeStatus());

      fireEvent.click(screen.getByTestId('delete-button'));
      fireEvent.click(within(screen.getByTestId('confirm-dialog')).getByText(/cancel/i));

      await waitFor(() => {
        expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument();
      });
      expect(capturedRequests.some((r) => typeof r === 'object' && r.method === 'DELETE')).toBe(false);
    });

    it('issues DELETE /server/{id} only after explicit confirmation', async () => {
      renderCard(makeServer({ id: 'srv-1' }), makeStatus());

      fireEvent.click(screen.getByTestId('delete-button'));
      const dialog = screen.getByTestId('confirm-dialog');
      fireEvent.click(within(dialog).getByRole('button', { name: /delete/i }));

      await waitFor(() => {
        const del = capturedRequests.find(
          (r) => typeof r === 'object' && r.method === 'DELETE' && r.url === '/server/srv-1',
        );
        expect(del).toBeDefined();
      });
    });

    it('names the single role the deletion would break', () => {
      const roleAssignments: RoleAssignmentsType = {
        inference: makeRoleDescriptor('inference', {
          effective: {
            status: 'resolved',
            scope: 'user',
            server: { id: 'srv-1', name: 'Local Server' },
            model: 'gpt-4',
            reason: null,
          },
          user_assignment: { server_id: 'srv-1', model: 'gpt-4' },
        }),
        embedding: makeRoleDescriptor('embedding'),
        image: makeRoleDescriptor('image'),
      };

      renderCard(makeServer({ id: 'srv-1' }), makeStatus(), roleAssignments);
      fireEvent.click(screen.getByTestId('delete-button'));

      const dialog = screen.getByTestId('confirm-dialog');
      expect(dialog.textContent).toMatch(/inference/i);
      expect(dialog.textContent).not.toMatch(/embedding/i);
    });

    it('names every role the deletion would break when more than one is affected', () => {
      const roleAssignments: RoleAssignmentsType = {
        inference: makeRoleDescriptor('inference', {
          effective: {
            status: 'resolved',
            scope: 'installation',
            server: { id: 'srv-1', name: 'Local Server' },
            model: 'gpt-4',
            reason: null,
          },
          installation_assignment: { server_id: 'srv-1', model: 'gpt-4' },
        }),
        embedding: makeRoleDescriptor('embedding', {
          effective: {
            status: 'resolved',
            scope: 'user',
            server: { id: 'srv-1', name: 'Local Server' },
            model: 'embed-1',
            reason: null,
          },
          user_assignment: { server_id: 'srv-1', model: 'embed-1' },
        }),
        image: makeRoleDescriptor('image'),
      };

      renderCard(makeServer({ id: 'srv-1' }), makeStatus(), roleAssignments);
      fireEvent.click(screen.getByTestId('delete-button'));

      const dialog = screen.getByTestId('confirm-dialog');
      expect(dialog.textContent).toMatch(/inference/i);
      expect(dialog.textContent).toMatch(/embedding/i);
    });

    it('detects a role broken via its installation default even when a different server is currently effective', () => {
      // This server holds the installation fallback for embedding, but a
      // personal override on another server is what's actually in effect
      // right now. Deleting srv-1 still breaks the installation default.
      const roleAssignments: RoleAssignmentsType = {
        inference: makeRoleDescriptor('inference'),
        embedding: makeRoleDescriptor('embedding', {
          effective: {
            status: 'resolved',
            scope: 'user',
            server: { id: 'srv-2', name: 'Other Server' },
            model: 'embed-2',
            reason: null,
          },
          user_assignment: { server_id: 'srv-2', model: 'embed-2' },
          installation_assignment: { server_id: 'srv-1', model: 'embed-1' },
        }),
        image: makeRoleDescriptor('image'),
      };

      renderCard(makeServer({ id: 'srv-1' }), makeStatus(), roleAssignments);
      fireEvent.click(screen.getByTestId('delete-button'));

      expect(screen.getByTestId('confirm-dialog').textContent).toMatch(/embedding/i);
    });

    it('scopes the wording to "your" setup and the installation defaults, never claiming to be exhaustive about other users', () => {
      const roleAssignments: RoleAssignmentsType = {
        inference: makeRoleDescriptor('inference', {
          effective: {
            status: 'resolved',
            scope: 'user',
            server: { id: 'srv-1', name: 'Local Server' },
            model: 'gpt-4',
            reason: null,
          },
          user_assignment: { server_id: 'srv-1', model: 'gpt-4' },
        }),
        embedding: makeRoleDescriptor('embedding'),
        image: makeRoleDescriptor('image'),
      };

      renderCard(makeServer({ id: 'srv-1' }), makeStatus(), roleAssignments);
      fireEvent.click(screen.getByTestId('delete-button'));

      const dialog = screen.getByTestId('confirm-dialog');
      // Scoped to what the frontend actually knows: this user's assignment
      // and the installation default — never a blanket claim about every
      // other user's personal role assignment.
      expect(dialog.textContent).toMatch(/your/i);
      expect(dialog.textContent).not.toMatch(/every user|all users['’] personal|other users['’] personal/i);
    });

    it('shows no role-consequence claim when nothing depends on this server', () => {
      const roleAssignments: RoleAssignmentsType = {
        inference: makeRoleDescriptor('inference'),
        embedding: makeRoleDescriptor('embedding'),
        image: makeRoleDescriptor('image'),
      };

      renderCard(makeServer({ id: 'srv-1' }), makeStatus(), roleAssignments);
      fireEvent.click(screen.getByTestId('delete-button'));

      const dialog = screen.getByTestId('confirm-dialog');
      expect(dialog.textContent).not.toMatch(/inference|embedding|image/i);
    });

    it('renders the delete button and its dialog without role-assignment data present (roleAssignments null)', () => {
      renderCard(makeServer({ id: 'srv-1' }), makeStatus(), null);

      fireEvent.click(screen.getByTestId('delete-button'));

      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    });
  });
});
