import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';

/**
 * McpCredentialReplaceForm — US3 (119-mcp-server-management-ui), FR-008/
 * FR-009, Acceptance Scenarios 1-3. Confirmed FAILING: the component does
 * not exist yet (T049 makes this green).
 *
 * Mirrors ServerEditForm.tsx's write-only single-field idiom exactly: a
 * single credential input, structurally no other server field present or
 * editable through this form at all (D7's "no name/url/transport
 * parameter for a caller to even attempt to change" guarantee, mirrored
 * on the frontend rather than only the backend).
 */

vi.mock('.', () => ({
  backend: {
    url: 'http://localhost:8000',
    token: 'test-token',
    user: { id: 'user-1', name: 'Test User', email: 'test@test.com' },
  },
}));

let capturedRequests: any[] = [];
let mockReplaceResponse: any = { id: 'srv-1', name: 'Team web-search server', transport: 'streamable_http', scope: 'personal' };

vi.mock('@clarion-app/frontend-base', () => ({
  createBackendConfig: () => ({
    backend: { url: 'http://localhost:8000', user: { id: '', name: '', email: '' } },
    updateFrontend: () => {},
  }),
  createBaseQuery: () => async (args: any) => {
    capturedRequests.push(args);

    if (typeof args === 'object' && args.method === 'PATCH' && args.url === '/mcp-client-server/srv-1/credential') {
      return { data: mockReplaceResponse };
    }

    return { data: {} };
  },
}));

const { mcpClientServerApi } = await import('./mcpClientServerApi');
const { McpCredentialReplaceForm } = await import('./McpCredentialReplaceForm');

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
      <McpCredentialReplaceForm serverId="srv-1" onSuccess={onSuccess} />
    </Provider>,
  );
}

describe('McpCredentialReplaceForm — single write-only field (D7, FR-009)', () => {
  beforeEach(() => {
    capturedRequests = [];
    mockReplaceResponse = { id: 'srv-1', name: 'Team web-search server', transport: 'streamable_http', scope: 'personal' };
  });

  it('renders exactly one credential input, no name/url/transport/args field of any kind', () => {
    renderForm();

    expect(screen.getByLabelText(/credential|token/i)).toBeInTheDocument();

    // Structurally no other server field present -- not merely absent
    // from what gets submitted.
    expect(screen.queryByLabelText(/^name/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^url/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/transport/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/command/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/^args|arguments/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/scope/i)).not.toBeInTheDocument();

    const inputs = Array.from(document.querySelectorAll('input')) as HTMLInputElement[];
    expect(inputs).toHaveLength(1);
  });

  it('submitting calls replaceMcpClientServerCredential with only the new credential value', async () => {
    renderForm();

    fireEvent.change(screen.getByLabelText(/credential|token/i), { target: { value: 'rotated-token' } });
    fireEvent.click(screen.getByRole('button', { name: /save|replace/i }));

    await waitFor(() => {
      const patchRequest = capturedRequests.find(
        (r) => typeof r === 'object' && r.method === 'PATCH' && r.url === '/mcp-client-server/srv-1/credential',
      );
      expect(patchRequest).toBeDefined();
      expect(patchRequest.body).toEqual({ credential: 'rotated-token' });
    });
  });

  it('calls onSuccess after a successful replace', async () => {
    let successCalled = false;
    renderForm(() => {
      successCalled = true;
    });

    fireEvent.change(screen.getByLabelText(/credential|token/i), { target: { value: 'rotated-token' } });
    fireEvent.click(screen.getByRole('button', { name: /save|replace/i }));

    await waitFor(() => {
      expect(successCalled).toBe(true);
    });
  });

  it('never renders the submitted credential value into the DOM after save (Acceptance Scenario 3)', async () => {
    const secretValue = 'brand-new-secret-token';
    renderForm();

    fireEvent.change(screen.getByLabelText(/credential|token/i), { target: { value: secretValue } });
    fireEvent.click(screen.getByRole('button', { name: /save|replace/i }));

    await waitFor(() => {
      const patchRequest = capturedRequests.find(
        (r) => typeof r === 'object' && r.method === 'PATCH' && r.url === '/mcp-client-server/srv-1/credential',
      );
      expect(patchRequest).toBeDefined();
    });

    await waitFor(() => {
      expect(document.body.textContent ?? '').not.toContain(secretValue);
    });

    const inputs = Array.from(document.querySelectorAll('input')) as HTMLInputElement[];
    for (const input of inputs) {
      expect(input.value).not.toBe(secretValue);
    }
  });

  it('the credential field never pre-fills with any existing value (write-only, matching the initial-add idiom)', () => {
    renderForm();

    const input = screen.getByLabelText(/credential|token/i) as HTMLInputElement;
    expect(input.value).toBe('');
  });
});
