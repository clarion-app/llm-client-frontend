import { BackendType } from "@clarion-app/types";
import { conversationApi as llmClientConversationApi } from "./conversationApi";
import { useConfirmApiCallMutation } from "./conversationApi";
import { serverApi as llmClientServerApi } from "./serverApi";
import { modelApi as llmClientModelApi } from "./modelApi";
import { messageApi as llmClientMessageApi } from "./messageApi";
import { userSettingApi as llmClientUserSettingApi } from "./userSettingApi";
import Servers from "./Servers";
import Models from "./Models";
import AllModels from "./AllModels";
import Conversation from "./Conversation";
import Conversations from "./Conversations";
import ApiCallConfirmation from "./ApiCallConfirmation";
import UserSettings from "./UserSettings";

export const backend: BackendType = { url: "http://localhost:8000", user: { id: "", name: "", email: ""} };

export const updateFrontend = (config: BackendType) => {
    backend.url = config.url;
    backend.user = config.user;
};

export { llmClientConversationApi, llmClientServerApi, llmClientModelApi, llmClientMessageApi, llmClientUserSettingApi, useConfirmApiCallMutation, AllModels, ApiCallConfirmation, Conversation, Conversations, Models, Servers, UserSettings };
