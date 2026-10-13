import { FormEvent, useId, useState } from "react";
import { AnswerMethod, QuestionChoice, QuestionState, QuestionView } from "./types";
import { useAnswerQuestionMutation } from "./messageApi";

interface QuestionFormProps {
  question: QuestionView;
}

const EMPTY_ANSWER = "Choose an option or type an answer.";
const SEND_FAILED = "Couldn't send your answer — try again.";

const METHOD_SUFFIX: Record<AnswerMethod, string> = {
  web_form: "(from the web form)",
  messaging_option: "(from Telegram)",
  typed_reply: "(typed reply)",
};

// Used only when the server sends no outcome text of its own.
const RESOLVED_TEXT: Record<Exclude<QuestionState, "pending" | "answered">, string> = {
  expired: "Expired — no longer awaiting a reply.",
  withdrawn: "Withdrawn.",
  undeliverable: "Could not be delivered.",
  expired_assumed: "Expired — the agent continued on its stated assumption.",
  stopped: "Expired — work stopped. Answer to resume.",
};

const NOT_PENDING_TEXT: Record<Exclude<QuestionState, "pending">, string> = {
  answered: "This question was already answered.",
  expired: "This question expired and is no longer awaiting a reply.",
  withdrawn: "This question was withdrawn and is no longer awaiting a reply.",
  undeliverable: "This question could not be delivered.",
  expired_assumed: "This question expired and the agent continued on its stated assumption.",
  stopped: "Work on this question stopped at its deadline. Answer it to resume.",
};

function choiceLabel(choice: QuestionChoice): string {
  return `${choice.number}. ${choice.text}`;
}

function outcomeText(question: QuestionView): string {
  if (question.outcome_text) {
    return question.outcome_text;
  }
  if (question.state === "answered") {
    const answer = question.answer;
    if (!answer) {
      return "Answered.";
    }
    const given = answer.is_selection ? answer.selected.map(choiceLabel).join(", ") : answer.raw_reply;
    const suffix = answer.method ? ` ${METHOD_SUFFIX[answer.method]}` : "";
    return `Answered: ${given}${suffix}`;
  }
  if (question.state === "pending") {
    return "";
  }
  return RESOLVED_TEXT[question.state];
}

type Feedback = { role: "alert" | "status"; text: string } | null;

// Read-only rendering of a question that is no longer pending: the question,
// its full numbered choices, and how it was resolved.
function ResolvedQuestion({ question }: QuestionFormProps) {
  return (
    <div className="agent-question">
      {question.preamble && <p className="whitespace-pre-wrap mb-2">{question.preamble}</p>}
      <p className="whitespace-pre-wrap font-semibold">{question.question}</p>
      {question.choices.length > 0 && (
        <ol className="my-2" style={{ listStyle: "none", paddingLeft: 0 }}>
          {question.choices.map((choice) => (
            <li key={choice.number}>{choiceLabel(choice)}</li>
          ))}
        </ol>
      )}
      <p className="mt-2 italic">{outcomeText(question)}</p>
    </div>
  );
}

