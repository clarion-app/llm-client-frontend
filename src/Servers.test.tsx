import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter } from 'react-router-dom';
import { serverApi } from './serverApi';
import { serverStatusApi } from './serverStatusApi';
import { modelApi } from './modelApi';

vi.mock('.', () => ({
  backend: {
    url: 'http://localhost:8000',
    token: 'test-token',
    user: { id: 'user-1', name: 'Test User', email: 'test@test.com' },
  },
}));

const mockErrorLog = vi.fn();
vi.mock('./logger', () => ({
  errorLog: (...args: any[]) => mockErrorLog(...args),
  warnLog: vi.fn(),
}));

let capturedRequests: any[] = [];
let mock404: boolean = false;

vi.mock('@clarion-app/frontend-base', () => ({
  createBackendConfig: () => ({ backend: { url: 'http://localhost:8000', user: { id: '', name: '', email: '' } }, updateFrontend: () => {} }),
  createBaseQuery: () => async (args: any) => {
    capturedRequests.push(args);
    if (typeof args === 'string' && args === '/server') {
      return {
        data: [
          { id: 'srv-1', name: 'Server 1', server_url: 'https://llm.example.com' },
          { id: 'srv-2', name: 'Server 2', server_url: 'https://llm2.example.com' },
        ],
      };
    }
    if (mock404 && typeof args === 'object' && (args.method === 'PUT' || args.method === 'DELETE')) {
      return { error: { status: 404, data: { message: 'Not found' } } };
    }
    return { data: {} };
  },
}));

const { default: Servers } = await import('./Servers');

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

describe('Servers - Token Security', () => {
  beforeEach(() => {
    capturedRequests = [];
    mock404 = false;
    mockErrorLog.mockClear();
  });

  it('renders masked placeholder for existing server tokens', async () => {
    const store = createTestStore();
    render(
      <Provider store={store}>
        <MemoryRouter>
          <Servers />
        </MemoryRouter>
      </Provider>,
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('Server 1')).toBeTruthy();
    });

    // Token inputs for existing servers should show masked placeholder
    const tokenInputs = screen.getAllByPlaceholderText('••••••••');
    expect(tokenInputs.length).toBeGreaterThan(0);
    tokenInputs.forEach((input) => {
      expect(input).toHaveAttribute('type', 'password');
      expect((input as HTMLInputElement).value).toBe('');
    });
  });

  it('new server token input has type="password"', async () => {
    const store = createTestStore();
    render(
      <Provider store={store}>
        <MemoryRouter>
          <Servers />
        </MemoryRouter>
      </Provider>,
    );

    await waitFor(() => {
      expect(screen.getByPlaceholderText('New server token')).toBeTruthy();
    });

    const newTokenInput = screen.getByPlaceholderText('New server token');
    expect(newTokenInput).toHaveAttribute('type', 'password');
  });

  it('update request omits token when user has not changed it', async () => {
    const store = createTestStore();
    render(
      <Provider store={store}>
        <MemoryRouter>
          <Servers />
        </MemoryRouter>
      </Provider>,
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('Server 1')).toBeTruthy();
    });

    // Change the name field only
    const nameInput = screen.getByDisplayValue('Server 1');
    fireEvent.change(nameInput, { target: { value: 'Server 1 Updated', name: 'name' } });

    // Wait for debounced update
    await waitFor(() => {
      const updateReqs = capturedRequests.filter(
        (r) => typeof r === 'object' && r.method === 'PUT',
      );
      expect(updateReqs.length).toBeGreaterThan(0);
      // Token should NOT be in the body
      const lastUpdate = updateReqs[updateReqs.length - 1];
      expect(lastUpdate.body).not.toHaveProperty('token');
    }, { timeout: 3000 });
  });

  it('update request includes token when user explicitly types a new value', async () => {
    const store = createTestStore();
    render(
      <Provider store={store}>
        <MemoryRouter>
          <Servers />
        </MemoryRouter>
      </Provider>,
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('Server 1')).toBeTruthy();
    });

    // Change the token field
    const tokenInputs = screen.getAllByPlaceholderText('••••••••');
    fireEvent.change(tokenInputs[0], { target: { value: 'new-secret-token', name: 'token' } });

    await waitFor(() => {
      const updateReqs = capturedRequests.filter(
        (r) => typeof r === 'object' && r.method === 'PUT',
      );
      expect(updateReqs.length).toBeGreaterThan(0);
      const lastUpdate = updateReqs[updateReqs.length - 1];
      expect(lastUpdate.body.token).toBe('new-secret-token');
    }, { timeout: 3000 });
  });
});

describe('Servers - Error Handling', () => {
  beforeEach(() => {
    capturedRequests = [];
    mock404 = false;
    mockErrorLog.mockClear();
  });

  it('logs "Server not found" on 404 when updating', async () => {
    mock404 = true;
    const store = createTestStore();
    render(
      <Provider store={store}>
        <MemoryRouter>
          <Servers />
        </MemoryRouter>
      </Provider>,
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('Server 1')).toBeTruthy();
    });

    const nameInput = screen.getByDisplayValue('Server 1');
    fireEvent.change(nameInput, { target: { value: 'Server Updated', name: 'name' } });

    await waitFor(() => {
      expect(mockErrorLog).toHaveBeenCalledWith('Server not found', 'srv-1');
    }, { timeout: 3000 });
  });

  it('logs "Server not found" on 404 when deleting', async () => {
    mock404 = true;
    const store = createTestStore();
    render(
      <Provider store={store}>
        <MemoryRouter>
          <Servers />
        </MemoryRouter>
      </Provider>,
    );

    await waitFor(() => {
      expect(screen.getByDisplayValue('Server 1')).toBeTruthy();
    });

    const deleteButtons = screen.getAllByText('Delete');
    fireEvent.click(deleteButtons[0]);

    await waitFor(() => {
      expect(mockErrorLog).toHaveBeenCalledWith('Server not found', 'srv-1');
    }, { timeout: 3000 });
  });
});
