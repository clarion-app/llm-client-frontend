import { useState, useEffect } from "react";
import { useGetUserSettingQuery, useUpdateUserSettingMutation } from "./userSettingApi";
import { useGetServersQuery } from "./serverApi";
import { useGetModelsQuery } from "./modelApi";
import { skipToken } from "@reduxjs/toolkit/query";
import { ServerType, LanguageModelType } from "./types";
import { errorLog } from "./logger";

const UserSettings = () => {
  const { data: userSetting, isLoading: settingLoading } = useGetUserSettingQuery(null);
  const { data: servers, isLoading: serversLoading } = useGetServersQuery(null);
  const [updateUserSetting] = useUpdateUserSettingMutation();

  const [selectedServerId, setSelectedServerId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string | null>(null);

  const { data: models } = useGetModelsQuery(selectedServerId ?? skipToken);

  useEffect(() => {
    if (userSetting) {
      setSelectedServerId(userSetting.server_id);
      setSelectedModel(userSetting.model);
    }
  }, [userSetting]);

  const handleSave = async () => {
    try {
      await updateUserSetting({
        server_id: selectedServerId,
        model: selectedModel,
      }).unwrap();
    } catch (err) {
      errorLog("Failed to save user settings", err);
    }
  };

  if (settingLoading || serversLoading) {
    return <p>Loading...</p>;
  }

  if (!servers || servers.length === 0) {
    return (
      <div className="container">
        <h1 className="title">LLM Settings</h1>
        <p>No servers configured. Please add a server first.</p>
      </div>
    );
  }

  return (
    <div className="container">
      <h1 className="title">LLM Settings</h1>
      <div className="field">
        <label className="label">Default Server</label>
        <div className="select">
          <select
            value={selectedServerId || ""}
            onChange={(e) => {
              const val = e.target.value || null;
              setSelectedServerId(val);
              setSelectedModel(null);
            }}
          >
            <option value="">-- None --</option>
            {servers.map((server: ServerType) => (
              <option key={server.id} value={server.id!}>
                {server.name}
              </option>
            ))}
          </select>
        </div>
      </div>
      {selectedServerId && (
        <div className="field">
          <label className="label">Default Model</label>
          <div className="select">
            <select
              value={selectedModel || ""}
              onChange={(e) => setSelectedModel(e.target.value || null)}
            >
              <option value="">-- None --</option>
              {models?.map((model: LanguageModelType) => (
                <option key={model.name} value={model.name}>
                  {model.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
      <button className="button is-primary mt-4" onClick={handleSave}>
        Save Settings
      </button>
    </div>
  );
};

export default UserSettings;
