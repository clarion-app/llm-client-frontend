import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

/**
 * AddMcpServerForm — US2 (119-mcp-server-management-ui), FR-002/FR-003/
 * FR-004/FR-008/FR-010, Acceptance Scenarios 1-4. Confirmed FAILING:
 * AddMcpServerForm.tsx does not exist yet (T040 makes this green).
 *
 * Mirrors AddServerForm.test.tsx / McpServerManagement.test.tsx's own
 * mock-createBaseQuery pattern rather than a real backend.
 */

vi.mock('.', () => ({
  backend: {
    url: 'http://localhost:8000',
    token: 'test-token',
    user: { id: 'user-1', name: 'Test User', email: 'test@test.com' },
  },
}));

let capturedRequests: any[] = [];
let mockTestResult: { id: string; status: string; failure_category: string | null; message: string | null; tool_count: number | null } | null = null;
let mockCreateResponse: any = { id: 'srv-new-1', name: 'New server', transport: 'streamable_http', scope: 'personal', status: 'pending' };

vi.mock('@clarion-app/frontend-base', () => ({
  createBackendConfig: () => ({
    backend: { url: 'http://localhost:8000', user: { id: '', name: '', email: '' } },
    updateFrontend: () => {},
  }),
  createBaseQuery: () => async (args: any) => {
    capturedRequests.push(args);

    if (typeof args === 'object' && args.method === 'POST' && args.url === '/mcp-client-server/test-connection') {
      return { data: { id: 'test-1', status: 'pending' } };
    }

    if (typeof args === 'string' && args === '/mcp-client-server/test-connection/test-1') {
      return { data: mockTestResult ?? { id: 'test-1', status: 'pending', failure_category: null, message: null, tool_count: null } };
    }

    if (typeof args === 'object' && args.method === 'POST' && args.url === '/mcp-client-server') {
      return { data: mockCreateResponse };
    }

    return { data: {} };
  },
}));

const { mcpClientServerApi } = await import('./mcpClientServerApi');
const { AddMcpServerForm } = await import('./AddMcpServerForm');

function createTestStore() {
  return configureStore({
    reducer: {
      [mcpClientServerApi.reducerPath]: mcpClientServerApi.reducer,
    },
    middleware: (getDefault) => getDefault().concat(mcpClientServerApi.middleware),
  });
}

function renderForm(onSuccess?: () => void) {
  const store = createTestStore();
  return render(
    <Provider store={store}>
      <AddMcpServerForm onSuccess={onSuccess} />
    </Provider>,
  );
}

function fillConnectionDetails(url = 'https://mcp.example.com/mcp', credential?: string) {
  fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'My MCP Server' } });
  fireEvent.change(screen.getByLabelText(/url/i), { target: { value: url } });
  if (credential !== undefined) {
    fireEvent.change(screen.getByLabelText(/credential|token/i), { target: { value: credential } });
  }
}

describe('AddMcpServerForm — connection-detail fields', () => {
  beforeEach(() => {
    capturedRequests = [];
    mockTestResult = null;
  });

  it('renders transport, url, args, and optional credential fields', () => {
    renderForm();

    expect(screen.getByLabelText(/name/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/transport/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/url/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/credential|token/i)).toBeInTheDocument();
  });

  it('shows a command field instead of a url field when stdio transport is selected', () => {
    renderForm();

    fireEvent.change(screen.getByLabelText(/transport/i), { target: { value: 'stdio' } });

    expect(screen.getByLabelText(/command/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^url/i)).not.toBeInTheDocument();
  });
});

