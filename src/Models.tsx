import { useParams } from "react-router-dom";
import { useGetModelsQuery } from "./modelApi";
import { LanguageModelType } from "./types";

const Models = () => {
    const { id } = useParams();
    const { data, error, isLoading } = useGetModelsQuery(id!);

    if (isLoading) {
        return <div>Loading...</div>;
    }

    if (error) {
        return <div>Error: {String(error)}</div>;
    }

    return <div>
        <h1>Models for server {id}</h1>
        <ul>
            {data?.map((model: LanguageModelType) => (
                <li key={model.id}>{model.name}</li>
            ))}
        </ul>
    </div>;
}

export default Models;