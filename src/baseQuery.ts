import { fetchBaseQuery, BaseQueryFn, FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query/react';
import { backend } from '.';

const rawBaseQuery = (baseUrl: string) => fetchBaseQuery({
  baseUrl: baseUrl,
  prepareHeaders: (headers) => {
    headers.set('Content-Type', 'application/json');
    headers.set('Accept', 'application/json');
    headers.set('Authorization', 'Bearer ' + backend.token);
    return headers;
  }
});

export function baseQuery(): BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> {
  return async (args, api, extraOptions) => {
    const result = await rawBaseQuery((await backend).url + '/api/clarion-app/llm-client')(args, api, extraOptions);
    return result;
  };
}
