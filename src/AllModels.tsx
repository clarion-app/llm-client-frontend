import { useGetAllModelsQuery } from "./modelApi";
import { useGetServersQuery } from "./serverApi";
import { LanguageModelType, ServerType } from "./types";

const Models = () => {
    const { data, error, isLoading } = useGetAllModelsQuery();
    const { data: servers, error: serversError, isLoading: serversIsLoading } = useGetServersQuery(null);

    if (isLoading || serversIsLoading) {
        return <div>Loading...</div>;
    }

    if (error || serversError) {
        return <div>Error: {error ? String(error) : String(serversError) }</div>;
    }

    const serverMap = new Map<string, string>();
    servers?.forEach((server: ServerType) => {
        serverMap.set(server.id!, server.name);
    });
    
    return <div>
        <h1>Models</h1>
        <ul>
            {data?.map((model: LanguageModelType) => (
                <li key={model.id}>{model.name} - {serverMap.get(model.server_id)}</li>
            ))}
        </ul>
    </div>;
}

export default Models;