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

const RESOLVED_TEXT: Record<Exclude<QuestionState, "pending" | "answered">, string> = {
  expired: "Expired — no longer awaiting a reply.",
  withdrawn: "Withdrawn.",
  undeliverable: "Could not be delivered.",
};

const NOT_PENDING_TEXT: Record<Exclude<QuestionState, "pending">, string> = {
  answered: "This question was already answered.",
  expired: "This question expired and is no longer awaiting a reply.",
  withdrawn: "This question was withdrawn and is no longer awaiting a reply.",
  undeliverable: "This question could not be delivered.",
};

function choiceLabel(choice: QuestionChoice): string {
  return `${choice.number}. ${choice.text}`;
}

function outcomeText(question: QuestionView): string {
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

// The web form for a pending question. Built only from native, labelled
// form controls with no custom key handling, so the browser's own keyboard
// and assistive-technology behavior operates it.
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
      const failure = error as { status?: unknown; data?: { state?: unknown; message?: unknown } };
      if (failure?.status === 409) {
        const state = failure.data?.state as Exclude<QuestionState, "pending"> | undefined;
        setFeedback({ role: "status", text: (state && NOT_PENDING_TEXT[state]) || NOT_PENDING_TEXT.answered });
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
  if (question.state !== "pending") {
    return <ResolvedQuestion question={question} />;
  }
  return <PendingQuestion question={question} />;
}

export default QuestionForm;
