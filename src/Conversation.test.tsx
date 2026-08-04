import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, cleanup, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { conversationApi } from './conversationApi';
import { messageApi } from './messageApi';
import { modelApi } from './modelApi';
import { serverApi } from './serverApi';
import { roleAssignmentApi } from './roleAssignmentApi';

// Mock the index module
vi.mock('.', () => ({
  backend: {
    url: 'http://localhost:8000',
    token: 'test-token',
    user: { id: 'user-1', name: 'Test User', email: 'test@test.com' },
  },
}));

let mockErrorStatus: number | null = null;
let mockRoleAssignments: any = null;
/** Every non-GET request the component issued, in order. */
let mockRequests: Array<{ url: string; method: string; body: any }> = [];

// Mock the baseQuery module to prevent actual API calls
vi.mock('@clarion-app/frontend-base', () => ({
  createBackendConfig: () => ({ backend: { url: 'http://localhost:8000', user: { id: '', name: '', email: '' } }, updateFrontend: () => {} }),
  createBaseQuery: () => async (args: any) => {
    const url = typeof args === 'string' ? args : args?.url;
    if (args?.method) {
      mockRequests.push({ url, method: args.method, body: args.body });
      return { data: { id: 'conv-new' } };
    }
    // Return error for messages endpoint when mockErrorStatus is set
    if (url && url.includes('/message') && mockErrorStatus) {
      return { error: { status: mockErrorStatus, data: { message: 'Error' } } };
    }
    if (url === '/role-assignment') {
      return { data: mockRoleAssignments };
    }
    return { data: [] };
  },
}));

const mockListen = vi.fn().mockReturnThis();
const mockLeave = vi.fn();
const mockPrivate = vi.fn().mockReturnValue({ listen: mockListen });

function setupEcho() {
  (window as any).Echo = {
    private: mockPrivate,
    leave: mockLeave,
    channel: vi.fn().mockReturnValue({ listen: mockListen }),
  };
}

function createTestStore() {
  return configureStore({
    reducer: {
      [conversationApi.reducerPath]: conversationApi.reducer,
      [messageApi.reducerPath]: messageApi.reducer,
      [modelApi.reducerPath]: modelApi.reducer,
      [serverApi.reducerPath]: serverApi.reducer,
      [roleAssignmentApi.reducerPath]: roleAssignmentApi.reducer,
    },
    middleware: (getDefault) =>
      getDefault().concat(
        conversationApi.middleware,
        messageApi.middleware,
        modelApi.middleware,
        serverApi.middleware,
        roleAssignmentApi.middleware,
      ),
  });
}

// Dynamic import to allow mocks to be set up first
const { default: Conversation } = await import('./Conversation');

describe('Conversation - Private Channels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockErrorStatus = null;
    mockRoleAssignments = null;
    mockRequests = [];
    setupEcho();
    cleanup();
  });

  it('uses Echo.private() instead of Echo.channel()', () => {
    const store = createTestStore();
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/conversations/conv-1']}>
          <Routes>
            <Route path="/conversations/:id" element={<Conversation />} />
          </Routes>
        </MemoryRouter>
      </Provider>,
    );

    expect(mockPrivate).toHaveBeenCalledWith('Conversation.conv-1');
    expect((window as any).Echo.channel).not.toHaveBeenCalled();
  });

  it('registers all 4 event listeners on the private channel', () => {
    const store = createTestStore();
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/conversations/conv-1']}>
          <Routes>
            <Route path="/conversations/:id" element={<Conversation />} />
          </Routes>
        </MemoryRouter>
      </Provider>,
    );

    expect(mockListen).toHaveBeenCalledTimes(4);
    expect(mockListen).toHaveBeenCalledWith(
      '.ClarionApp\\LlmClient\\Events\\UpdateOpenAIConversationResponseEvent',
      expect.any(Function),
    );
    expect(mockListen).toHaveBeenCalledWith(
      '.ClarionApp\\LlmClient\\Events\\FinishOpenAIConversationResponseEvent',
      expect.any(Function),
    );
    expect(mockListen).toHaveBeenCalledWith(
      '.ClarionApp\\LlmClient\\Events\\NewConversationMessageEvent',
      expect.any(Function),
    );
    expect(mockListen).toHaveBeenCalledWith(
      '.ClarionApp\\LlmClient\\Events\\ApiCallConfirmationRequiredEvent',
      expect.any(Function),
    );
  });

  it('calls Echo.leave() on cleanup', () => {
    const store = createTestStore();
    const { unmount } = render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/conversations/conv-1']}>
          <Routes>
            <Route path="/conversations/:id" element={<Conversation />} />
          </Routes>
        </MemoryRouter>
      </Provider>,
    );

    unmount();
    expect(mockLeave).toHaveBeenCalledWith('Conversation.conv-1');
  });
});

