import { BackendType } from "@clarion-app/types";
import { serverApi as llmClientServerApi } from "./serverApi";
import { modelApi as llmClientModelApi } from "./modelApi";
import Servers from "./Servers";
import Models from "./Models";

export const backend: BackendType = { url: "http://localhost:8000", token: "" };

const initializeLLMClientFrontend = (setBackendUrl: string) => {
    backend.url = setBackendUrl;
};

const setLLMClientFrontendToken = (token: string) => {
    backend.token = token;
};

export { initializeLLMClientFrontend, llmClientServerApi, llmClientModelApi, setLLMClientFrontendToken, Servers, Models };
