/**
 * Side-effect module: registers a handler for ServerModelsRefreshed
 * broadcast events. Importing this module wires up the realtime listener.
 *
 * When a broadcast arrives for a cached server_id, the entry is replaced
 * in place via updateQueryData. For an unknown id, the ServerStatus tag
 * is invalidated so the next fetch picks up the new data.
 *
 * A duplicate delivery is harmless — the payload is a full snapshot, not a delta.
 */

import { registerUserChannelHandler } from '@clarion-app/frontend-base';
import { serverStatusApi } from './serverStatusApi';
import type { ServerStatusType } from './types';

registerUserChannelHandler({
    event: '.ClarionApp\\LlmClient\\Events\\ServerModelsRefreshed',
    handler: (payload, dispatch) => {
        const status = payload as ServerStatusType;

        if (!status || typeof status.server_id !== 'string') return;

        // The recipe runs synchronously inside the dispatch below, and only
        // when a cache entry for the query exists — so this flag is settled
        // by the time it is read.
        let replaced = false;

        dispatch(
            serverStatusApi.util.updateQueryData(
                'getServerStatuses',
                undefined,
                (draft) => {
                    if (!draft) return;

                    const idx = draft.findIndex((s) => s.server_id === status.server_id);
                    if (idx === -1) return;

                    draft[idx] = status;
                    replaced = true;
                },
            ),
        );

        // No cache entry, or an id that is not in it (a server added in
        // another tab) — fall back to tag invalidation so the next read fetches it.
        if (!replaced) {
            dispatch(serverStatusApi.util.invalidateTags([{ type: 'ServerStatus' }]));
        }
    },
});
