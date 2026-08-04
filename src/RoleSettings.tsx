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

  const [selectedUserOverrides, setSelectedUserOverrides] = useState<
    Record<string, { server_id: string; model: string }>
  >({});
  const [selectedInstallationOverrides, setSelectedInstallationOverrides] = useState<
    Record<string, { server_id: string; model: string }>
  >({});

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

  // FR-027: say what is missing and where to go, rather than rendering three
  // empty dropdowns. Both halves of the edge case are handled — no servers at
  // all, and servers that have not reported any models yet.
  if (!servers || servers.length === 0) {
    return (
      <div className="container">
        <h1 className="title">Model Roles</h1>
        <p>No servers configured. Please add a server first.</p>
      </div>
    );
  }

  if (!allModels || allModels.length === 0) {
    return (
      <div className="container">
        <h1 className="title">Model Roles</h1>
        <p>
          No models are known on any configured server yet. Refresh the models on a server
          before assigning roles.
        </p>
      </div>
    );
  }

  if (!assignments) {
    return <div className="container"><p>Loading...</p></div>;
  }

  // ---- User-scope handlers ----
  const handleUserSelectChange = (role: string, value: string) => {
    const [serverId, modelName] = value.split(':');
    setSelectedUserOverrides((prev) => ({
      ...prev,
      [role]: { server_id: serverId, model: modelName },
    }));
  };

  const handleSaveUserRole = async (role: string) => {
    const override = selectedUserOverrides[role];
    if (!override) return;
    await setRoleAssignment({
      role: role as 'inference' | 'embedding' | 'image',
      scope: 'user',
      server_id: override.server_id,
      model: override.model,
    }).unwrap();
  };

  const handleClearUserRole = async (role: string) => {
    await clearRoleAssignment({
      role: role as 'inference' | 'embedding' | 'image',
      scope: 'user',
    }).unwrap();
    setSelectedUserOverrides((prev) => {
      const next = { ...prev };
      delete next[role];
      return next;
    });
  };

  // ---- Installation-scope handlers ----
  const handleInstallationSelectChange = (role: string, value: string) => {
    const [serverId, modelName] = value.split(':');
    setSelectedInstallationOverrides((prev) => ({
      ...prev,
      [role]: { server_id: serverId, model: modelName },
    }));
  };

  const handleSaveInstallationRole = async (role: string) => {
    const override = selectedInstallationOverrides[role];
    if (!override) return;
    await setRoleAssignment({
      role: role as 'inference' | 'embedding' | 'image',
      scope: 'installation',
      server_id: override.server_id,
      model: override.model,
    }).unwrap();
  };

  const handleClearInstallationRole = async (role: string) => {
    await clearRoleAssignment({
      role: role as 'inference' | 'embedding' | 'image',
      scope: 'installation',
    }).unwrap();
    setSelectedInstallationOverrides((prev) => {
      const next = { ...prev };
      delete next[role];
      return next;
    });
  };

  const getOptionsForServer = (serverId: string): LanguageModelType[] => {
    return modelsByServer[serverId] || [];
  };

  // ---- Build the options list (shared) ----
  const buildOptions = () => {
    const elements: JSX.Element[] = [];
    elements.push(<option key="" value="">-- Select a model --</option>);
    for (const server of servers || []) {
      const models = getOptionsForServer(server.id!);
      if (models.length === 0) continue;
      elements.push(
        <optgroup key={server.id} label={server.name}>
          {models.map((model: LanguageModelType) => (
            <option key={`${server.id}:${model.name}`} value={`${server.id}:${model.name}`}>
              {model.name}
            </option>
          ))}
        </optgroup>
      );
    }
    return elements;
  };

  // ---- Render one scope column (user or installation) ----
  const renderScopeColumn = (
    roleKey: string,
    scope: 'user' | 'installation',
    assignment: { server_id: string; model: string } | null,
    label: string,
  ) => {
    const selectedMap = scope === 'user' ? selectedUserOverrides : selectedInstallationOverrides;
    const handleSelectChange = scope === 'user'
      ? handleUserSelectChange
      : handleInstallationSelectChange;
    const handleSave = scope === 'user'
      ? handleSaveUserRole
      : handleSaveInstallationRole;
    const handleClear = scope === 'user'
      ? handleClearUserRole
      : handleClearInstallationRole;

    // A pending selection wins over the saved assignment: the <select> is
    // controlled, so reading the assignment first would snap the dropdown back
    // to the saved value the moment the user picked anything else.
    const currentServerId = selectedMap[roleKey]?.server_id || assignment?.server_id || '';
    const currentModel = selectedMap[roleKey]?.model || assignment?.model || '';

    return (
      <div className="column is-half">
        <p className="heading">{label}</p>

        {assignment === null && scope === 'user' ? (
          <p className="help">Using installation default (if set).</p>
        ) : assignment === null && scope === 'installation' ? (
          <p className="help">Not set.</p>
        ) : null}

        <div className="field">
          <div className="select is-fullwidth">
            <select
              value={`${currentServerId}:${currentModel}`}
              onChange={(e) => handleSelectChange(roleKey, e.target.value)}
            >
              {buildOptions()}
            </select>
          </div>
        </div>

        <div className="field is-grouped">
          <button
            className="button is-primary is-small"
            disabled={!selectedMap[roleKey] || !selectedMap[roleKey].server_id}
            onClick={() => handleSave(roleKey)}
          >
            Save
          </button>
          {assignment && (
            <button
              className="button is-warning is-small"
              onClick={() => handleClear(roleKey)}
            >
              Clear
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderRoleSection = (roleKey: string, descriptor: RoleDescriptor) => {
    const { effective, user_assignment, installation_assignment } = descriptor;
    const label = ROLE_LABELS[roleKey] || roleKey;

    return (
      <div key={roleKey} className="box mb-4">
        <h2 className="subtitle">{label}</h2>

        <div className="content mb-3">
          {effective.status === 'unassigned' ? (
            <p>
              <strong>Unassigned.</strong> {WHAT_BREAKS[roleKey]}
            </p>
          ) : effective.status === 'broken' ? (
            /* FR-013: name the model that vanished, and say what that costs. */
            <p>
              <strong>Broken.</strong> The assigned model{effective.model ? ` "${effective.model}"` : ''} is
              no longer available{effective.reason ? ` (${effective.reason})` : ''}
              {effective.scope ? ` — assigned at ${effective.scope} scope` : ''}. {WHAT_BREAKS[roleKey]}
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

        <div className="columns">
          {renderScopeColumn(roleKey, 'user', user_assignment, 'Your override')}
          {renderScopeColumn(roleKey, 'installation', installation_assignment, 'Installation default')}
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
