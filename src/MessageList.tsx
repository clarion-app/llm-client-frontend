import { useState, useEffect, useRef, useCallback } from "react";
import { MessageType } from "./types";
import { backend } from ".";
import {
  useGetMessagesQuery,
  useCreateMessageMutation,
  useDeleteMessageMutation,
  useUpdateMessageLocallyMutation,
} from "./messageApi";
import Message from "./Message";
import { fetchPageText } from "./fetchPageText";

interface MessageListPropsType {
  conversation_id: string;
}

interface WebSocketMessageType {
  message_id: string;
  conversation_id: string;
  reply: string;
}

const MessageList = (props: MessageListPropsType) => {
  const isMounted = useRef(true);
  const { data: messages, refetch } = useGetMessagesQuery(
    props.conversation_id
  );
  const [deleteMessage] = useDeleteMessageMutation();
  const [createMessage] = useCreateMessageMutation();
  const [updateMessageLocally] = useUpdateMessageLocallyMutation();
  const [newMessage, setNewMessage] = useState("");
  const [pageUrl, setPageUrl] = useState<string>("");

  const handleDelete = useCallback(
    async (messageId: string) => {
      await deleteMessage(messageId).unwrap();
    },
    [deleteMessage]
  );

  const sendMessage = useCallback(async () => {
    if (newMessage === "" || !isMounted.current) return;
    const message = {
      conversation_id: props.conversation_id,
      content: newMessage,
      role: "User",
      user: backend.user.name,
    };
    createMessage(message);
    setNewMessage("");
    setTimeout(() => refetch(), 500);
  }, [newMessage, props.conversation_id, createMessage, refetch, backend.user]);

  return (
    <div>
      {messages?.map((message: MessageType) => (
        <Message key={message.id} {...message} onDelete={handleDelete} />
      ))}
      <div className="m-4">
          <textarea
            className="p-2 w-full"
            placeholder={"Write a message..."}
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            onKeyUp={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                sendMessage();
              }
            }}
          />
          <button onClick={sendMessage} className="w-full bg-blue-900 mt-2 p-2 text-white">
            Send
          </button>
      </div>
      <div className="m-4">
          <input
            className="p-2 w-full"
            placeholder={"Upload file from URL"}
            value={pageUrl}
            onChange={(e) => setPageUrl(e.target.value)}
            onKeyUp={async (e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                const result = await fetchPageText(pageUrl);
                setNewMessage(result);
                sendMessage();
                setPageUrl("");
              }
            }}
          />
          <button
            className="w-full bg-blue-900 mt-2 p-2 text-white"
            onClick={async () => {
              const result = await fetchPageText(pageUrl);
              setNewMessage(result);
              sendMessage();
              setPageUrl("");
            }}
          >
            Upload
          </button>
        </div>
    </div>
  );
};

export default MessageList;