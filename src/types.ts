import { LaravelModelType } from '@clarion-app/types';

export interface LanguageModelType extends LaravelModelType {
  name: string;
  server_id: string;
}

export interface MessageType extends LaravelModelType {
  conversation_id: string;
  content: string;
  role: string;
  user: string;
  streaming: boolean;
  responseTime: number;
}

export interface ConversationType extends LaravelModelType {
  title: string;
  user_id: string;
  server_group_id: string;
  model: string;
  character: string;
  messages?: MessageType[];
  latest_message?: MessageType;
}

export interface ServerType extends LaravelModelType {
    name: string;
    server_url: string;
    token: string;
  }