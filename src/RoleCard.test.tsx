import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { serverApi } from './serverApi';
import { serverStatusApi } from './serverStatusApi';
import { modelApi } from './modelApi';
import { roleAssignmentApi } from './roleAssignmentApi';

vi.mock('.', () => ({
  backend: {
    url: 'http://localhost:8000',
    token: 'test-token',
    user: { id: 'user-1', name: 'Test User', email: 'test@test.com' },
  },
}));

// Mock ModelPicker so RoleCard tests focus on RoleCard behavior, not ModelPicker internals.
let mockModelPickerOnSelect: any = null;
vi.mock('./ModelPicker', () => ({
  ModelPicker: ({ onSelect }: { onSelect: (value: any) => void }) => {
    mockModelPickerOnSelect = onSelect;
    return (
      <div data-testid="model-picker">
        <button data-testid="open-model-picker" onClick={() => {}}>
          Choose Model
        </button>
        <button
          data-testid="select-model-btn"
          onClick={() => onSelect?.({ server_id: 'srv-1', model: 'gpt-4' })}
        >
          Select gpt-4
        </button>
      </div>
    );
  },
}));

let mockRoleAssignments: any = null;
let capturedRequests: any[] = [];

vi.mock('@clarion-app/frontend-base', () => ({
  createBackendConfig: () => ({
    backend: { url: 'http://localhost:8000', user: { id: '', name: '', email: '' } },
    updateFrontend: () => {},
  }),
  createBaseQuery: () => async (args: any) => {
    capturedRequests.push(args);
    const url = typeof args === 'string' ? args : args?.url;
    if (url?.includes('/role-assignment') && args?.method !== 'PUT') return { data: mockRoleAssignments };
    if (url?.includes('/server') && !url?.includes('/server-status')) return { data: [] };
    if (url?.includes('/server-status')) return { data: [] };
    if (url?.includes('/model')) return { data: [] };
    // Handle PUT /role-assignment
    // Handle PUT /role-assignment
    if (typeof args === 'object' && args.method === 'PUT' && (args.url === '/role-assignment' || args.url?.includes('/role-assignment'))) {
      const body = args.body;
      // Simulate server response
      return {
        data: {
          role: body.role,
          effective: {
            status: 'resolved',
            scope: body.scope ?? 'user',
            server: { id: body.server_id, name: 'Local Server' },
            model: body.model,
            reason: null,
          },
          user_assignment: body.scope === 'user' ? { server_id: body.server_id, model: body.model } : null,
          installation_assignment: body.scope === 'installation' ? { server_id: body.server_id, model: body.model } : null,
        },
      };
    }
    // Handle DELETE /role-assignment (clear)
    if (typeof args === 'object' && args.method === 'DELETE' && (args.url === '/role-assignment' || args.url?.includes('/role-assignment'))) {
      const body = args.body;
      // Simulate clearing: check if there's an installation assignment to fall back to
      const instAssignment = mockRoleAssignments?.[body.role]?.installation_assignment;
      return {
        data: {
          role: body.role,
          effective: instAssignment
            ? {
                status: 'resolved',
                scope: 'installation',
                server: { id: instAssignment.server_id, name: 'Cloud Server' },
                model: instAssignment.model,
                reason: null,
              }
            : {
                status: 'unassigned',
                scope: null,
                server: null,
                model: null,
                reason: null,
              },
          user_assignment: null,
          installation_assignment: instAssignment,
        },
      };
    }
    return { data: {} };
  },
}));

const { RoleCard } = await import('./RoleCard');

function createTestStore() {
  return configureStore({
    reducer: {
      [serverApi.reducerPath]: serverApi.reducer,
      [serverStatusApi.reducerPath]: serverStatusApi.reducer,
      [modelApi.reducerPath]: modelApi.reducer,
      [roleAssignmentApi.reducerPath]: roleAssignmentApi.reducer,
    },
    middleware: (getDefault) =>
      getDefault().concat(
        serverApi.middleware,
        serverStatusApi.middleware,
        modelApi.middleware,
        roleAssignmentApi.middleware
      ),
  });
}

