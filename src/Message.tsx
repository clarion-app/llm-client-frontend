import { useState } from "react";
import { MessageType, ApiCallConfirmationType } from "./types";
import Markdown from "markdown-to-jsx";
import CodeBlock from "./CodeBlock";
import ApiCallConfirmation from "./ApiCallConfirmation";
import { QuestionForm } from "./QuestionForm";

interface MessagePropsType extends MessageType {
  onDelete: (messageId: string) => void;
}

// The `kind` marker of a message's tool_data, which may arrive as an object
// or as a JSON string.
function toolDataKind(toolData: unknown): string | null {
  let value = toolData;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (value && typeof value === 'object' && typeof (value as { kind?: unknown }).kind === 'string') {
    return (value as { kind: string }).kind;
  }
  return null;
}

// Questions an agent asks the user, their follow-up notices, and the user's
// answers are plain text whose numbered lines must be shown exactly as
// written, so they bypass markdown and the raw tool-data dump.
function isAgentQuestionMessage(toolData: unknown): boolean {
  return toolDataKind(toolData)?.startsWith('agent_question') ?? false;
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

  // The owner's message list carries the question's current state on its
  // display message; with it the question is shown as a form (or its
  // outcome) in place of the plain text.
  const questionForm = toolDataKind(props.tool_data) === 'agent_question' && props.question
    ? <QuestionForm question={props.question} />
    : null;
  const plainText = isAgentQuestionMessage(props.tool_data);
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
      <div
        className={plainText ? "p-2 message-content whitespace-pre-wrap" : "p-2 message-content"}
        style={plainText ? {overflowWrap: "break-word", whiteSpace: "pre-wrap"} : {overflowWrap: "break-word"}}
      >
        {questionForm ??
        (plainText ?
        props.content :
        !showRaw ?
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
        </pre>)}
        {props.tool_data && !plainText && (
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