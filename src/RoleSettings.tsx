import { useState, useMemo } from 'react';
import { useGetServersQuery } from './serverApi';
import { useGetAllModelsQuery } from './modelApi';
import {
  useGetRoleAssignmentsQuery,
  useSetRoleAssignmentMutation,
  useClearRoleAssignmentMutation,
} from './roleAssignmentApi';
import { ServerType, LanguageModelType, RoleDescriptor } from './types';

const ROLE_LABELS: Record<string, string> = {
  inference: 'Inference',
  embedding: 'Embedding',
  image: 'Image',
};

const WHAT_BREAKS: Record<string, string> = {
  inference: 'Starting a new conversation without explicitly choosing a model will fail.',
  embedding: 'Semantic memory search and automatic memory retrieval will be unavailable.',
  image: 'Nothing currently consumes this role — reserved for future image generation.',
};

const RoleSettings = () => {
  const { data: servers, isLoading: serversLoading } = useGetServersQuery(null);
  const { data: allModels, isLoading: modelsLoading } = useGetAllModelsQuery();
  const { data: assignments, isLoading: assignmentsLoading } = useGetRoleAssignmentsQuery(null);
  const [setRoleAssignment] = useSetRoleAssignmentMutation();
  const [clearRoleAssignment] = useClearRoleAssignmentMutation();

  const [selectedOverrides, setSelectedOverrides] = useState<Record<string, { server_id: string; model: string }>>({});

  const isLoading = serversLoading || modelsLoading || assignmentsLoading;

  const modelsByServer = useMemo(() => {
    const map: Record<string, LanguageModelType[]> = {};
    if (!allModels) return map;
    for (const model of allModels) {
      const sid = model.server_id;
      if (!map[sid]) map[sid] = [];
      map[sid].push(model);
    }
    return map;
  }, [allModels]);

  if (isLoading) {
    return <div className="container"><p>Loading...</p></div>;
  }

  if (!servers || servers.length === 0) {
    return (
      <div className="container">
        <h1 className="title">Model Roles</h1>
        <p>No servers configured. Please add a server first.</p>
      </div>
    );
  }

  if (!assignments) {
    return <div className="container"><p>Loading...</p></div>;
  }

  const handleSelectChange = (role: string, value: string) => {
    const [serverId, modelName] = value.split(':');
    setSelectedOverrides((prev) => ({
      ...prev,
      [role]: { server_id: serverId, model: modelName },
    }));
  };

  const handleSaveRole = async (role: string) => {
    const override = selectedOverrides[role];
    if (!override) return;
    await setRoleAssignment({
      role: role as 'inference' | 'embedding' | 'image',
      scope: 'user',
      server_id: override.server_id,
      model: override.model,
    }).unwrap();
  };

  const handleClearRole = async (role: string) => {
    await clearRoleAssignment({
      role: role as 'inference' | 'embedding' | 'image',
      scope: 'user',
    }).unwrap();
    setSelectedOverrides((prev) => {
      const next = { ...prev };
      delete next[role];
      return next;
    });
  };

  const getOptionsForServer = (serverId: string): LanguageModelType[] => {
    return modelsByServer[serverId] || [];
  };

  const renderRoleSection = (roleKey: string, descriptor: RoleDescriptor) => {
    const { effective, user_assignment } = descriptor;
    const label = ROLE_LABELS[roleKey] || roleKey;

    const currentServerId = user_assignment?.server_id || selectedOverrides[roleKey]?.server_id || '';
    const currentModel = user_assignment?.model || selectedOverrides[roleKey]?.model || '';

    return (
      <div key={roleKey} className="box mb-4">
        <h2 className="subtitle">{label}</h2>

        <div className="content">
          {effective.status === 'unassigned' ? (
            <p>
              <strong>Unassigned.</strong> {WHAT_BREAKS[roleKey]}
            </p>
          ) : effective.status === 'broken' ? (
            <p>
              <strong>Broken.</strong> {effective.reason || 'The assigned model is no longer available.'}
            </p>
          ) : (
            <p>
              <strong>Effective model:</strong> {effective.model}
              {effective.server ? ` on ${effective.server.name}` : ''}
              <span className="tag is-small is-info ml-2">
                {effective.scope === 'user' ? 'user' : 'installation'}
              </span>
            </p>
          )}
        </div>

        <div className="field">
          <label className="label">Assign model</label>
          <div className="select is-fullwidth">
            <select
              value={`${currentServerId}:${currentModel}`}
              onChange={(e) => handleSelectChange(roleKey, e.target.value)}
            >
              <option value="">-- Select a model --</option>
              {servers?.map((server: ServerType) => {
                const models = getOptionsForServer(server.id!);
                if (models.length === 0) return null;
                return (
                  <optgroup key={server.id} label={server.name}>
                    {models.map((model: LanguageModelType) => (
                      <option key={`${server.id}:${model.name}`} value={`${server.id}:${model.name}`}>
                        {model.name}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </div>
        </div>

        <div className="field is-grouped">
          <button
            className="button is-primary"
            disabled={!selectedOverrides[roleKey] || !selectedOverrides[roleKey].server_id}
            onClick={() => handleSaveRole(roleKey)}
          >
            Save
          </button>
          {user_assignment && (
            <button
              className="button is-warning"
              onClick={() => handleClearRole(roleKey)}
            >
              Clear override
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="container">
      <h1 className="title">Model Roles</h1>
      {(['inference', 'embedding', 'image'] as const).map((roleKey) =>
        renderRoleSection(roleKey, assignments[roleKey])
      )}
    </div>
  );
};

export default RoleSettings;
