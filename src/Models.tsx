import { useParams } from "react-router-dom";

const Models = () => {
    const { serverId } = useParams();
    return <div>
        <h1>Models for server {serverId}</h1>
    </div>;
}

export default Models;