import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import {
  MemoryRouter,
  Routes,
  Route,
  useLocation,
  createMemoryRouter,
  RouterProvider,
} from 'react-router-dom';
import { ModelSetupRedirect } from './ModelSetupRedirect';

/**
 * ModelSetupRedirect renders <Navigate replace> to
 * /clarion-app/llm-client/model-setup, forwarding a :id route param (when
 * present) as ?server=<id> so the old per-server "Models" link lands on that
 * server's card in the new consolidated screen (FR-004, D11).
 *
 * Contract: specs/064-model-setup-interface/contracts/frontend-model-setup.md §1
 */

const MODEL_SETUP_PATH = '/clarion-app/llm-client/model-setup';

function LocationDisplay() {
  const location = useLocation();
  return (
    <div data-testid="location-display">
      {location.pathname}
      {location.search}
    </div>
  );
}

function renderAt(initialPath: string, redirectRoutePath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path={redirectRoutePath} element={<ModelSetupRedirect />} />
        <Route path={MODEL_SETUP_PATH} element={<LocationDisplay />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('ModelSetupRedirect', () => {
  it('redirects the legacy /servers path to /model-setup with no query string', async () => {
    renderAt('/clarion-app/llm-client/servers', '/clarion-app/llm-client/servers');

    await waitFor(() => {
      expect(screen.getByTestId('location-display').textContent).toBe(MODEL_SETUP_PATH);
    });
  });

  it('redirects the legacy /models path to /model-setup with no query string', async () => {
    renderAt('/clarion-app/llm-client/models', '/clarion-app/llm-client/models');

    await waitFor(() => {
      expect(screen.getByTestId('location-display').textContent).toBe(MODEL_SETUP_PATH);
    });
  });

  it('redirects the legacy /settings path to /model-setup with no query string', async () => {
    renderAt('/clarion-app/llm-client/settings', '/clarion-app/llm-client/settings');

    await waitFor(() => {
      expect(screen.getByTestId('location-display').textContent).toBe(MODEL_SETUP_PATH);
    });
  });

  it('forwards the :id route param from the legacy per-server models link as ?server=<id>', async () => {
    renderAt(
      '/clarion-app/llm-client/servers/srv-123/models',
      '/clarion-app/llm-client/servers/:id/models',
    );

    await waitFor(() => {
      expect(screen.getByTestId('location-display').textContent).toBe(
        `${MODEL_SETUP_PATH}?server=srv-123`,
      );
    });
  });

  it('URL-encodes a :id value that needs escaping in the forwarded query param', async () => {
    renderAt(
      '/clarion-app/llm-client/servers/srv%20with%20space/models',
      '/clarion-app/llm-client/servers/:id/models',
    );

    await waitFor(() => {
      const text = screen.getByTestId('location-display').textContent ?? '';
      expect(text.startsWith(MODEL_SETUP_PATH)).toBe(true);
      const search = new URLSearchParams(text.slice(MODEL_SETUP_PATH.length));
      expect(search.get('server')).toBe('srv with space');
    });
  });

  it('navigates via replace, not push, so the legacy route does not remain in history', async () => {
    const router = createMemoryRouter(
      [
        { path: '/clarion-app/llm-client/servers', element: <ModelSetupRedirect /> },
        { path: MODEL_SETUP_PATH, element: <LocationDisplay /> },
      ],
      { initialEntries: ['/clarion-app/llm-client/servers'] },
    );

    render(<RouterProvider router={router} />);

    await waitFor(() => {
      expect(router.state.location.pathname).toBe(MODEL_SETUP_PATH);
    });
    expect(router.state.historyAction).toBe('REPLACE');
  });
});
