import React from 'react';
import { Navigate, useParams } from 'react-router-dom';

const MODEL_SETUP_PATH = '/clarion-app/llm-client/model-setup';

/**
 * ModelSetupRedirect — stub for the four retired routes
 * (/servers, /servers/:id/models, /models, /settings).
 *
 * Renders <Navigate replace> to the consolidated Model Setup screen. When
 * rendered under a route carrying an :id param (the old per-server "Models"
 * link), forwards it as ?server=<id> so the new screen can land on that
 * server's card (FR-004, research.md D11).
 *
 * Contract: specs/064-model-setup-interface/contracts/frontend-model-setup.md §1
 */
export function ModelSetupRedirect(): React.ReactElement {
  const { id } = useParams<{ id?: string }>();

  const target = id
    ? `${MODEL_SETUP_PATH}?server=${encodeURIComponent(id)}`
    : MODEL_SETUP_PATH;

  return <Navigate to={target} replace />;
}

export default ModelSetupRedirect;
