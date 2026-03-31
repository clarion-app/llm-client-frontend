import { useConfirmApiCallMutation } from "./conversationApi";
import { ApiCallConfirmationType } from "./types";
import { errorLog } from "./logger";

const ApiCallConfirmation = (props: ApiCallConfirmationType) => {
  const [confirmApiCall, { isLoading }] = useConfirmApiCallMutation();

  const handleConfirm = async (approved: boolean) => {
    try {
      await confirmApiCall({
        conversationId: props.conversation_id,
        message_id: props.message_id,
        approved,
      }).unwrap();
    } catch (err) {
      errorLog("Failed to confirm API call", err);
    }
  };

  return (
    <div className="border border-yellow-400 rounded-lg p-4 my-2 bg-yellow-50">
      <div className="font-semibold mb-2">API Call Confirmation Required</div>
      <div className="mb-1">
        <span className="inline-block px-2 py-1 rounded bg-red-100 text-red-800 font-mono font-bold mr-2">
          {props.method}
        </span>
        <span className="font-mono">{props.path}</span>
      </div>
      {props.body && Object.keys(props.body).length > 0 && (
        <pre className="bg-gray-100 p-2 rounded my-2 text-sm overflow-auto">
          {JSON.stringify(props.body, null, 2)}
        </pre>
      )}
      <div className="mt-3 flex gap-2">
        <button
          className="button is-success is-small"
          disabled={isLoading}
          onClick={() => handleConfirm(true)}
        >
          {isLoading ? "Submitting..." : "Approve"}
        </button>
        <button
          className="button is-danger is-small"
          disabled={isLoading}
          onClick={() => handleConfirm(false)}
        >
          {isLoading ? "Submitting..." : "Deny"}
        </button>
      </div>
    </div>
  );
};

export default ApiCallConfirmation;