// The web form for a question that still takes an answer: pending, or
// stopped at its deadline (shown with its outcome line above the form).
// Built only from native, labelled form controls with no custom key
// handling, so the browser's own keyboard and assistive-technology behavior
// operates it.
function PendingQuestion({ question }: QuestionFormProps) {
  const baseId = useId();
  const headingId = `${baseId}-question`;
  const textId = `${baseId}-text`;
  const [answerQuestion, { isLoading }] = useAnswerQuestionMutation();
  const [selected, setSelected] = useState<number[]>([]);
  const [somethingElse, setSomethingElse] = useState(false);
  const [text, setText] = useState("");
  const [feedback, setFeedback] = useState<Feedback>(null);

  const hasChoices = question.choices.length > 0;
  const multiple = question.allow_multiple;
  const stillPending = question.state === "pending";
  const statement = stillPending && question.expiry_statement ? question.expiry_statement : null;
  const outcome = !stillPending && question.outcome_text ? question.outcome_text : null;
  const textEnabled = !hasChoices || somethingElse;

  const pickSingle = (number: number) => {
    setSelected([number]);
    setSomethingElse(false);
  };

  const toggleMultiple = (number: number) => {
    setSelected((current) =>
      current.includes(number) ? current.filter((n) => n !== number) : [...current, number],
    );
  };

  const chooseSomethingElse = (on: boolean) => {
    setSomethingElse(on);
    if (on) {
      setSelected([]);
    }
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isLoading) {
      return;
    }

    // A selection or text, never both.
    const empty = textEnabled ? text.trim() === "" : selected.length === 0;
    if (empty) {
      setFeedback({ role: "alert", text: EMPTY_ANSWER });
      return;
    }
    const args = textEnabled
      ? { questionId: question.id, text }
      : { questionId: question.id, selected: [...selected].sort((a, b) => a - b) };

    setFeedback(null);
    try {
      await answerQuestion(args).unwrap();
    } catch (error: unknown) {
      const failure = error as {
        status?: unknown;
        data?: { state?: unknown; message?: unknown; question?: { outcome_text?: unknown } | null };
      };
      if (failure?.status === 409) {
        const state = failure.data?.state as Exclude<QuestionState, "pending"> | undefined;
        // The server's own description of how the question was resolved
        // (e.g. naming the assumption the agent proceeded on) wins over the
        // generic text kept for older servers.
        const serverText = failure.data?.question?.outcome_text;
        const text =
          typeof serverText === "string" && serverText.trim() !== ""
            ? serverText
            : (state && NOT_PENDING_TEXT[state]) || NOT_PENDING_TEXT.answered;
        setFeedback({ role: "status", text });
      } else if (failure?.status === 422 && typeof failure.data?.message === "string") {
        setFeedback({ role: "alert", text: failure.data.message });
      } else {
        setFeedback({ role: "alert", text: SEND_FAILED });
      }
    }
  };

  const textArea = (
    <div className="mt-2">
      <label htmlFor={textId} className="block">Your answer</label>
      <textarea
        id={textId}
        className="w-full border rounded p-1"
        rows={3}
        value={text}
        disabled={!textEnabled || isLoading}
        onChange={(event) => setText(event.target.value)}
      />
    </div>
  );

  return (
    <form className="agent-question" aria-labelledby={headingId} onSubmit={onSubmit} noValidate>
      {question.preamble && <p className="whitespace-pre-wrap mb-2">{question.preamble}</p>}
      {outcome && (
        // One status line at a time: a server reply to a submission takes
        // the role while it is shown.
        <p role={feedback?.role === "status" ? undefined : "status"} className="mb-2 italic">
          {outcome}
        </p>
      )}
      {hasChoices ? (
        <fieldset>
          <legend id={headingId} className="whitespace-pre-wrap font-semibold">{question.question}</legend>
          {question.choices.map((choice) => (
            <label key={choice.number} className="block">
              {multiple ? (
                <input
                  type="checkbox"
                  className="mr-2"
                  checked={selected.includes(choice.number)}
                  disabled={somethingElse || isLoading}
                  onChange={() => toggleMultiple(choice.number)}
                />
              ) : (
                <input
                  type="radio"
                  className="mr-2"
                  name={`question-${question.id}`}
                  checked={!somethingElse && selected.includes(choice.number)}
                  disabled={isLoading}
                  onChange={() => pickSingle(choice.number)}
                />
              )}
              {choiceLabel(choice)}
            </label>
          ))}
          <label className="block">
            {multiple ? (
              <input
                type="checkbox"
                className="mr-2"
                checked={somethingElse}
                disabled={isLoading}
                onChange={(event) => chooseSomethingElse(event.target.checked)}
              />
            ) : (
              <input
                type="radio"
                className="mr-2"
                name={`question-${question.id}`}
                checked={somethingElse}
                disabled={isLoading}
                onChange={() => chooseSomethingElse(true)}
              />
            )}
            Answer with something else
          </label>
          {textArea}
        </fieldset>
      ) : (
        <>
          <p id={headingId} className="whitespace-pre-wrap font-semibold">{question.question}</p>
          {textArea}
        </>
      )}
      {statement && <p className="mt-2 whitespace-pre-wrap">{statement}</p>}
      {feedback && (
        <p role={feedback.role} className={feedback.role === "alert" ? "mt-2 text-red-600" : "mt-2"}>
          {feedback.text}
        </p>
      )}
      <button type="submit" className="mt-2 px-3 py-1 border rounded" disabled={isLoading}>
        Submit answer
      </button>
    </form>
  );
}

/** A decimal string trimmed to at least two places ("1.0000000000" → "1.00"). */
function allowanceAmount(value: string | null | undefined): string {
  if (!value) {
    return "";
  }
  const [whole, fraction = ""] = value.split(".");
  const trimmed = fraction.replace(/0+$/, "");
  return `${whole}.${trimmed.padEnd(2, "0")}`;
}

