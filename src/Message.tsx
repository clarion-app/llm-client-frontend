import { useState } from "react";
import { MessageType } from "./types";
import Markdown from "markdown-to-jsx";
import CodeBlock from "./CodeBlock";

interface MessagePropsType extends MessageType {
  onDelete: (messageId: string) => void;
}

const Message = (props: MessagePropsType) => {
  const [showRaw, setShowRaw] = useState(false);
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
      </div>
    </div>
  );
};

export default Message;