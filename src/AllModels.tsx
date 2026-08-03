import { useGetAllModelsQuery } from "./modelApi";
import { useGetServersQuery } from "./serverApi";
import { useGetRoleAssignmentsQuery } from "./roleAssignmentApi";
import { LanguageModelType, ServerType, RoleAssignmentsType } from "./types";

const ROLE_DISPLAY_NAMES: Record<string, string> = {
    inference: 'Inference',
    embedding: 'Embedding',
    image: 'Image',
};

interface RoleBadge {
    roleName: string;
    scope: 'user' | 'installation';
}

function buildRoleLookup(roleAssignments: RoleAssignmentsType | undefined): Map<string, RoleBadge[]> {
    const lookup = new Map<string, RoleBadge[]>();

    if (!roleAssignments) return lookup;

    const roles = [roleAssignments.inference, roleAssignments.embedding, roleAssignments.image];

    for (const descriptor of roles) {
        const displayName = ROLE_DISPLAY_NAMES[descriptor.role] ?? descriptor.role;

        // Check user assignment
        if (descriptor.user_assignment) {
            const key = `${descriptor.user_assignment.server_id}::${descriptor.user_assignment.model}`;
            const existing = lookup.get(key) ?? [];
            existing.push({ roleName: displayName, scope: 'user' });
            lookup.set(key, existing);
        }

        // Check installation assignment
        if (descriptor.installation_assignment) {
            const key = `${descriptor.installation_assignment.server_id}::${descriptor.installation_assignment.model}`;
            const existing = lookup.get(key) ?? [];
            existing.push({ roleName: displayName, scope: 'installation' });
            lookup.set(key, existing);
        }
    }

    return lookup;
}

const Models = () => {
    const { data, error, isLoading } = useGetAllModelsQuery();
    const { data: servers, error: serversError, isLoading: serversIsLoading } = useGetServersQuery(null);
    const { data: roleAssignments, isLoading: roleAssignmentsLoading } = useGetRoleAssignmentsQuery(null);

    if (isLoading || serversIsLoading || roleAssignmentsLoading) {
        return <div>Loading...</div>;
    }

    if (error || serversError) {
        return <div>Error: {error ? String(error) : String(serversError) }</div>;
    }

    const serverMap = new Map<string, string>();
    servers?.forEach((server: ServerType) => {
        serverMap.set(server.id!, server.name);
    });

    const roleBadgeLookup = buildRoleLookup(roleAssignments);

    return <div>
        <h1>Models</h1>
        <ul>
            {data?.map((model: LanguageModelType) => {
                const lookupKey = `${model.server_id}::${model.name}`;
                const badges = roleBadgeLookup.get(lookupKey) ?? [];

                return (
                    <li key={model.id}>
                        <span>{model.name} - {serverMap.get(model.server_id)}</span>
                        {badges.length > 0 && (
                            <span className="role-badges">
                                {' '}
                                ({badges.map((b) => `${b.roleName} (${b.scope})`).join(', ')})
                            </span>
                        )}
                    </li>
                );
            })}
        </ul>
    </div>;
}

export default Models;