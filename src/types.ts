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