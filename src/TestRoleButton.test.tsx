import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { roleAssignmentApi } from './roleAssignmentApi';

vi.mock('.', () => ({
  backend: {
    url: 'http://localhost:8000',
    token: 'test-token',
    user: { id: 'user-1', name: 'Test User', email: 'test@test.com' },
  },
}));

let mockTestResult: any = null;
let capturedRequests: any[] = [];

vi.mock('@clarion-app/frontend-base', () => ({
  createBackendConfig: () => ({
    backend: { url: 'http://localhost:8000', user: { id: '', name: '', email: '' } },
    updateFrontend: () => {},
  }),
  createBaseQuery: () => async (args: any) => {
    capturedRequests.push(args);
    const url = typeof args === 'string' ? args : args?.url;
    if (url?.includes('/role-assignment/test')) {
      return { data: mockTestResult };
    }
    return { data: {} };
  },
}));

// TestRoleButton.tsx does not exist yet. This import is expected to fail the
// whole file at collection time — that is the RED signal for this test: the
// component itself is missing.
const { TestRoleButton } = await import('./TestRoleButton');

function createTestStore() {
  return configureStore({
    reducer: {
      [roleAssignmentApi.reducerPath]: roleAssignmentApi.reducer,
    },
    middleware: (getDefault) => getDefault().concat(roleAssignmentApi.middleware),
  });
}

function buildResolvedRoleDescriptor(role: string, overrides: Record<string, any> = {}): any {
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
    ...overrides,
  };
}

function buildUnassignedRoleDescriptor(role: string): any {
  return {
    role,
    effective: { status: 'unassigned', scope: null, server: null, model: null, reason: null },
    user_assignment: null,
    installation_assignment: null,
  };
}

describe('TestRoleButton', () => {
  beforeEach(() => {
    capturedRequests = [];
    mockTestResult = null;
  });

  it('runs the test and renders a pass outcome naming the role and the model', async () => {
    mockTestResult = {
      role: 'inference',
      outcome: 'pass',
      model: 'gpt-4',
      server: { id: 'srv-1', name: 'Local Server' },
      message: 'OK',
      duration_ms: 120,
    };

    const store = createTestStore();
    render(
      <Provider store={store}>
        <TestRoleButton role="inference" roleDescriptor={buildResolvedRoleDescriptor('inference')} />
      </Provider>,
    );

    fireEvent.click(screen.getByTestId('test-role-button-inference'));

    await waitFor(() => {
      expect(screen.getByTestId('test-role-result-inference')).toBeInTheDocument();
    });

    expect(screen.getByText(/pass/i)).toBeInTheDocument();
    expect(screen.getByText('gpt-4')).toBeInTheDocument();
    expect(screen.getByText(/inference/i)).toBeInTheDocument();
  });

  it('renders a fail outcome with a reassign affordance while the existing assignment stays displayed (FR-024a)', async () => {
    mockTestResult = {
      role: 'embedding',
      outcome: 'fail',
      model: 'text-embedding-3-small',
      server: { id: 'srv-2', name: 'Flaky Server' },
      message: 'HTTP 404 from http://localhost:8081/v1/embeddings',
      duration_ms: 412,
    };

    const descriptor = buildResolvedRoleDescriptor('embedding', {
      effective: {
        status: 'resolved',
        scope: 'user',
        server: { id: 'srv-2', name: 'Flaky Server' },
        model: 'text-embedding-3-small',
        reason: null,
      },
      user_assignment: { server_id: 'srv-2', model: 'text-embedding-3-small' },
    });

    const store = createTestStore();
    render(
      <Provider store={store}>
        <TestRoleButton role="embedding" roleDescriptor={descriptor} />
      </Provider>,
    );

    fireEvent.click(screen.getByTestId('test-role-button-embedding'));

    await waitFor(() => {
      expect(screen.getByTestId('test-role-result-embedding')).toBeInTheDocument();
    });

    expect(screen.getByText(/fail/i)).toBeInTheDocument();
    expect(screen.getByText(/HTTP 404/)).toBeInTheDocument();

    // A fail outcome must offer a way to reassign...
    expect(screen.getByTestId('reassign-after-test-embedding')).toBeInTheDocument();

    // ...and must NOT look like the failed test removed the existing
    // assignment (FR-024a: the endpoint writes nothing).
    expect(screen.getByText('text-embedding-3-small')).toBeInTheDocument();
    expect(screen.getByText(/Flaky Server/)).toBeInTheDocument();
  });

  it('renders a not_testable outcome for the image role, naming the role', async () => {
    mockTestResult = {
      role: 'image',
      outcome: 'not_testable',
      model: 'dall-e-3',
      server: { id: 'srv-3', name: 'Image Server' },
      message: 'Nothing currently consumes the image role.',
      duration_ms: null,
    };

    const store = createTestStore();
    render(
      <Provider store={store}>
        <TestRoleButton role="image" roleDescriptor={buildResolvedRoleDescriptor('image')} />
      </Provider>,
    );

    fireEvent.click(screen.getByTestId('test-role-button-image'));

    await waitFor(() => {
      expect(screen.getByTestId('test-role-result-image')).toBeInTheDocument();
    });

    expect(screen.getByText(/not.testable/i)).toBeInTheDocument();
    expect(screen.getByText(/image/i)).toBeInTheDocument();
  });

  it('renders a no_effective_model outcome naming the role, with no model to show', async () => {
    mockTestResult = {
      role: 'inference',
      outcome: 'no_effective_model',
      model: null,
      server: null,
      message: 'No effective model is assigned for inference.',
      duration_ms: null,
    };

    const store = createTestStore();
    render(
      <Provider store={store}>
        <TestRoleButton role="inference" roleDescriptor={buildUnassignedRoleDescriptor('inference')} />
      </Provider>,
    );

    fireEvent.click(screen.getByTestId('test-role-button-inference'));

    await waitFor(() => {
      expect(screen.getByTestId('test-role-result-inference')).toBeInTheDocument();
    });

    expect(screen.getByText(/no.effective.model/i)).toBeInTheDocument();
    expect(screen.getByText(/inference/i)).toBeInTheDocument();
  });
});
