import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor, within } from '@testing-library/react';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { runApi } from './runApi';
import type { RunResumeEvent } from './types';

/**
 * The timeline of a task's interruptions and retries inside the run diagram,
 * data-testid "run-resume-timeline": one entry for each resume event, oldest
 * first, in plain words. A resume names what it reused, re-ran and could not
 * confirm by the labels of those actions. No identifier is ever shown.
 */

vi.mock('./config', () => ({
  backend: {
    url: 'http://localhost:8000',
    token: 'test-token',
    user: { id: 'user-1', name: 'Test User', email: 'test@test.com' },
  },
  updateFrontend: () => {},
}));

let mockEvents: RunResumeEvent[] = [];
let requestedPages: string[] = [];

vi.mock('@clarion-app/frontend-base', () => ({
  createBackendConfig: () => ({
    backend: { url: 'http://localhost:8000', user: { id: 'user-1', name: '', email: '' } },
    updateFrontend: () => {},
  }),
  createBaseQuery: () => async (args: any) => {
    const url = typeof args === 'string' ? args : (args?.url ?? '');
    if (/^\/agent-runs\/[^/]+\/resume-events$/.test(String(url).split('?')[0])) {
      requestedPages.push(String(url));
      return { data: { data: mockEvents, meta: { current_page: 1, per_page: 50, total: mockEvents.length, last_page: 1 } } };
    }
    return { data: {} };
  },
  registerUserChannelHandler: () => {},
}));

const { RunResumeTimeline } = await import('./RunResumeTimeline');

function event(kind: string, payload: Record<string, unknown>, overrides: Partial<RunResumeEvent> = {}): RunResumeEvent {
  return {
    id: `event-id-${Math.random().toString(36).slice(2)}`,
    kind,
    step_position: null,
    attempt: null,
    payload,
    created_at: '2026-10-12T10:12:00.000000Z',
    ...overrides,
  } as RunResumeEvent;
}

function renderTimeline(runId = 'run-1') {
  const store = configureStore({
    reducer: { [runApi.reducerPath]: runApi.reducer },
    middleware: (getDefault) => getDefault().concat(runApi.middleware),
  });
  return render(
    <Provider store={store}>
      <RunResumeTimeline runId={runId} />
    </Provider>,
  );
}

async function entries(count: number): Promise<HTMLElement[]> {
  const timeline = await screen.findByTestId('run-resume-timeline');
  await waitFor(() => expect(within(timeline).getAllByRole('listitem')).toHaveLength(count));
  return within(timeline).getAllByRole('listitem');
}

describe('RunResumeTimeline', () => {
  beforeEach(() => {
    cleanup();
    mockEvents = [];
    requestedPages = [];
  });

  afterEach(() => {
    cleanup();
  });

  it('reads the events of the run it is given', async () => {
    mockEvents = [event('takeover', {})];
    renderTimeline('run-77');

    await entries(1);

    expect(requestedPages[0]).toMatch(/^\/agent-runs\/run-77\/resume-events/);
  });

  it('says when the task was found interrupted', async () => {
    mockEvents = [event('interruption_detected', { detected_by: 'sweep', resume_state_before: 'working' }, { step_position: 3 })];
    renderTimeline();

    const [item] = await entries(1);

    expect(item.textContent).toMatch(/interrupted/i);
    expect(item.textContent).toMatch(/10:12/);
  });

  it('says where a resume continued from', async () => {
    mockEvents = [event('resume_started', { from_step: 3, iteration: 3, mode: 'sync', reused: [], rerun: [], outcome_unknown: [], model_call_repeated: false }, { step_position: 3 })];
    renderTimeline();

    const [item] = await entries(1);

    expect(item.textContent).toMatch(/resumed from step 3/i);
  });

  it('names what a resume reused, re-ran and could not confirm, by label', async () => {
    mockEvents = [
      event('resume_started', {
        from_step: 4,
        iteration: 4,
        mode: 'stream',
        reused: [{ tool_call_id: 'call_reused_1', tool: 'execute_operation', label: 'Store a note' }],
        rerun: [{ tool_call_id: 'call_rerun_1', tool: 'list_applications', label: 'List applications' }],
        outcome_unknown: [{ tool_call_id: 'call_unknown_1', tool: 'execute_operation', label: 'Send the invoice' }],
        model_call_repeated: true,
      }, { step_position: 4 }),
    ];
    renderTimeline();

    const [item] = await entries(1);
    const text = item.textContent ?? '';

    expect(text).toContain('Store a note');
    expect(text).toContain('List applications');
    expect(text).toContain('Send the invoice');
    expect(text).toMatch(/reused/i);
    expect(text).toMatch(/run again|re-run|rerun|ran again/i);
    expect(text).toMatch(/outcome (was )?unknown|unknown outcome|could not (be )?confirm/i);
  });

  it('shows provider retries and their giving up', async () => {
    mockEvents = [
      event('provider_retry_scheduled', { reason: 'rate_limited', status: 429, next_attempt_at: '2026-10-12 10:40:00', deferred: true }, { attempt: 2, created_at: '2026-10-12T10:30:00.000000Z' }),
      event('provider_retry_exhausted', { reason: 'rate_limited', attempts: 5, window_seconds: 600 }, { attempt: 5, created_at: '2026-10-12T10:40:00.000000Z' }),
    ];
    renderTimeline();

    const items = await entries(2);

    expect(items[0].textContent).toMatch(/retry/i);
    expect(items[1].textContent).toMatch(/retry|gave up|no further|stopped/i);
  });

  it('says a task could not be resumed', async () => {
    mockEvents = [event('stopped_unresumable', { reason_code: 'repeated_interruption', completed_steps: 4 })];
    renderTimeline();

    const [item] = await entries(1);

    expect(item.textContent).toMatch(/could not (be )?resume/i);
  });

  it('lists the events oldest first, one entry each', async () => {
    mockEvents = [
      event('interruption_detected', {}, { created_at: '2026-10-12T10:12:00.000000Z' }),
      event('resume_started', { from_step: 3, iteration: 3, mode: 'sync', reused: [], rerun: [], outcome_unknown: [], model_call_repeated: false }, { step_position: 3, created_at: '2026-10-12T10:13:00.000000Z' }),
      event('provider_retry_scheduled', { reason: 'timeout', status: null, next_attempt_at: null, deferred: true }, { attempt: 1, created_at: '2026-10-12T10:14:00.000000Z' }),
    ];
    renderTimeline();

    const items = await entries(3);

    expect(items[0].textContent).toMatch(/interrupted/i);
    expect(items[1].textContent).toMatch(/resumed from step 3/i);
    expect(items[2].textContent).toMatch(/retry/i);
  });

  it('shows no identifier, raw kind or argument', async () => {
    mockEvents = [
      event('resume_started', {
        from_step: 3,
        iteration: 3,
        mode: 'sync',
        reused: [{ tool_call_id: 'call_secret_id_9', tool: 'execute_operation', label: 'Store a note' }],
        rerun: [],
        outcome_unknown: [],
        model_call_repeated: false,
      }, { step_position: 3 }),
      event('interruption_detected', { detected_by: 'sweep', resume_state_before: 'working' }),
    ];
    renderTimeline();
    await entries(2);

    const html = screen.getByTestId('run-resume-timeline').textContent ?? '';

    expect(html).not.toContain('call_secret_id_9');
    expect(html).not.toMatch(/event-id-/);
    expect(html).not.toMatch(/resume_started|interruption_detected|provider_retry_scheduled|stopped_unresumable/);
    expect(html).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
  });
});
