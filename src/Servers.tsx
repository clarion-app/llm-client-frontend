import {
  useGetServersQuery,
  useCreateServerMutation,
  useUpdateServerMutation,
  useDeleteServerMutation,
  ServerType,
} from "./serverApi";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

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

  const handleNewInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = event.target;
    setNewServer({ ...newServer, [name]: value });
  };

  const handleExistingInputChange = (event: React.ChangeEvent<HTMLInputElement>, server: ServerType) => {
    const { name, value } = event.target;
    const updatedServer = { ...server, [name]: value };
    updateServer({ id: server.id, server: updatedServer });
  };

  const handleSubmitNewServer = () => {
    createServer(newServer);
    setNewServer({ name: "", server_url: "", token: "" }); // Reset the input fields
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
          {servers?.map((server: ServerType) => (
            <tr key={server.id}>
              <td>
                <input
                  className="input"
                  type="text"
                  value={server.name}
                  name="name"
                  onChange={(e) => handleExistingInputChange(e, server)}
                />
              </td>
              <td>
                <input
                  className="input"
                  type="text"
                  value={server.server_url}
                  name="server_url"
                  onChange={(e) => handleExistingInputChange(e, server)}
                />
              </td>
              <td>
                <input
                  className="input"
                  type="text"
                  value={server.token || ""}
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
                  onClick={() => deleteServer(server.id)}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
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
                type="text"
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