describe('AddMcpServerForm — test-before-save (FR-003, Acceptance Scenarios 1-2)', () => {
  beforeEach(() => {
    capturedRequests = [];
    mockTestResult = null;
  });

  it('runs the test-connection flow and renders a clear success result before saving', async () => {
    mockTestResult = { id: 'test-1', status: 'passed', failure_category: null, message: null, tool_count: 4 };

    renderForm();
    fillConnectionDetails();

    fireEvent.click(screen.getByRole('button', { name: /test/i }));

    await waitFor(() => {
      const postRequest = capturedRequests.find((r) => typeof r === 'object' && r.method === 'POST' && r.url === '/mcp-client-server/test-connection');
      expect(postRequest).toBeDefined();
    });

    await waitFor(() => {
      expect(screen.getByTestId('mcp-connection-test-result')).toHaveTextContent(/success|passed|connected/i);
    });
  });

  it('reports an unreachable failure with a specific, non-generic reason distinct from auth_failed and protocol_error', async () => {
    mockTestResult = { id: 'test-1', status: 'failed', failure_category: 'unreachable', message: 'Could not reach external server.', tool_count: null };

    renderForm();
    fillConnectionDetails();
    fireEvent.click(screen.getByRole('button', { name: /test/i }));

    await waitFor(() => {
      const result = screen.getByTestId('mcp-connection-test-result');
      expect(result).toHaveTextContent(/unreachable|could not reach/i);
    });
  });

  it('reports an auth_failed failure distinctly from unreachable', async () => {
    mockTestResult = { id: 'test-1', status: 'failed', failure_category: 'auth_failed', message: 'External server rejected the stored credential.', tool_count: null };

    renderForm();
    fillConnectionDetails();
    fireEvent.click(screen.getByRole('button', { name: /test/i }));

    await waitFor(() => {
      const result = screen.getByTestId('mcp-connection-test-result');
      expect(result).toHaveTextContent(/auth|credential|rejected/i);
      expect(result.textContent ?? '').not.toMatch(/unreachable/i);
    });
  });

  it('reports a protocol_error failure distinctly from both unreachable and auth_failed', async () => {
    mockTestResult = { id: 'test-1', status: 'failed', failure_category: 'protocol_error', message: 'External server returned an invalid response.', tool_count: null };

    renderForm();
    fillConnectionDetails();
    fireEvent.click(screen.getByRole('button', { name: /test/i }));

    await waitFor(() => {
      const result = screen.getByTestId('mcp-connection-test-result');
      expect(result).toHaveTextContent(/unexpected|invalid|protocol/i);
      expect(result.textContent ?? '').not.toMatch(/unreachable/i);
      expect(result.textContent ?? '').not.toMatch(/credential/i);
    });
  });
});

describe('AddMcpServerForm — save (Acceptance Scenario 3) and credential write-only guarantee (Acceptance Scenario 4)', () => {
  beforeEach(() => {
    capturedRequests = [];
    mockTestResult = null;
    mockCreateResponse = { id: 'srv-new-1', name: 'My MCP Server', transport: 'streamable_http', scope: 'personal', status: 'pending' };
  });

  it('calls createMcpClientServer on save and the server appears without further action', async () => {
    let successCalled = false;
    renderForm(() => {
      successCalled = true;
    });
    fillConnectionDetails();

    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      const postRequest = capturedRequests.find((r) => typeof r === 'object' && r.method === 'POST' && r.url === '/mcp-client-server');
      expect(postRequest).toBeDefined();
      expect(postRequest.body.name).toBe('My MCP Server');
    });

    await waitFor(() => {
      expect(successCalled).toBe(true);
    });
  });

  it('never renders the submitted credential value into the DOM after save or in any confirmation', async () => {
    const secretValue = 'super-secret-token-xyz';
    renderForm();
    fillConnectionDetails('https://mcp.example.com/mcp', secretValue);

    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      const postRequest = capturedRequests.find((r) => typeof r === 'object' && r.method === 'POST' && r.url === '/mcp-client-server');
      expect(postRequest).toBeDefined();
      expect(postRequest.body.credential).toBe(secretValue);
    });

    await waitFor(() => {
      expect(document.body.textContent ?? '').not.toContain(secretValue);
    });

    // Confirm no input anywhere on the page still carries the value either.
    const inputs = Array.from(document.querySelectorAll('input')) as HTMLInputElement[];
    for (const input of inputs) {
      expect(input.value).not.toBe(secretValue);
    }
  });

  it('never renders the submitted credential value after a test-connection run, saved or not', async () => {
    const secretValue = 'another-secret-abc';
    mockTestResult = { id: 'test-1', status: 'passed', failure_category: null, message: null, tool_count: 2 };

    renderForm();
    fillConnectionDetails('https://mcp.example.com/mcp', secretValue);
    fireEvent.click(screen.getByRole('button', { name: /test/i }));

    await waitFor(() => {
      expect(screen.getByTestId('mcp-connection-test-result')).toHaveTextContent(/success|passed|connected/i);
    });

    expect(screen.getByTestId('mcp-connection-test-result').textContent ?? '').not.toContain(secretValue);
  });
});
