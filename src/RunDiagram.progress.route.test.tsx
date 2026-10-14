import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { runApi } from './runApi';
import { delegationApi } from './delegationApi';
import type { RunSummary, StepSummary } from './types';

/**
 * The progress panel and the resume timeline inside the diagram the package
 * manifest actually routes.
 *
 * `package.json`'s `customFields.clarion.routes` registers
 * `/clarion-app/llm-client/runs/:id` -> `<RunDiagram />` with no props, so
 * the run id can only reach the panel and the timeline through the `:id`
 * route param that RunDiagram resolves. Every other test of the panel passes
 * `runId` by hand; this one renders the route the deployed app takes, over
 * the real store, and checks that what the panel and the timeline read, and
 * show, is that run's own.
 */

vi.mock('./config', () => ({
  backend: {
    url: 'http://localhost:8000',
    token: 'test-token',
    user: { id: 'user-1', name: 'Test User', email: 'test@test.com' },
  },
  updateFrontend: () => {},
}));

let requested: string[] = [];
let progressFails = false;

vi.mock('@clarion-app/frontend-base', () => ({
  createBackendConfig: () => ({
    backend: { url: 'http://localhost:8000', user: { id: 'user-1', name: '', email: '' } },
    updateFrontend: () => {},
  }),
  createBaseQuery: () => async (args: any) => {
    const url = typeof args === 'string' ? args : (args?.url ?? '');
    const path = String(url).split('?')[0];
    requested.push(String(url));

    const progress = path.match(/^\/agent-runs\/([^/]+)\/progress$/);
    if (progress) {
      if (progressFails) {
        return { error: { status: 404, data: { error: 'Run not found', code: 'run_not_found' } } };
      }
      return {
        data: {
          run_id: progress[1],
          state: 'working',
          activity: { kind: 'running_tool', label: `tool-of-${progress[1]}` },
          steps_completed: 4,
          structure: null,
          remaining: 'unknown',
          started_at: '2026-10-12T10:00:00.000000Z',
          elapsed_ms: 60000,
          last_progress_at: '2026-10-12T10:01:00.000000Z',
          resume_count: 1,
          interrupted_at: null,
          next_attempt_at: null,
        },
      };
    }

    const events = path.match(/^\/agent-runs\/([^/]+)\/resume-events$/);
    if (events) {
      return {
        data: {
          data: [
            { id: 'e1', kind: 'resume_started', step_position: 3, attempt: 1, payload: { from_step: 3, iteration: 3, mode: 'sync', reused: [{ tool_call_id: 'c1', tool: 'execute_operation', label: `label-of-${events[1]}` }], rerun: [], outcome_unknown: [], model_call_repeated: false }, created_at: '2026-10-12T10:00:30.000000Z' },
          ],
          meta: { current_page: 1, per_page: 50, total: 1, last_page: 1 },
        },
      };
    }

    if (/^\/agent-runs\/[^/]+\/steps\/[^/]+\/actions$/.test(path)) {
      return { data: { data: [], meta: { current_page: 1, per_page: 50, total: 0, last_page: 1 } } };
    }
    if (/^\/agent-runs\/[^/]+\/delegations$/.test(path)) {
      return { data: [] };
    }
    if (/^\/agent-runs\/[^/]+\/steps$/.test(path)) {
      const id = path.split('/')[2];
      const step: StepSummary = {
        id: `step-of-${id}`, run_id: id, position: 1, end_state: 'completed', end_reason: null,
        started_at: '2026-10-12T10:00:00.000000Z', ended_at: '2026-10-12T10:00:05.000000Z',
        duration_ms: 5000, wait_ms: null, attempt_count: 1, action_count: 0,
      };
      return { data: { data: [step], meta: { current_page: 1, per_page: 100, total: 1, last_page: 1 } } };
    }
    const runMatch = path.match(/^\/agent-runs\/([^/]+)$/);
    if (runMatch) {
      const run: RunSummary = {
        id: runMatch[1], kind: 'interactive', end_state: 'in_progress', end_reason: null,
        started_at: '2026-10-12T10:00:00.000000Z', ended_at: null, duration_ms: null,
        step_count: 1, action_count: 0, conversation_id: null,
      };
      return { data: run };
    }
    return { data: {} };
  },
  registerUserChannelHandler: () => {},
}));

const { RunDiagram } = await import('./RunDiagram');

function renderManifestRoute(initialEntry: string) {
  const store = configureStore({
    reducer: {
      [runApi.reducerPath]: runApi.reducer,
      [delegationApi.reducerPath]: delegationApi.reducer,
    },
    middleware: (getDefault) => getDefault().concat(runApi.middleware, delegationApi.middleware),
  });
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <Provider store={store}>
        <Routes>
          <Route path="/clarion-app/llm-client/runs/:id" element={<RunDiagram />} />
        </Routes>
      </Provider>
    </MemoryRouter>,
  );
}

describe('RunDiagram — progress panel and resume timeline, through the declared route', () => {
  beforeEach(() => {
    requested = [];
    progressFails = false;
  });

  it('shows the panel and the timeline of the run named by the :id route param, with no props', async () => {
    renderManifestRoute('/clarion-app/llm-client/runs/run-from-route');

    const panel = await screen.findByTestId('run-progress-panel');
    await waitFor(() => expect(panel).toHaveTextContent('running tool-of-run-from-route'));
    const timeline = await screen.findByTestId('run-resume-timeline');
    await waitFor(() => expect(timeline).toHaveTextContent('label-of-run-from-route'));

    // The diagram around them is that run's too.
    expect(await screen.findByTestId('run-step-step-of-run-from-route')).toBeInTheDocument();
  });

  it('asks for the route\'s run, never for an empty or undefined id', async () => {
    renderManifestRoute('/clarion-app/llm-client/runs/run-from-route');
    await screen.findByTestId('run-progress-panel');
    await waitFor(() => expect(requested).toContain('/agent-runs/run-from-route/progress'));

    expect(requested.some((url) => /resume-events/.test(url) && url.startsWith('/agent-runs/run-from-route/'))).toBe(true);
    expect(requested.filter((url) => /\/agent-runs\/(undefined|)\/|\/agent-runs\/\/|undefined/.test(url))).toEqual([]);
  });

  it('puts the panel above the steps', async () => {
    renderManifestRoute('/clarion-app/llm-client/runs/run-from-route');

    const diagram = await screen.findByTestId('run-diagram');
    const panel = await screen.findByTestId('run-progress-panel');
    const step = await screen.findByTestId('run-step-step-of-run-from-route');

    expect(within(diagram).getByTestId('run-progress-panel')).toBe(panel);
    expect(panel.compareDocumentPosition(step) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('keeps showing the diagram when the progress cannot be read', async () => {
    progressFails = true;
    renderManifestRoute('/clarion-app/llm-client/runs/run-from-route');

    expect(await screen.findByTestId('run-step-step-of-run-from-route')).toBeInTheDocument();
    expect(screen.queryByTestId('run-diagram-not-available')).not.toBeInTheDocument();
  });
});
