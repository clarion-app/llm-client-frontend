import { LaravelModelType } from '@clarion-app/types';

export interface LanguageModelType extends LaravelModelType {
  name: string;
  server_id: string;
}

export interface MessageType extends LaravelModelType {
  conversation_id: string;
  content: string;
  tool_data: string | null;
  role: string;
  user: string;
  streaming: boolean;
  responseTime: number;
}

export interface ConversationType extends LaravelModelType {
  title: string;
  user_id: string;
  server_id: string | null;
  model: string | null;
  character: string;
  channel?: string;
}

export interface ServerType extends LaravelModelType {
  name: string;
  server_url: string;
  token?: string;
}

export interface ApiCallConfirmationType {
  conversation_id: string;
  message_id: string;
  method: string;
  path: string;
  body: Record<string, unknown>;
}

export interface UserSettingType {
  server_id: string | null;
  model: string | null;
}

// Role assignment types
export interface RoleEffective {
  status: 'resolved' | 'unassigned' | 'broken';
  scope: 'user' | 'installation' | null;
  server: { id: string; name: string } | null;
  model: string | null;
  reason: string | null;
}

export interface RoleAssignment {
  server_id: string;
  model: string;
}

export interface RoleDescriptor {
  role: 'inference' | 'embedding' | 'image';
  effective: RoleEffective;
  user_assignment: RoleAssignment | null;
  installation_assignment: RoleAssignment | null;
}

export type RoleAssignmentsType = {
  inference: RoleDescriptor;
  embedding: RoleDescriptor;
  image: RoleDescriptor;
};

export interface SetRoleAssignmentRequest {
  role: 'inference' | 'embedding' | 'image';
  scope: 'user' | 'installation';
  server_id: string;
  model: string;
}

export interface ClearRoleAssignmentRequest {
  role: 'inference' | 'embedding' | 'image';
  scope: 'user' | 'installation';
}