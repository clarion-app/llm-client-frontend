import { conversationApi as llmClientConversationApi } from "./conversationApi";
import { useConfirmApiCallMutation } from "./conversationApi";
import { serverApi as llmClientServerApi } from "./serverApi";
import { modelApi as llmClientModelApi } from "./modelApi";
import { messageApi as llmClientMessageApi } from "./messageApi";
import { roleAssignmentApi as llmClientRoleAssignmentApi } from "./roleAssignmentApi";
import { serverStatusApi as llmClientServerStatusApi } from "./serverStatusApi";
import { ModelSetup } from "./ModelSetup";
import { ModelSetupRedirect } from "./ModelSetupRedirect";
import Conversation from "./Conversation";
import Conversations from "./Conversations";
import ApiCallConfirmation from "./ApiCallConfirmation";

export { backend, updateFrontend } from './config';

export { llmClientConversationApi, llmClientServerApi, llmClientModelApi, llmClientMessageApi, llmClientRoleAssignmentApi, llmClientServerStatusApi, useConfirmApiCallMutation, ApiCallConfirmation, Conversation, Conversations, ModelSetup, ModelSetupRedirect };

// Side-effect import: registers handler for ServerModelsRefreshed broadcasts
import './serverStatusRealtime';
