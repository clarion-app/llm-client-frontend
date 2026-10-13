import { FormEvent, useId, useState } from "react";
import { useGetTaskBudgetQuery, useUpdateTaskBudgetMutation } from "./conversationApi";
import { CeilingOrigin, TaskBudgetResponse, TaskBudgetStanding } from "./types";

interface TaskBudgetPanelProps {
  conversationId: string;
  /** Whether the conversation is working right now; the standing is then kept up to date. */
  processing?: boolean;
}

const POLL_MS = 5000;

const ORIGIN_TEXT: Record<CeilingOrigin, string> = {
  default: "default",
  user: "set by you",
  user_reduced_to_maximum: "reduced to the installation maximum",
};

function isStanding(data: TaskBudgetResponse | undefined): data is TaskBudgetStanding {
  return !!data && typeof (data as TaskBudgetStanding).task_budget_id === "string";
}

function stateLabel(s: TaskBudgetStanding): string {
  switch (s.state) {
    case "running":
      return "Running";
    case "paused":
      return s.sub_state === "stopped" ? "Stopped at budget ceiling" : "Paused at budget ceiling — awaiting your decision";
    case "concluded":
      return "Concluded at budget ceiling";
    case "completed":
      return "Completed";
    case "halted":
      return "Stopped at budget ceiling";
    case "ended":
      return "Ended";
    default:
      return s.state;
  }
}

/** A decimal string shown at two places. */
export function money(value: string): string {
  const n = Number(value);
  return Number.isFinite(n) ? n.toFixed(2) : value;
}

function LimitsForm({ conversationId, standing, onDone }: { conversationId: string; standing: TaskBudgetStanding; onDone: () => void }) {
  const baseId = useId();
  const [steps, setSteps] = useState(String(standing.steps.ceiling));
  const [spend, setSpend] = useState(money(standing.spend.ceiling));
  const [feedback, setFeedback] = useState<{ role: "alert" | "status"; text: string } | null>(null);
  const [updateTaskBudget, { isLoading }] = useUpdateTaskBudgetMutation();

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const change: { max_steps?: number; max_spend?: string } = {};
    if (steps.trim() !== "" && Number(steps) !== standing.steps.ceiling) {
      change.max_steps = Number(steps);
    }
    if (spend.trim() !== "" && spend.trim() !== money(standing.spend.ceiling)) {
      change.max_spend = spend.trim();
    }
    if (change.max_steps === undefined && change.max_spend === undefined) {
      onDone();
      return;
    }
    try {
      const result = await updateTaskBudget({ conversationId, ...change }).unwrap();
      const cut: string[] = [];
      if (result.reduced?.steps) cut.push(`steps to ${result.steps.ceiling}`);
      if (result.reduced?.spend) cut.push(`spend to ${money(result.spend.ceiling)} ${result.spend.currency}`);
      setFeedback(
        cut.length > 0
          ? { role: "status", text: `Limits saved; reduced to the installation maximum: ${cut.join(", ")}.` }
          : { role: "status", text: "Limits saved." },
      );
    } catch (error: unknown) {
      const message = (error as { data?: { message?: unknown } })?.data?.message;
      setFeedback({ role: "alert", text: typeof message === "string" ? message : "Couldn't change the limits — try again." });
    }
  };

  return (
    <form onSubmit={onSubmit} noValidate className="mt-2">
      <label htmlFor={`${baseId}-steps`} className="block">Step ceiling</label>
      <input id={`${baseId}-steps`} type="number" min={1} value={steps} onChange={(e) => setSteps(e.target.value)} className="border rounded p-1" />
      <label htmlFor={`${baseId}-spend`} className="block">Spend ceiling</label>
      <input id={`${baseId}-spend`} type="text" inputMode="decimal" value={spend} onChange={(e) => setSpend(e.target.value)} className="border rounded p-1" />
      <button type="submit" disabled={isLoading} className="ml-2 px-2 py-1 border rounded">Save limits</button>
      {feedback && <p role={feedback.role} className={feedback.role === "alert" ? "text-red-600" : ""}>{feedback.text}</p>}
    </form>
  );
}

export function TaskBudgetPanel({ conversationId, processing = false }: TaskBudgetPanelProps) {
  const [paused, setPaused] = useState(false);
  const { data } = useGetTaskBudgetQuery(conversationId, { pollingInterval: processing || paused ? POLL_MS : 0 });
  const [changing, setChanging] = useState(false);

  const standing = isStanding(data) ? data : null;
  // The polling rule needs the state the last read returned, so it is kept
  // from the previous render (React's adjust-state-while-rendering pattern).
  const nowPaused = standing?.state === "paused";
  if (nowPaused !== paused) {
    setPaused(nowPaused);
  }
  if (!standing) {
    return null;
  }

  const changeable = standing.state === "running" || standing.state === "paused";
  const stepsPct = standing.steps.ceiling > 0 ? Math.min(100, (standing.steps.used / standing.steps.ceiling) * 100) : 0;
  const spendCeiling = Number(standing.spend.ceiling);
  const spendPct = spendCeiling > 0 ? Math.min(100, (Number(standing.spend.used) / spendCeiling) * 100) : 0;
  const unpriced = standing.spend.unpriced_request_count;

  return (
    <div data-testid="task-budget-panel" className="border rounded p-2 mb-2">
      <div className="flex items-center gap-2">
        <span className="font-semibold">Limits</span>
        <span data-testid="task-budget-state" className="text-sm">{stateLabel(standing)}</span>
      </div>
      <p className="text-sm">{standing.label}</p>
      <div data-testid="task-budget-steps">
        <div role="progressbar" aria-label="Steps" aria-valuemin={0} aria-valuenow={standing.steps.used} aria-valuemax={standing.steps.ceiling} className="h-2 bg-gray-200 rounded">
          <div className="h-2 bg-blue-500 rounded" style={{ width: `${stepsPct}%` }} />
        </div>
        <span className="text-xs">{standing.steps.used} of {standing.steps.ceiling} steps ({ORIGIN_TEXT[standing.steps.origin]})</span>
      </div>
      <div data-testid="task-budget-spend">
        <div role="progressbar" aria-label="Spend" aria-valuemin={0} aria-valuenow={Number(standing.spend.used)} aria-valuemax={spendCeiling} className="h-2 bg-gray-200 rounded">
          <div className="h-2 bg-green-500 rounded" style={{ width: `${spendPct}%` }} />
        </div>
        <span className="text-xs">
          {money(standing.spend.used)} of {money(standing.spend.ceiling)} {standing.spend.currency} ({ORIGIN_TEXT[standing.spend.origin]})
          {standing.spend.approximate && " · approximate"}
          {standing.spend.incomplete && ` · incomplete (${unpriced} ${unpriced === 1 ? "request" : "requests"} had no price)`}
        </span>
      </div>
      {changeable && (
        <button type="button" aria-expanded={changing} onClick={() => setChanging(!changing)} className="mt-1 text-sm underline">
          Change limits
        </button>
      )}
      {changeable && changing && (
        <LimitsForm conversationId={conversationId} standing={standing} onDone={() => setChanging(false)} />
      )}
    </div>
  );
}

export default TaskBudgetPanel;