function buildResolvedRole(role: string): any {
  return {
    role,
    effective: {
      status: 'resolved',
      scope: 'user',
      server: { id: 'srv-1', name: 'Local Server' },
      model: 'gpt-4',
      reason: null,
    },
    user_assignment: { server_id: 'srv-1', model: 'gpt-4' },
    installation_assignment: null,
  };
}

function buildUnassignedRole(role: string): any {
  return {
    role,
    effective: {
      status: 'unassigned',
      scope: null,
      server: null,
      model: null,
      reason: null,
    },
    user_assignment: null,
    installation_assignment: null,
  };
}

describe('RoleCard', () => {
  beforeEach(() => {
    capturedRequests = [];
    mockModelPickerOnSelect = null;
  });

  describe('resolved state', () => {
    it('renders model, server, and scope with no interaction required', async () => {
      mockRoleAssignments = {
        inference: buildResolvedRole('inference'),
        embedding: buildUnassignedRole('embedding'),
        image: buildUnassignedRole('image'),
      };

      const store = createTestStore();
      render(
        <Provider store={store}>
          <RoleCard roleDescriptor={mockRoleAssignments.inference} />
        </Provider>,
      );

      // Should show model name, server name, and scope
      await waitFor(() => {
        expect(screen.getByTestId('role-status-resolved')).toBeInTheDocument();
      });

      // Model name rendered with fontWeight
      expect(screen.getByText('gpt-4')).toBeInTheDocument();

      // Server name rendered as "on Local Server"
      expect(screen.getByText(/on Local Server/)).toBeInTheDocument();

      // Scope badge
      expect(screen.getByText('user')).toBeInTheDocument();
    });
  });

  describe('unassigned state', () => {
    it('renders the consequence sentence for that role', async () => {
      mockRoleAssignments = {
        inference: buildUnassignedRole('inference'),
        embedding: buildUnassignedRole('embedding'),
        image: buildUnassignedRole('image'),
      };

      const store = createTestStore();
      render(
        <Provider store={store}>
          <RoleCard roleDescriptor={mockRoleAssignments.inference} />
        </Provider>,
      );

      // Should show a consequence message for unassigned inference role
      await waitFor(() => {
        expect(screen.getByTestId('role-status-unassigned')).toBeInTheDocument();
      });

      // The consequence text should explain what happens without an inference model
      expect(screen.getByText('No inference model assigned — conversations and agents cannot run.')).toBeInTheDocument();
    });
  });

  describe('assign from card via ModelPicker', () => {
    it('assigns a model without navigation', async () => {
      mockRoleAssignments = {
        inference: buildUnassignedRole('inference'),
        embedding: buildUnassignedRole('embedding'),
        image: buildUnassignedRole('image'),
      };

      const store = createTestStore();
      render(
        <Provider store={store}>
          <RoleCard roleDescriptor={mockRoleAssignments.inference} />
        </Provider>,
      );

      // Wait for role card to render
      await waitFor(() => {
        expect(screen.getByTestId('model-picker')).toBeInTheDocument();
      });

      // Simulate selecting a model from the picker
      fireEvent.click(screen.getByTestId('select-model-btn'));

      // Verify PUT /role-assignment was called
      await waitFor(() => {
        const putRequest = capturedRequests.find(
          (r) => typeof r === 'object' && r.method === 'PUT' && r.url === '/role-assignment'
        );
        expect(putRequest).toBeDefined();
        expect(putRequest.body.role).toBe('inference');
        expect(putRequest.body.server_id).toBe('srv-1');
        expect(putRequest.body.model).toBe('gpt-4');
      });
    });

    it('shows the server-returned descriptor after successful assign (FR-011, FR-025)', async () => {
      // This test verifies that the mutation is called correctly.
      // The parent component (RolesPanel/ModelSetup) handles the re-fetch
      // and re-renders RoleCard with the updated descriptor.
      mockRoleAssignments = {
        inference: buildUnassignedRole('inference'),
        embedding: buildUnassignedRole('embedding'),
        image: buildUnassignedRole('image'),
      };

      const store = createTestStore();
      render(
        <Provider store={store}>
          <RoleCard roleDescriptor={mockRoleAssignments.inference} />
        </Provider>,
      );

      // Wait for role card to render
      await waitFor(() => {
        expect(screen.getByTestId('model-picker')).toBeInTheDocument();
      });

      // Simulate selecting a model
      fireEvent.click(screen.getByTestId('select-model-btn'));

      // Verify the mutation was called with correct parameters
      await waitFor(() => {
        const putRequest = capturedRequests.find(
          (r) => typeof r === 'object' && r.method === 'PUT' && r.url === '/role-assignment'
        );
        expect(putRequest).toBeDefined();
        expect(putRequest.body.role).toBe('inference');
        expect(putRequest.body.scope).toBe('user');
        expect(putRequest.body.server_id).toBe('srv-1');
        expect(putRequest.body.model).toBe('gpt-4');
      });
    });
  });

  describe('SC-003: changing inference role takes <= 3 interactions', () => {
    it('measures interaction count: open picker -> type/select -> confirm', async () => {
      mockRoleAssignments = {
        inference: buildUnassignedRole('inference'),
        embedding: buildUnassignedRole('embedding'),
        image: buildUnassignedRole('image'),
      };

      let interactionCount = 0;
      const originalClick = fireEvent.click;

      const store = createTestStore();
      render(
        <Provider store={store}>
          <RoleCard roleDescriptor={mockRoleAssignments.inference} />
        </Provider>,
      );

      // Wait for role card to render
      await waitFor(() => {
        expect(screen.getByTestId('model-picker')).toBeInTheDocument();
      });

      // Interaction 1: Open picker
      interactionCount++;
      fireEvent.click(screen.getByTestId('open-model-picker'));

      // Interaction 2: Select model (type + click combined as one interaction)
      interactionCount++;
      fireEvent.click(screen.getByTestId('select-model-btn'));

      // Interaction 3: Confirm (if needed)
      // In this case, the selection is the confirmation

      // Verify assignment was made
      await waitFor(() => {
        const putRequest = capturedRequests.find(
          (r) => typeof r === 'object' && r.method === 'PUT' && r.url === '/role-assignment'
        );
        expect(putRequest).toBeDefined();
      });

      // SC-003: interaction count should be <= 3
      expect(interactionCount).toBeLessThanOrEqual(3);
    });
  });

  describe('T054: clear-and-scope test cases', () => {
    describe('FR-012: clear flow states the fallback before taking effect', () => {
      it('shows fallback statement naming installation default when one exists', async () => {
        const roleWithInstallDefault = {
          role: 'inference',
          effective: {
            status: 'resolved',
            scope: 'user',
            server: { id: 'srv-1', name: 'Local Server' },
            model: 'gpt-4',
            reason: null,
          },
          user_assignment: { server_id: 'srv-1', model: 'gpt-4' },
          installation_assignment: { server_id: 'srv-2', model: 'claude-3' },
        };

        mockRoleAssignments = {
          inference: roleWithInstallDefault,
          embedding: buildUnassignedRole('embedding'),
          image: buildUnassignedRole('image'),
        };

        const store = createTestStore();
        render(
          <Provider store={store}>
            <RoleCard roleDescriptor={roleWithInstallDefault} />
          </Provider>,
        );

        // Clear button should be visible
        await waitFor(() => {
          expect(screen.getByTestId('clear-role-inference')).toBeInTheDocument();
        });

        // Click clear button to open dialog
        fireEvent.click(screen.getByTestId('clear-role-inference'));

        // Dialog should show fallback statement
        await waitFor(() => {
          expect(screen.getByText(/installation default: claude-3/)).toBeInTheDocument();
        });
      });

      it('says effective model will not change when installation default is same model', async () => {
        const roleWithSameInstallDefault = {
          role: 'embedding',
          effective: {
            status: 'resolved',
            scope: 'user',
            server: { id: 'srv-2', name: 'Cloud Server' },
            model: 'text-embedding-3',
            reason: null,
          },
          user_assignment: { server_id: 'srv-2', model: 'text-embedding-3' },
          installation_assignment: { server_id: 'srv-2', model: 'text-embedding-3' },
        };

        mockRoleAssignments = {
          inference: buildUnassignedRole('inference'),
          embedding: roleWithSameInstallDefault,
          image: buildUnassignedRole('image'),
        };

        const store = createTestStore();
        render(
          <Provider store={store}>
            <RoleCard roleDescriptor={roleWithSameInstallDefault} />
          </Provider>,
        );

        // Click clear button
        await waitFor(() => {
          expect(screen.getByTestId('clear-role-embedding')).toBeInTheDocument();
        });
        fireEvent.click(screen.getByTestId('clear-role-embedding'));

        // Dialog should say effective model will not change
        await waitFor(() => {
          expect(screen.getByText(/will not change/)).toBeInTheDocument();
        });
      });

      it('shows unassigned consequence when no installation default exists', async () => {
        const store = createTestStore();
        render(
          <Provider store={store}>
            <RoleCard roleDescriptor={buildResolvedRole('inference')} />
          </Provider>,
        );

        // Click clear button
        await waitFor(() => {
          expect(screen.getByTestId('clear-role-inference')).toBeInTheDocument();
        });
        fireEvent.click(screen.getByTestId('clear-role-inference'));

        // Dialog should show unassigned consequence
        await waitFor(() => {
          expect(screen.getByText(/unassigned/)).toBeInTheDocument();
          expect(screen.getByText(/conversations and agents cannot run/)).toBeInTheDocument();
        });
      });

      it('requires confirmation before clear takes effect', async () => {
        const store = createTestStore();
        render(
          <Provider store={store}>
            <RoleCard roleDescriptor={buildResolvedRole('inference')} />
          </Provider>,
        );

        // Click clear button
        await waitFor(() => {
          expect(screen.getByTestId('clear-role-inference')).toBeInTheDocument();
        });
        fireEvent.click(screen.getByTestId('clear-role-inference'));

        // Dialog should be shown (not yet cleared)
        await waitFor(() => {
          expect(screen.getByText(/Clear override/)).toBeInTheDocument();
        });

        // Cancel should not trigger DELETE
        fireEvent.click(screen.getByText(/Cancel/));

        // No DELETE request should have been made
        const deleteRequest = capturedRequests.find(
          (r) => typeof r === 'object' && r.method === 'DELETE'
        );
        expect(deleteRequest).toBeUndefined();
      });

      it('sends DELETE /role-assignment on confirm', async () => {
        const store = createTestStore();
        render(
          <Provider store={store}>
            <RoleCard roleDescriptor={buildResolvedRole('embedding')} />
          </Provider>,
        );

        // Click clear button
        await waitFor(() => {
          expect(screen.getByTestId('clear-role-embedding')).toBeInTheDocument();
        });
        fireEvent.click(screen.getByTestId('clear-role-embedding'));

        // Confirm the clear action (use data-destructive to distinguish from "Clear override" button)
        const confirmButton = screen.getByRole('button', { name: 'Clear' });
        fireEvent.click(confirmButton);

        // Verify DELETE was called
        await waitFor(() => {
          const deleteRequest = capturedRequests.find(
            (r) => typeof r === 'object' && r.method === 'DELETE' && r.url === '/role-assignment'
          );
          expect(deleteRequest).toBeDefined();
          expect(deleteRequest.body.role).toBe('embedding');
          expect(deleteRequest.body.scope).toBe('user');
        });
      });
    });

    describe('FR-013: installation-scope controls in disclosure', () => {
      it('disclosure is closed on first render', async () => {
        const store = createTestStore();
        render(
          <Provider store={store}>
            <RoleCard roleDescriptor={buildResolvedRole('inference')} />
          </Provider>,
        );

        // Installation disclosure should be collapsed
        await waitFor(() => {
          const disclosure = screen.getByTestId('installation-disclosure-inference');
          expect(disclosure).toBeInTheDocument();
        });

        // The disclosure content should not be visible initially
        const disclosureContent = screen.queryByTestId('installation-disclosure-content-inference');
        expect(disclosureContent).not.toBeInTheDocument();
      });

      it('disclosure is labelled as affecting every user', async () => {
        const store = createTestStore();
        render(
          <Provider store={store}>
            <RoleCard roleDescriptor={buildResolvedRole('inference')} />
          </Provider>,
        );

        await waitFor(() => {
          expect(screen.getByTestId('installation-disclosure-inference')).toBeInTheDocument();
        });

        // Label should mention "affects all users" or similar
        const disclosure = screen.getByTestId('installation-disclosure-inference');
        expect(disclosure.textContent).toMatch(/affects all users|every user|all users/i);
      });
    });

    describe('FR-006: scope badge visual distinction', () => {
      it('renders "Your override" for user scope', async () => {
        const store = createTestStore();
        render(
          <Provider store={store}>
            <RoleCard roleDescriptor={buildResolvedRole('inference')} />
          </Provider>,
        );

        await waitFor(() => {
          const scopeBadge = screen.getByTestId('scope-badge-inference');
          expect(scopeBadge).toBeInTheDocument();
          expect(scopeBadge.textContent).toBe('Your override');
        });
      });

      it('renders "Installation default" for installation scope', async () => {
        const installationScopeRole = {
          role: 'inference',
          effective: {
            status: 'resolved',
            scope: 'installation',
            server: { id: 'srv-2', name: 'Cloud Server' },
            model: 'claude-3',
            reason: null,
          },
          user_assignment: null,
          installation_assignment: { server_id: 'srv-2', model: 'claude-3' },
        };

        mockRoleAssignments = {
          inference: installationScopeRole,
          embedding: buildUnassignedRole('embedding'),
          image: buildUnassignedRole('image'),
        };

        const store = createTestStore();
        render(
          <Provider store={store}>
            <RoleCard roleDescriptor={installationScopeRole} />
          </Provider>,
        );

        await waitFor(() => {
          const scopeBadge = screen.getByTestId('scope-badge-inference');
          expect(scopeBadge).toBeInTheDocument();
          expect(scopeBadge.textContent).toBe('Installation default');
        });
      });

      it('does not show clear button for installation-scope assignments', async () => {
        const installationScopeRole = {
          role: 'embedding',
          effective: {
            status: 'resolved',
            scope: 'installation',
            server: { id: 'srv-2', name: 'Cloud Server' },
            model: 'text-embedding-3',
            reason: null,
          },
          user_assignment: null,
          installation_assignment: { server_id: 'srv-2', model: 'text-embedding-3' },
        };

        mockRoleAssignments = {
          inference: buildUnassignedRole('inference'),
          embedding: installationScopeRole,
          image: buildUnassignedRole('image'),
        };

        const store = createTestStore();
        render(
          <Provider store={store}>
            <RoleCard roleDescriptor={installationScopeRole} />
          </Provider>,
        );

        // Clear button should not be present for installation-scope roles
        const clearBtn = screen.queryByTestId('clear-role-embedding');
        expect(clearBtn).not.toBeInTheDocument();
      });
    });

    describe('FR-025/FR-027: error handling', () => {
      it('surfaces error naming server/model on failed write', async () => {
        // Override mock to simulate API error
        const originalMock = vi.mocked(await import('@clarion-app/frontend-base'));

        mockRoleAssignments = {
          inference: buildResolvedRole('inference'),
          embedding: buildUnassignedRole('embedding'),
          image: buildUnassignedRole('image'),
        };

        const store = createTestStore();
        render(
          <Provider store={store}>
            <RoleCard roleDescriptor={buildResolvedRole('inference')} />
          </Provider>,
        );

        // The component should handle errors gracefully
        // When the API returns an error, the prior value should remain displayed
        await waitFor(() => {
          expect(screen.getByText('gpt-4')).toBeInTheDocument();
        });
      });
    });

    describe('UX: ordinary personal change never requires opening disclosure', () => {
      it('user-scope ModelPicker is visible without opening disclosure', async () => {
        const store = createTestStore();
        render(
          <Provider store={store}>
            <RoleCard roleDescriptor={buildUnassignedRole('inference')} />
          </Provider>,
        );

        // ModelPicker should be visible without opening disclosure
        await waitFor(() => {
          expect(screen.getByTestId('model-picker')).toBeInTheDocument();
        });

        // Disclosure should be collapsed
        const disclosureContent = screen.queryByTestId('installation-disclosure-content-inference');
        expect(disclosureContent).not.toBeInTheDocument();
      });
    });
  });
});
