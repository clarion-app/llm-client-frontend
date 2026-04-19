import { useState } from "react";
import { MessageType, ApiCallConfirmationType } from "./types";
import Markdown from "markdown-to-jsx";
import CodeBlock from "./CodeBlock";
import ApiCallConfirmation from "./ApiCallConfirmation";

interface MessagePropsType extends MessageType {
  onDelete: (messageId: string) => void;
}

const Message = (props: MessagePropsType) => {
  const [showRaw, setShowRaw] = useState(false);

  if (props.content.startsWith('__pending_api_call:')) {
    try {
      const payload: ApiCallConfirmationType = JSON.parse(props.content.slice('__pending_api_call:'.length));
      return (
        <div className="px-4 py-2 message m-4">
          <ApiCallConfirmation {...payload} />
        </div>
      );
    } catch {
      // Fall through to normal rendering if JSON parse fails
    }
  }

  if (props.content === '__cancelled') {
    return (
      <div className="px-4 py-2 message m-4">
        <div className="notification is-warning">
          API call denied by user.
        </div>
      </div>
    );
  }

  const content = props.content.replace(/```/g, "\n```");
  return (
    <div className="px-4 py-2 message m-4">
      <div className="message-header">
        <span className="text-blue-500 mr-1">{props.user}</span>
        <span className="mr-1">{new Date(props.updated_at!).toLocaleString()}</span>
        {props.responseTime > 0 ? <span>Generated in {props.responseTime} seconds</span> : <></> }
        <button className="m-2" onClick={() => setShowRaw(!showRaw)}>{showRaw ? "Show markdown" : "Show raw"}</button>
        {!props.streaming ? (
          <button
            onClick={() => props.onDelete!(props.id!)}
            className="md:ml-4 mt-6 md:mt-2 px-2 py-1 text-red-500 rounded-md hover:bg-red-500 hover:text-white"
            style={{ float: "right", border: "thin dotted grey" }}
          >
            Delete
          </button>
        ) : (
          ""
        )}
      </div>
      <div className="p-2 message-content" style={{overflowWrap: "break-word"}}>
        {!showRaw ?
        <Markdown
          options={{
            disableParsingRawHTML: true,
            overrides: {
              code: {
                component: CodeBlock,
              },
            },
          }}
        >
          {content}
        </Markdown> :
        <pre className="p-2 m-1" style={{backgroundColor: "#FAFAFA", overflow: "auto"}}>
          {props.content}
        </pre>}
        {props.tool_data && (
          <div className="mt-4 p-2" style={{backgroundColor: "#F0F0F0", borderRadius: "4px"}}>
            <h4 className="font-bold mb-2">Tool Data:</h4>
            <pre style={{whiteSpace: "pre-wrap", wordWrap: "break-word"}}>
              {JSON.stringify(props.tool_data, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};

export default Message;