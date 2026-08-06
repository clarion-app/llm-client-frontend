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
import { useGetRoleAssignmentsQuery } from "./roleAssignmentApi";
import { skipToken } from "@reduxjs/toolkit/query";
import { backend } from ".";
import { ConversationType, MessageType, ApiCallConfirmationType } from "./types";
import Message from "./Message";
import ApiCallConfirmation from "./ApiCallConfirmation";
import { WindowWS } from "@clarion-app/types";
import { useRef } from "react";
import { errorLog } from "./logger";

interface ConversationPropsType {
  conversation_id?: string;
}

// RTK Query rejects with either a FetchBaseQueryError ({ status, ... }) or a
// SerializedError — neither is imported here to keep this narrow; this guard
// covers the one field both call sites below actually read.
function hasNumericStatus(err: unknown): err is { status: number } {
  return typeof err === "object" && err !== null && typeof (err as { status?: unknown }).status === "number";
}

export interface WebSocketMessageType {
  message_id: string;
  conversation_id: string;
  reply: string;
  tool_data?: string;
}

const Conversation = (props: ConversationPropsType) => {
  const navigate = useNavigate();
  const { id } = useParams();
  const [conversationId, setConversationId] = useState<string | undefined>(
    props.conversation_id || id
  );
  const { data: conversations, refetch: refetchConversations } =
    useGetConversationsQuery(null);
  // The conversational default is the effective inference role — the one place
  // that choice lives now (063-model-roles). When it resolves to nothing, both
  // values stay null and the backend answers with its own resolution or a 422;
  // this screen no longer picks an arbitrary server/model on the user's behalf.
  const { data: roleAssignments } = useGetRoleAssignmentsQuery(null);
  const inference = roleAssignments?.inference?.effective;
  const defaultServer = inference?.status === 'resolved' ? inference.server?.id ?? null : null;
  const defaultModel = inference?.status === 'resolved' ? inference.model : null;
  const [createConversation] = useCreateConversationMutation();
  const [createCommand] = useCreateCommandConversationMutation();
  const [createMessage] = useCreateMessageMutation();
  const [newMessage, setNewMessage] = useState<string>("");
  const {
    data: messages,
    isLoading: messagesLoading,
    isError: messagesError,
    error: messagesErrorData,
    refetch,
  } = useGetMessagesQuery(conversationId ?? skipToken);
  const [updateMessageLocally] = useUpdateMessageLocallyMutation();
  const [deleteConversation] = useDeleteConversationMutation();
  const [pendingConfirmation, setPendingConfirmation] = useState<ApiCallConfirmationType | null>(null);

  const win = window as unknown as WindowWS;

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const refetchRef = useRef(refetch);
  const updateMessageLocallyRef = useRef(updateMessageLocally);

  useEffect(() => { refetchRef.current = refetch; }, [refetch]);
  useEffect(() => { updateMessageLocallyRef.current = updateMessageLocally; }, [updateMessageLocally]);

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 500);
  };

  useEffect(() => {
    if (conversationId === undefined) {
      return;
    }

    const channel = win.Echo.private("Conversation." + conversationId);
    channel
      .listen(
        ".ClarionApp\\LlmClient\\Events\\UpdateOpenAIConversationResponseEvent",
        (message: WebSocketMessageType) => {
          const msg: MessageType = {
            id: message.message_id,
            content: message.reply,
            tool_data: message.tool_data || null,
            conversation_id: message.conversation_id,
            role: "Assistant",
            user: "Assistant",
            updated_at: new Date().toISOString(),
            streaming: true,
            responseTime: 0,
          };
          updateMessageLocallyRef.current(msg);
          scrollToBottom();
        }
      )
      .listen(
        ".ClarionApp\\LlmClient\\Events\\FinishOpenAIConversationResponseEvent",
        () => {
          refetchRef.current();
          scrollToBottom();
        }
      )
      .listen(
        ".ClarionApp\\LlmClient\\Events\\NewConversationMessageEvent",
        () => {
          refetchRef.current();
          scrollToBottom();
        }
      )
      .listen(
        ".ClarionApp\\LlmClient\\Events\\ApiCallConfirmationRequiredEvent",
        (event: ApiCallConfirmationType) => {
          setPendingConfirmation(event);
        }
      );

    return () => {
      win.Echo.leave("Conversation." + conversationId);
    };
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
    let updateConversationId = conversationId;
    if (!updateConversationId) {
      try {
        const result = !isCommand
          ? await createConversation(conversation).unwrap()
          : await createCommand({ command: newMessage }).unwrap();
        updateConversationId = result.id;
        setConversationId(updateConversationId);
      } catch (err: unknown) {
        if (hasNumericStatus(err) && err.status === 422) {
          errorLog("No inference model resolved for the conversation", err);
          alert("No inference model is assigned. Choose one in LLM settings — or add a server first if there are none.");
        } else {
          errorLog("Failed to create conversation", err);
        }
        return;
      }
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

    const createdMessage = await createMessage(message);
    if (!createdMessage) return;
    setNewMessage("");
  };

  const generateTitle = async () => {
    const url = `${backend.url}/api/clarion-app/llm-client/conversation/${conversationId}/generate-title`;
    try {
      const response = await fetch(url, {
        method: "POST",
        credentials: 'include',
        headers: {
          "Content-Type": "application/json",
        },
      });
      if (!response.ok) {
        errorLog("Failed to generate title", { status: response.status, conversationId });
        return;
      }
      refetchConversations();
    } catch (err) {
      errorLog("Failed to generate title", err);
    }
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
      {messagesError && (() => {
        const errStatus = hasNumericStatus(messagesErrorData) ? messagesErrorData.status : undefined;
        if (errStatus === 403) {
          errorLog("Permission denied for conversation", conversationId);
          return <p>You don't have permission to access this conversation.</p>;
        }
        if (errStatus === 404) {
          errorLog("Conversation not found", conversationId);
          return <p>Conversation not found.</p>;
        }
        errorLog("Error loading messages", messagesErrorData);
        return <p>Error loading messages</p>;
      })()}
      <div className="overflow-y-auto h-96 border-2 border-gray-300 rounded-lg p-4 mb-4">
        {messages?.map((message: MessageType) => (
          <Message key={message.id} {...message} onDelete={() => {}} />
        ))}
      </div>
      {pendingConfirmation && (
        <ApiCallConfirmation {...pendingConfirmation} />
      )}
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
      <div ref={messagesEndRef} />
    </div>
  );
};

export default Conversation;
