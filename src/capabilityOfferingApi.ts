import { createApi } from '@reduxjs/toolkit/query/react';
import { createBaseQuery } from '@clarion-app/frontend-base';
import { backend } from './config';
import type { CapabilityOffering } from './types';

/**
 * Capability offering configuration (109-agent-as-capability, contracts/
 * capability-offering-api.md). `listOfferings`/`offer` cover the two
 * backend endpoints Phase 2 (Foundational) adds — `GET`/`POST
 * agents/{offeredAgentId}/capability-offerings`. `withdraw` (`DELETE
 * agents/{offeredAgentId}/capability-offerings/{callerAgentId}`) is
 * idempotent per the contract — it returns `200 {"removed": bool}` rather
 * than a bare 204, distinct from `agentHelperApi.ts`'s own `removeHelper`.
 */
export const capabilityOfferingApi = createApi({
  reducerPath: 'llm-client-capabilityOfferingApi',
  baseQuery: createBaseQuery({ routePrefix: '/api/clarion-app/llm-client', backendConfig: backend }),
  tagTypes: ['CapabilityOfferings'],
  endpoints: (builder) => ({
    listOfferings: builder.query<{ data: CapabilityOffering[] }, { offeredAgentId: string }>({
      query: ({ offeredAgentId }) => `/agents/${offeredAgentId}/capability-offerings`,
      providesTags: ['CapabilityOfferings'],
    }),
    offer: builder.mutation<
      CapabilityOffering,
      {
        offeredAgentId: string;
        callerAgentId: string;
        capabilityName: string;
        capabilityDescription: string;
        inputDescription: string;
      }
    >({
      query: ({ offeredAgentId, callerAgentId, capabilityName, capabilityDescription, inputDescription }) => ({
        url: `/agents/${offeredAgentId}/capability-offerings`,
        method: 'POST',
        body: {
          caller_agent_id: callerAgentId,
          capability_name: capabilityName,
          capability_description: capabilityDescription,
          input_description: inputDescription,
        },
      }),
      invalidatesTags: ['CapabilityOfferings'],
    }),
    withdraw: builder.mutation<{ removed: boolean }, { offeredAgentId: string; callerAgentId: string }>({
      query: ({ offeredAgentId, callerAgentId }) => ({
        url: `/agents/${offeredAgentId}/capability-offerings/${callerAgentId}`,
        method: 'DELETE',
      }),
      invalidatesTags: ['CapabilityOfferings'],
    }),
  }),
});

export const { useListOfferingsQuery, useOfferMutation, useWithdrawMutation } = capabilityOfferingApi;
