const LOG_PREFIX = '[llm-client]';

export const warnLog = (msg: string, ...args: unknown[]) => console.warn(LOG_PREFIX, msg, ...args);
export const errorLog = (msg: string, ...args: unknown[]) => console.error(LOG_PREFIX, msg, ...args);
