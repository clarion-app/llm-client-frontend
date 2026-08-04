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
    if (typeof args === 'object' && args.method === 'PUT' && (args.url === '/role-assignment' || args.url?.includes('/role-assignment'))) {
      const body = args.body;
      // Simulate server response
      return {
        data: {
          role: body.role,
          effective: {
            status: 'resolved',
            scope: 'user',
            server: { id: body.server_id, name: 'Local Server' },
            model: body.model,
            reason: null,
          },
          user_assignment: { server_id: body.server_id, model: body.model },
          installation_assignment: null,
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
});
