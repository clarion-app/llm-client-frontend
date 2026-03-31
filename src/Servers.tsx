import {
  useGetServersQuery,
  useCreateServerMutation,
  useUpdateServerMutation,
  useDeleteServerMutation,
} from "./serverApi";
import { useState, useRef, useCallback, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ServerType } from "./types";
import { errorLog } from "./logger";

const DEBOUNCE_MS = 500;

const Servers = () => {
  const { data: servers, error, isLoading } = useGetServersQuery(null);
  const [createServer] = useCreateServerMutation();
  const [updateServer] = useUpdateServerMutation();
  const [deleteServer] = useDeleteServerMutation();
  const [newServer, setNewServer] = useState<Partial<ServerType>>({
    name: "",
    server_url: "",
    token: "",
  });
  const navigate = useNavigate();

  // Track which servers have had their token explicitly changed
  const [tokenChanged, setTokenChanged] = useState<Record<string, boolean>>({});
  // Track local edits for debouncing
  const [localEdits, setLocalEdits] = useState<Record<string, Partial<ServerType>>>({});
  const debounceTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const debouncedUpdate = useCallback(
    (serverId: string, updatedFields: Partial<ServerType>, isTokenChanged: boolean) => {
      if (debounceTimers.current[serverId]) {
        clearTimeout(debounceTimers.current[serverId]);
      }
      debounceTimers.current[serverId] = setTimeout(async () => {
        const payload = { ...updatedFields };
        if (!isTokenChanged) {
          delete payload.token;
        }
        try {
          await updateServer({ id: serverId, server: payload }).unwrap();
        } catch (err: any) {
          if (err?.status === 404) {
            errorLog("Server not found", serverId);
          } else {
            errorLog("Failed to update server", err);
          }
        }
      }, DEBOUNCE_MS);
    },
    [updateServer],
  );

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      Object.values(debounceTimers.current).forEach(clearTimeout);
    };
  }, []);

  const handleNewInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setNewServer({ ...newServer, [name]: value });
  };

  const handleExistingInputChange = (event: React.ChangeEvent<HTMLInputElement>, server: ServerType) => {
    const { name, value } = event.target;
    const serverId = server.id!;

    const isTokenField = name === "token";
    if (isTokenField) {
      setTokenChanged((prev) => ({ ...prev, [serverId]: true }));
    }

    const currentEdits = localEdits[serverId] || { name: server.name, server_url: server.server_url };
    const updatedFields = { ...currentEdits, [name]: value };
    setLocalEdits((prev) => ({ ...prev, [serverId]: updatedFields }));

    const isTC = isTokenField ? true : (tokenChanged[serverId] || false);
    debouncedUpdate(serverId, updatedFields, isTC);
  };

  const handleSubmitNewServer = () => {
    createServer(newServer);
    setNewServer({ name: "", server_url: "", token: "" });
  };

  const handleDelete = async (serverId: string) => {
    try {
      await deleteServer(serverId).unwrap();
    } catch (err: any) {
      if (err?.status === 404) {
        errorLog("Server not found", serverId);
      } else {
        errorLog("Failed to delete server", err);
      }
    }
  };

  if (isLoading) return <p>Loading...</p>;
  if (error) return <p>Error loading servers.</p>;

  return (
    <div className="container">
      <h1 className="title">LLM Servers</h1>
      <table className="table is-fullwidth is-striped">
        <thead>
          <tr>
            <th>Name</th>
            <th>URL</th>
            <th>Token (optional)</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {servers?.map((server: ServerType) => {
            const edits = localEdits[server.id!];
            return (
              <tr key={server.id}>
                <td>
                  <input
                    className="input"
                    type="text"
                    value={edits?.name ?? server.name}
                    name="name"
                    onChange={(e) => handleExistingInputChange(e, server)}
                  />
                </td>
                <td>
                  <input
                    className="input"
                    type="text"
                    value={edits?.server_url ?? server.server_url}
                    name="server_url"
                    onChange={(e) => handleExistingInputChange(e, server)}
                  />
                </td>
                <td>
                  <input
                    className="input"
                    type="password"
                    placeholder="••••••••"
                    value={tokenChanged[server.id!] ? (edits?.token ?? "") : ""}
                    name="token"
                    onChange={(e) => handleExistingInputChange(e, server)}
                  />
                </td>
                <td>
                  <button className="button is-primary is-small mr-2"
                    onClick={() => navigate(`/clarion-app/llm-client/servers/${server.id}/models`)}
                  >
                    Models
                  </button>
                  <button
                    className="button is-danger is-small"
                    onClick={() => handleDelete(server.id!)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            );
          })}
          <tr>
            <td>
              <input
                className="input"
                type="text"
                placeholder="New server name"
                value={newServer.name}
                name="name"
                onChange={(e) => handleNewInputChange(e)}
              />
            </td>
            <td>
              <input
                className="input"
                type="text"
                placeholder="New server URL"
                value={newServer.server_url}
                name="server_url"
                onChange={(e) => handleNewInputChange(e)}
              />
            </td>
            <td>
              <input
                className="input"
                type="password"
                placeholder="New server token"
                value={newServer.token || ""}
                name="token"
                onChange={(e) => handleNewInputChange(e)}
              />
            </td>
            <td>
              <button
                className="button is-info is-small"
                onClick={handleSubmitNewServer}
              >
                Add Server
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
};

export default Servers;
