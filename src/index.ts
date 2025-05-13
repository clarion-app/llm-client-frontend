import { BackendType } from "@clarion-app/types";
import { conversationApi as llmClientConversationApi } from "./conversationApi";
import { serverApi as llmClientServerApi } from "./serverApi";
import { modelApi as llmClientModelApi } from "./modelApi";
import { messageApi as llmClientMessageApi } from "./messageApi";
import Servers from "./Servers";
import Models from "./Models";
import AllModels from "./AllModels";
import Conversation from "./Conversation";
import Conversations from "./Conversations";

export const backend: BackendType = { url: "http://localhost:8000", token: "", user: { id: "", name: "", email: ""} };

export const updateFrontend = (config: BackendType) => {
    backend.url = config.url;
    backend.token = config.token;
    backend.user = config.user;
};

export { llmClientConversationApi, llmClientServerApi, llmClientModelApi, llmClientMessageApi, AllModels, Conversation, Conversations, Models, Servers };
