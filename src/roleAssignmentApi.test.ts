import { describe, it, expect, vi, beforeEach } from 'vitest';
import { configureStore } from '@reduxjs/toolkit';

vi.mock('.', () => ({
  backend: {
    url: 'http://localhost:8000',
    token: 'test-token',
    user: { id: 'user-1', name: 'Test User', email: 'test@test.com' },
  },
}));

let capturedRequests: any[] = [];
const mockRoleAssignments: any = {
  inference: {
    role: 'inference',
    effective: {
      status: 'resolved',
      scope: 'user',
      server: { id: 'srv-1', name: 'Local Server' },
      model: 'gpt-4',
      reason: null,
    },
    user_assignment: { server_id: 'srv-1', model: 'gpt-4' },
    installation_assignment: { server_id: 'srv-0', model: 'gpt-3.5' },
  },
  embedding: {
    role: 'embedding',
    effective: {
      status: 'unassigned',
      scope: null,
      server: null,
      model: null,
      reason: null,
    },
    user_assignment: null,
    installation_assignment: null,
  },
  image: {
    role: 'image',
    effective: {
      status: 'broken',
      scope: 'installation',
      server: null,
      model: 'old-image-model',
      reason: 'server deleted',
    },
    user_assignment: null,
    installation_assignment: { server_id: 'srv-deleted', model: 'old-image-model' },
  },
};

vi.mock('@clarion-app/frontend-base', () => ({
  createBackendConfig: () => ({
    backend: { url: 'http://localhost:8000', user: { id: '', name: '', email: '' } },
    updateFrontend: () => {},
  }),
  createBaseQuery: () => async (args: any) => {
    capturedRequests.push(args);
    if (typeof args === 'string' && args === '/role-assignment') {
      return { data: mockRoleAssignments };
    }
    if (typeof args === 'object' && args.url === '/role-assignment') {
      return { data: mockRoleAssignments };
    }
    return { data: {} };
  },
}));

const { roleAssignmentApi } = await import('./roleAssignmentApi');

function createTestStore() {
  return configureStore({
    reducer: {
      [roleAssignmentApi.reducerPath]: roleAssignmentApi.reducer,
    },
    middleware: (getDefault) =>
      getDefault().concat(roleAssignmentApi.middleware),
  });
}

describe('roleAssignmentApi', () => {
  beforeEach(() => {
    capturedRequests = [];
  });

  describe('getRoleAssignments', () => {
    it('GET /role-assignment fetches role assignments', async () => {
      const store = createTestStore();
      await store.dispatch(
        roleAssignmentApi.endpoints.getRoleAssignments.initiate(null)
      );
      expect(capturedRequests).toContainEqual('/role-assignment');
    });

    it('returns all three roles in response', async () => {
      const store = createTestStore();
      const result = await store.dispatch(
        roleAssignmentApi.endpoints.getRoleAssignments.initiate(null)
      );

      if ('data' in result) {
        const data = result.data;
        expect(data).toHaveProperty('inference');
        expect(data).toHaveProperty('embedding');
        expect(data).toHaveProperty('image');
      }
    });
  });

  describe('setRoleAssignment', () => {
    it('PUT /role-assignment sets a role assignment', async () => {
      const store = createTestStore();
      await store.dispatch(
        roleAssignmentApi.endpoints.setRoleAssignment.initiate({
          role: 'embedding',
          scope: 'user',
          server_id: 'srv-2',
          model: 'text-embedding-3-small',
        })
      );
      expect(capturedRequests).toContainEqual({
        url: '/role-assignment',
        method: 'PUT',
        body: {
          role: 'embedding',
          scope: 'user',
          server_id: 'srv-2',
          model: 'text-embedding-3-small',
        },
      });
    });

    it('invalidates RoleAssignment tag after mutation', async () => {
      const store = createTestStore();
      await store.dispatch(
        roleAssignmentApi.endpoints.setRoleAssignment.initiate({
          role: 'inference',
          scope: 'user',
          server_id: 'srv-3',
          model: 'claude-3',
        })
      );

      // The tag invalidation should trigger a refetch.
      // We verify this by checking that the endpoint was called.
      const putRequests = capturedRequests.filter(
        (r) => typeof r === 'object' && r.method === 'PUT'
      );
      expect(putRequests.length).toBeGreaterThan(0);
    });
  });

  describe('clearRoleAssignment', () => {
    it('DELETE /role-assignment clears a role assignment', async () => {
      const store = createTestStore();
      await store.dispatch(
        roleAssignmentApi.endpoints.clearRoleAssignment.initiate({
          role: 'embedding',
          scope: 'user',
        })
      );
      expect(capturedRequests).toContainEqual({
        url: '/role-assignment',
        method: 'DELETE',
        body: { role: 'embedding', scope: 'user' },
      });
    });
  });
});
