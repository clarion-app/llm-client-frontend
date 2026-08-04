import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { serverApi } from './serverApi';
import { serverStatusApi } from './serverStatusApi';
import { modelApi } from './modelApi';
import { ServerType } from './types';

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
    const url = typeof args === 'string' ? args : args?.url;

    if (typeof args === 'object' && args.method === 'PUT' && url?.startsWith('/server/')) {
      const body = args.body;
      // Simulate the backend normalizing the address (strips trailing slash).
      return {
        data: {
          id: url.replace('/server/', ''),
          name: body.name,
          server_url: (body.server_url as string).replace(/\/+$/, ''),
          provider_type: body.provider_type ?? 'openai',
          has_token: body.token ? true : false,
        },
      };
    }
    return { data: {} };
  },
}));

const { ServerEditForm } = await import('./ServerEditForm');

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

function makeServer(overrides: Partial<ServerType> = {}): ServerType {
  return {
    id: 'srv-1',
    name: 'Local Server',
    server_url: 'http://localhost:8080',
    provider_type: 'openai',
    ...overrides,
  } as ServerType;
}

function renderForm(server: ServerType, props: Partial<Parameters<typeof ServerEditForm>[0]> = {}) {
  const store = createTestStore();
  return {
    store,
    ...render(
      <Provider store={store}>
        <ServerEditForm server={server} {...props} />
      </Provider>,
    ),
  };
}

function putRequests() {
  return capturedRequests.filter(
    (r) => typeof r === 'object' && r.method === 'PUT' && r.url?.startsWith('/server/'),
  );
}

describe('ServerEditForm', () => {
  beforeEach(() => {
    capturedRequests = [];
  });

  /* -----------------------------------------------------------------
   * FR-017, SC-005, US4-1: typing never issues a request by itself.
   * ----------------------------------------------------------------- */
  it('issues no request while typing in any field', async () => {
    renderForm(makeServer());

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Renamed Server' } });
    fireEvent.change(screen.getByLabelText(/server url/i), { target: { value: 'http://localhost:9999' } });
    fireEvent.change(screen.getByLabelText(/token/i), { target: { value: 'new-secret' } });

    // Give any accidental async dispatch a chance to happen.
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(putRequests()).toHaveLength(0);
  });

  /* -----------------------------------------------------------------
   * Dirty state indication and Discard.
   * ----------------------------------------------------------------- */
  it('indicates dirty state once a field differs from the loaded values, and Discard restores the original values', async () => {
    renderForm(makeServer({ name: 'Local Server' }));

    expect(screen.queryByTestId('server-edit-dirty')).not.toBeInTheDocument();

    const nameInput = screen.getByLabelText(/name/i) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: 'Changed Name' } });

    await waitFor(() => {
      expect(screen.getByTestId('server-edit-dirty')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('server-edit-discard'));

    await waitFor(() => {
      expect((screen.getByLabelText(/name/i) as HTMLInputElement).value).toBe('Local Server');
      expect(screen.queryByTestId('server-edit-dirty')).not.toBeInTheDocument();
    });
  });

  /* -----------------------------------------------------------------
   * Save issues exactly one PUT, not one per field / keystroke.
   * ----------------------------------------------------------------- */
  it('issues exactly one PUT request when Save is clicked', async () => {
    renderForm(makeServer());

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Renamed Server' } });
    fireEvent.change(screen.getByLabelText(/server url/i), { target: { value: 'http://localhost:9999' } });

    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect(putRequests()).toHaveLength(1);
    });

    const [request] = putRequests();
    expect(request.url).toBe('/server/srv-1');
    expect(request.body.name).toBe('Renamed Server');
    expect(request.body.server_url).toBe('http://localhost:9999');
  });

  /* -----------------------------------------------------------------
   * FR-032, US4-6: after save, the address field reflects the
   * backend's normalized value, not the raw user input.
   * ----------------------------------------------------------------- */
  it('displays the backend-normalized server_url after save, not the raw typed value', async () => {
    renderForm(makeServer());

    // Trailing slash — the mocked backend strips it on the way back.
    fireEvent.change(screen.getByLabelText(/server url/i), {
      target: { value: 'http://localhost:9999/' },
    });

    fireEvent.click(screen.getByRole('button', { name: /save/i }));

    await waitFor(() => {
      expect((screen.getByLabelText(/server url/i) as HTMLInputElement).value).toBe(
        'http://localhost:9999',
      );
    });
  });

  /* -----------------------------------------------------------------
   * US4-2: collapsing with unsaved edits warns and offers to discard.
   * ----------------------------------------------------------------- */
  it('warns before collapsing when there are unsaved edits, and does not collapse on cancel', async () => {
    const onCollapse = vi.fn();
    renderForm(makeServer(), { onCollapse });

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Changed Name' } });

    fireEvent.click(screen.getByTestId('server-edit-collapse'));

    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    });
    expect(onCollapse).not.toHaveBeenCalled();

    // Cancel: dialog closes, edits remain, form stays open.
    fireEvent.click(screen.getByText(/cancel/i));

    await waitFor(() => {
      expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument();
    });
    expect((screen.getByLabelText(/name/i) as HTMLInputElement).value).toBe('Changed Name');
    expect(onCollapse).not.toHaveBeenCalled();
  });

  it('discards unsaved edits and collapses when the warning is confirmed', async () => {
    const onCollapse = vi.fn();
    renderForm(makeServer({ name: 'Local Server' }), { onCollapse });

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Changed Name' } });
    fireEvent.click(screen.getByTestId('server-edit-collapse'));

    await waitFor(() => {
      expect(screen.getByTestId('confirm-dialog')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /discard/i }));

    await waitFor(() => {
      expect(onCollapse).toHaveBeenCalledTimes(1);
    });
    // No PUT was ever issued — the edit was discarded, not saved.
    expect(putRequests()).toHaveLength(0);
  });

  it('does not collapse (and does not warn) when there are no unsaved edits', async () => {
    const onCollapse = vi.fn();
    renderForm(makeServer(), { onCollapse });

    fireEvent.click(screen.getByTestId('server-edit-collapse'));

    expect(screen.queryByTestId('confirm-dialog')).not.toBeInTheDocument();
    await waitFor(() => {
      expect(onCollapse).toHaveBeenCalledTimes(1);
    });
  });

  /* -----------------------------------------------------------------
   * US4-2: navigating away (browser unload) with unsaved edits warns.
   * ----------------------------------------------------------------- */
  it('warns on browser navigation away (beforeunload) while dirty', async () => {
    renderForm(makeServer());

    fireEvent.change(screen.getByLabelText(/name/i), { target: { value: 'Changed Name' } });

    await waitFor(() => {
      expect(screen.getByTestId('server-edit-dirty')).toBeInTheDocument();
    });

    const event = new Event('beforeunload', { cancelable: true });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
    window.dispatchEvent(event);

    expect(preventDefaultSpy).toHaveBeenCalled();
  });

  it('does not warn on browser navigation away when there are no unsaved edits', async () => {
    renderForm(makeServer());

    const event = new Event('beforeunload', { cancelable: true });
    const preventDefaultSpy = vi.spyOn(event, 'preventDefault');
    window.dispatchEvent(event);

    expect(preventDefaultSpy).not.toHaveBeenCalled();
  });
});
