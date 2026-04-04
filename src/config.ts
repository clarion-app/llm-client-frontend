import { BackendType } from '@clarion-app/types';
import { createBackendConfig } from '@clarion-app/frontend-base';

const _config = createBackendConfig();
export const backend: BackendType = _config.backend;
export const updateFrontend: (config: BackendType) => void = _config.updateFrontend;
