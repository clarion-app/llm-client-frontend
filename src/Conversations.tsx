import { useNavigate } from "react-router-dom";
import { useGetConversationsQuery } from "./conversationApi";
import { ConversationType } from "./types";

const Conversations = () => {
  const navigate = useNavigate();
  const {
    data: conversations,
    isLoading,
    isError,
  } = useGetConversationsQuery(null);
  
  if (isLoading) {
    return <div>Loading...</div>;
  }
  
  if (isError) {
    return <div>Error loading conversations</div>;
  }

  if (!conversations || conversations.length === 0) {
    return <div>No conversations found</div>;
  }
  const conversationList = conversations.map(
    (conversation: ConversationType) => (
      <div
        key={conversation.id}
        className="border-b border-gray-200 py-2"
        onClick={() => navigate(`/clarion-app/llm-client/conversations/${conversation.id}`)}
        >
          <h3 className="text-lg font-semibold">
            {conversation.title || "Conversation"}
          </h3>
          <p>{conversation.character}</p>
      </div>
    )
  );
  return <div>{conversationList}</div>;
};

export default Conversations;
