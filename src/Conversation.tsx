import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  useGetConversationsQuery,
  useDeleteConversationMutation,
  useCreateConversationMutation,
  useCreateCommandConversationMutation,
} from "./conversationApi";
import {
  useUpdateMessageLocallyMutation,
  useCreateMessageMutation,
  useGetMessagesQuery,
} from "./messageApi";
import { useGetModelsQuery } from "./modelApi";
import { useGetServersQuery } from "./serverApi";
import { skipToken } from "@reduxjs/toolkit/query";
import { backend } from ".";
import { ConversationType, MessageType } from "./types";
import Message from "./Message";
import { WindowWS } from "@clarion-app/types";
import { useRef } from "react";

interface ConversationPropsType {
  conversation_id?: string;
}

export interface WebSocketMessageType {
  message_id: string;
  conversation_id: string;
  reply: string;
}

const Conversation = (props: ConversationPropsType) => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [conversationId, setConversationId] = useState<string | undefined>(
    props.conversation_id || id
  );
  const { data: conversations, refetch: refetchConversations } =
    useGetConversationsQuery(null);
  const { data: servers } = useGetServersQuery(null);
  const defaultServer = servers?.[1]?.id || null;
  const { data: models } = useGetModelsQuery(defaultServer);
  const defaultModel = models?.[0]?.name || null;
  const [createConversation] = useCreateConversationMutation();
  const [createCommand] = useCreateCommandConversationMutation();
  const [createMessage] = useCreateMessageMutation();
  const [newMessage, setNewMessage] = useState<string>("");
  const {
    data: messages,
    isLoading: messagesLoading,
    isError: messagesError,
    refetch,
  } = useGetMessagesQuery(conversationId ?? skipToken);
  const [updateMessageLocally] = useUpdateMessageLocallyMutation();
  const [deleteConversation] = useDeleteConversationMutation();

  const win = window as unknown as WindowWS;

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 500);
  };

  useEffect(() => {
    if (conversationId === undefined) {
      return;
    }

    win.Echo.channel("Conversation." + conversationId)
      .listen(
        ".ClarionApp\\LlmClient\\Events\\UpdateOpenAIConversationResponseEvent",
        (message: WebSocketMessageType) => {
          const msg: MessageType = {
            id: message.message_id,
            content: message.reply,
            conversation_id: message.conversation_id,
            role: "Assistant",
            user: "Assistant",
            updated_at: new Date().toISOString(),
            streaming: true,
            responseTime: 0,
          };
          updateMessageLocally(msg);
          scrollToBottom();
        }
      )
      .listen(
        ".ClarionApp\\LlmClient\\Events\\FinishOpenAIConversationResponseEvent",
        () => {
          refetch();
          scrollToBottom();
        }
      )
      .listen(
        ".ClarionApp\\LlmClient\\Events\\NewConversationMessageEvent",
        () => {
          refetch();
          scrollToBottom();
        }
      );
  }, [conversationId]);

  const conversation = conversations?.find(
    (conv: ConversationType) => conv.id === conversationId
  ) || {
    id: "",
    character: "Clarion",
    model: defaultModel,
    server_id: defaultServer,
    title: "",
    user_id: backend.user.id,
  };

  const updateConversation = async (isCommand: boolean) => {
    let isNewConversation = false;
    let updateConversationId = conversationId;
    if (!updateConversationId) {
      const { data: newConversation } = !isCommand ? 
        await createConversation(conversation) :
        await createCommand({ command: newMessage });
      if (!newConversation) return;
      updateConversationId = newConversation.id;
      isNewConversation = true;
      setConversationId(updateConversationId);
    }

    if(isCommand) {
      setNewMessage("");
      return;
    }

    const message = {
      conversation_id: updateConversationId,
      content: newMessage,
      role: "User",
      user: backend.user.name,
      streaming: true,
      responseTime: 0,
    };

    setTimeout(async () => {
      const createdMessage = await createMessage(message);
      if (!createdMessage) return;
    }, 1000);
    setNewMessage("");
  };

  const generateTitle = async () => {
    const url = `${backend.url}/api/clarion-app/llm-client/conversation/${conversationId}/generate-title`;
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${backend.token}`,
      },
    });
    setTimeout(() => refetchConversations(), 5000);
  };

  return (
    <div>
      <h3
        className="text-lg font-semibold mb-4"
        onClick={() => {
          if (conversationId) {
            refetchConversations();
            navigate(`/clarion-app/llm-client/conversations/${conversationId}`);
          }
        }}
      >
        {conversation.title || "Conversation"}
      </h3>
      {conversationId && (
        <div>
          <button className="button is-small" onClick={() => generateTitle()}>
            Generate title
          </button>
          <button
            className="button is-danger is-small"
            onClick={() => {
              deleteConversation(conversationId);
              setConversationId(undefined);
              navigate("/clarion-app/llm-client/conversations");
            }}
          >
            Delete conversation
          </button>
        </div>
      )}
      {messagesLoading && <p>Loading messages...</p>}
      {messagesError && <p>Error loading messages</p>}
      <div className="overflow-y-auto h-96 border-2 border-gray-300 rounded-lg p-4 mb-4">
        {messages?.map((message: any) => (
          <Message key={message.id} {...message} onDelete={() => {}} />
        ))}
      </div>
      <textarea
        className="w-full h-full border-2 border-gray-300 rounded-lg p-4"
        placeholder="Type your message here..."
        rows={4}
        cols={50}
        value={newMessage}
        onChange={(e) => setNewMessage(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            updateConversation(false);
          }
        }}
      ></textarea>
      <button
        className="button is-primary mt-2"
        onClick={() => {
          updateConversation(true);
        }}>Command</button>
      <div ref={messagesEndRef} />
    </div>
  );
};

export default Conversation;