// The prompt raised when a task reaches its budget ceiling: its three
// decisions, the task's standing, and for continue the allowance to add.
function TaskBudgetPrompt({ question }: QuestionFormProps) {
  const baseId = useId();
  const headingId = `${baseId}-question`;
  const [answerQuestion, { isLoading }] = useAnswerQuestionMutation();
  const reached = question.reached ?? [];
  const offeredSteps = reached.includes("steps") && question.offered_allowance?.steps != null ? String(question.offered_allowance.steps) : "";
  const offeredSpend = reached.includes("spend") ? allowanceAmount(question.offered_allowance?.spend) : "";
  const [selected, setSelected] = useState<number | null>(null);
  const [steps, setSteps] = useState(offeredSteps);
  const [spend, setSpend] = useState(offeredSpend);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const outcome = question.state !== "pending" && question.outcome_text ? question.outcome_text : null;
  const statement = question.state === "pending" && question.expiry_statement ? question.expiry_statement : null;

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isLoading) {
      return;
    }
    if (selected === null) {
      setFeedback({ role: "alert", text: "Choose what should happen next." });
      return;
    }
    const edited = selected === 1 && (steps.trim() !== offeredSteps || spend.trim() !== offeredSpend);
    const args = edited
      ? {
          questionId: question.id,
          text: ["continue", steps.trim() !== "" ? `steps=${steps.trim()}` : null, spend.trim() !== "" ? `spend=${spend.trim()}` : null]
            .filter((part) => part !== null)
            .join(" "),
        }
      : { questionId: question.id, selected: [selected] };
    setFeedback(null);
    try {
      await answerQuestion(args).unwrap();
    } catch (error: unknown) {
      const failure = error as { status?: unknown; data?: { message?: unknown; question?: { outcome_text?: unknown } | null } };
      const serverText = failure?.data?.question?.outcome_text ?? failure?.data?.message;
      setFeedback(
        typeof serverText === "string" && serverText.trim() !== ""
          ? { role: failure?.status === 409 ? "status" : "alert", text: serverText }
          : { role: "alert", text: SEND_FAILED },
      );
    }
  };

  return (
    <form className="agent-question" aria-labelledby={headingId} onSubmit={onSubmit} noValidate>
      {question.preamble && <p className="whitespace-pre-wrap mb-2">{question.preamble}</p>}
      {question.standing?.label && <p className="mb-2">{question.standing.label}</p>}
      {outcome && (
        <p role={feedback?.role === "status" ? undefined : "status"} className="mb-2 italic">
          {outcome}
        </p>
      )}
      <fieldset>
        <legend id={headingId} className="whitespace-pre-wrap font-semibold">{question.question}</legend>
        {question.choices.map((choice) => (
          <label key={choice.number} className="block">
            <input
              type="radio"
              className="mr-2"
              name={`question-${question.id}`}
              checked={selected === choice.number}
              disabled={isLoading}
              onChange={() => setSelected(choice.number)}
            />
            {choiceLabel(choice)}
          </label>
        ))}
      </fieldset>
      {selected === 1 && (
        <div className="mt-2">
          <label htmlFor={`${baseId}-steps`} className="block">Additional steps</label>
          <input id={`${baseId}-steps`} type="number" min={1} value={steps} disabled={isLoading} onChange={(e) => setSteps(e.target.value)} className="border rounded p-1" />
          <label htmlFor={`${baseId}-spend`} className="block">Additional spend{question.standing ? ` (${question.standing.spend.currency})` : ""}</label>
          <input id={`${baseId}-spend`} type="text" inputMode="decimal" value={spend} disabled={isLoading} onChange={(e) => setSpend(e.target.value)} className="border rounded p-1" />
        </div>
      )}
      {statement && <p className="mt-2 whitespace-pre-wrap">{statement}</p>}
      {feedback && (
        <p role={feedback.role} className={feedback.role === "alert" ? "mt-2 text-red-600" : "mt-2"}>
          {feedback.text}
        </p>
      )}
      <button type="submit" className="mt-2 px-3 py-1 border rounded" disabled={isLoading}>
        Submit answer
      </button>
    </form>
  );
}

export function QuestionForm({ question }: QuestionFormProps) {
  // An older server sends no `answerable`: only a pending question took an
  // answer there.
  const answerable = question.answerable ?? question.state === "pending";
  if (!answerable) {
    return <ResolvedQuestion question={question} />;
  }
  if (question.kind === "task_budget") {
    return <TaskBudgetPrompt question={question} />;
  }
  return <PendingQuestion question={question} />;
}

export default QuestionForm;