describe('Conversation - Error Handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockErrorStatus = null;
    mockRoleAssignments = null;
    mockRequests = [];
    setupEcho();
    cleanup();
  });

  it('shows permission message on 403 error', async () => {
    mockErrorStatus = 403;
    const store = createTestStore();
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/conversations/conv-1']}>
          <Routes>
            <Route path="/conversations/:id" element={<Conversation />} />
          </Routes>
        </MemoryRouter>
      </Provider>,
    );

    await waitFor(() => {
      expect(screen.getByText("You don't have permission to access this conversation.")).toBeTruthy();
    });
  });

  it('shows not-found message on 404 error', async () => {
    mockErrorStatus = 404;
    const store = createTestStore();
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/conversations/conv-1']}>
          <Routes>
            <Route path="/conversations/:id" element={<Conversation />} />
          </Routes>
        </MemoryRouter>
      </Provider>,
    );

    await waitFor(() => {
      expect(screen.getByText('Conversation not found.')).toBeTruthy();
    });
  });
});

describe('Conversation - default model comes from the inference role', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockErrorStatus = null;
    mockRoleAssignments = null;
    mockRequests = [];
    setupEcho();
    cleanup();
  });

  function roleAssignments(effective: any) {
    const empty = { status: 'unassigned', scope: null, server: null, model: null, reason: null };
    return {
      inference: { role: 'inference', effective, user_assignment: null, installation_assignment: null },
      embedding: { role: 'embedding', effective: empty, user_assignment: null, installation_assignment: null },
      image: { role: 'image', effective: empty, user_assignment: null, installation_assignment: null },
    };
  }

  async function startAConversation() {
    const store = createTestStore();
    render(
      <Provider store={store}>
        <MemoryRouter initialEntries={['/conversations']}>
          <Routes>
            <Route path="/conversations" element={<Conversation />} />
          </Routes>
        </MemoryRouter>
      </Provider>,
    );

    const textarea = await screen.findByPlaceholderText('Type your message here...');
    fireEvent.change(textarea, { target: { value: 'Hello' } });
    fireEvent.keyDown(textarea, { key: 'Enter' });
  }

  it('creates the conversation with the effective inference model and server', async () => {
    // FR-015: the conversational default is the inference role — not the
    // superseded per-user setting, and not "whichever server is first".
    mockRoleAssignments = roleAssignments({
      status: 'resolved',
      scope: 'installation',
      server: { id: 'srv-role', name: 'Role Server' },
      model: 'role-model',
      reason: null,
    });

    await startAConversation();

    await waitFor(() => {
      const created = mockRequests.find((r) => r.method === 'POST' && r.url === '/conversation');
      expect(created).toBeTruthy();
      expect(created!.body.server_id).toBe('srv-role');
      expect(created!.body.model).toBe('role-model');
    });
  });

  it('sends no model when the inference role resolves to nothing', async () => {
    // The backend owns the "no inference model is assigned" answer (its 422);
    // this screen must not paper over it by picking a server itself.
    mockRoleAssignments = roleAssignments({
      status: 'unassigned', scope: null, server: null, model: null, reason: null,
    });

    await startAConversation();

    await waitFor(() => {
      const created = mockRequests.find((r) => r.method === 'POST' && r.url === '/conversation');
      expect(created).toBeTruthy();
      expect(created!.body.server_id).toBeNull();
      expect(created!.body.model).toBeNull();
    });
  });
});
