import { LaravelModelType } from '@clarion-app/types';

export interface LanguageModelType extends LaravelModelType {
  name: string;
  server_id: string;
}

export interface MessageType extends LaravelModelType {
  conversation_id: string;
  content: string;
  tool_data: string | null;
  role: string;
  user: string;
  streaming: boolean;
  responseTime: number;
}

export interface ConversationType extends LaravelModelType {
  title: string;
  user_id: string;
  server_id: string | null;
  model: string | null;
  character: string;
  channel?: string;
}

export type ProviderFamily = 'openai' | 'llama.cpp' | 'anthropic';

export type ConnectionStatus = 'never_checked' | 'reachable' | 'unreachable' | 'auth_rejected';

export type RefreshOutcome = 'models_updated' | 'zero_models' | 'auth_rejected' | 'http_error' | 'unreachable' | 'did_not_complete';

export interface ServerType extends LaravelModelType {
  name: string;
  server_url: string;
  provider_type?: ProviderFamily;
  token?: string;
}

export interface ServerStatusType {
  server_id: string;
  connection_status: ConnectionStatus;
  in_flight: boolean;
  last_outcome: RefreshOutcome | null;
  last_error: string | null;
  model_count: number;
  triggered_by: string | null;
  last_refresh_at: string | null;
}

export interface RoleTestResultType {
  role: string;
  outcome: 'pass' | 'fail' | 'not_testable' | 'no_effective_model';
  model: string | null;
  server: { id: string; name: string } | null;
  message: string | null;
  duration_ms: number | null;
}

export interface TestRoleRequest {
  role: 'inference' | 'embedding' | 'image';
}

export interface ApiCallConfirmationType {
  conversation_id: string;
  message_id: string;
  method: string;
  path: string;
  body: Record<string, unknown>;
}

// Role assignment types
export interface RoleEffective {
  status: 'resolved' | 'unassigned' | 'broken';
  scope: 'user' | 'installation' | null;
  server: { id: string; name: string } | null;
  model: string | null;
  reason: string | null;
}

export interface RoleAssignment {
  server_id: string;
  model: string;
}

export interface RoleDescriptor {
  role: 'inference' | 'embedding' | 'image';
  effective: RoleEffective;
  user_assignment: RoleAssignment | null;
  installation_assignment: RoleAssignment | null;
}

export type RoleAssignmentsType = {
  inference: RoleDescriptor;
  embedding: RoleDescriptor;
  image: RoleDescriptor;
};

export interface SetRoleAssignmentRequest {
  role: 'inference' | 'embedding' | 'image';
  scope: 'user' | 'installation';
  server_id: string;
  model: string;
}

export interface ClearRoleAssignmentRequest {
  role: 'inference' | 'embedding' | 'image';
  scope: 'user' | 'installation';
}

// Run execution graph types (data-model.md §1.1-§1.5)

export type RunKind = 'interactive' | 'system_initiated';

export type RunEndState = 'in_progress' | 'completed' | 'failed' | 'stopped_early' | 'abandoned';

export type ActionType = 'llm_request' | 'tool_invocation' | 'context_reshape';

export type ActionOutcome = 'in_progress' | 'awaiting_confirmation' | 'success' | 'failure' | 'unfinished';

export interface RunSummary {
  id: string;
  kind: RunKind;
  end_state: RunEndState;
  end_reason: string | null;
  started_at: string;
  ended_at: string | null;
  duration_ms: number | null;
  step_count: number;
  action_count: number;
  conversation_id: string | null;
}

export interface StepSummary {
  id: string;
  run_id: string;
  position: number;
  end_state: RunEndState;
  end_reason: string | null;
  started_at: string;
  ended_at: string | null;
  duration_ms: number | null;
  wait_ms: number | null;
  attempt_count: number;
  action_count: number;
}

export interface ActionSummary {
  id: string;
  run_id: string;
  step_id: string;
  parent_action_id: string | null;
  action_type: ActionType;
  target: string | null;
  outcome: ActionOutcome;
  failure_reason: string | null;
  started_at: string;
  ended_at: string | null;
  duration_ms: number | null;
  has_children: boolean;
}

export interface ActionDetail extends ActionSummary {
  content: string | null;
  content_truncated: boolean;
}

export interface PaginatedEnvelope<T> {
  data: T[];
  meta: {
    current_page: number;
    per_page: number;
    total: number;
    last_page: number;
  };
}

// Agent search/browse types (094-agent-search-listing, data-model.md §5)

export interface AgentSearchEntry {
  id: string;
  name: string;
  is_active: boolean;
  can_use: boolean;
  current_version_number: number | null;
}

export type AgentSearchEnvelope = PaginatedEnvelope<AgentSearchEntry> & { total_unfiltered: number };

// Eval dashboard types (contracts/eval-dashboard-api.md §1-§2)

export type EvalCaseOutcome = 'pass' | 'fail' | 'needs_human_review' | 'errored' | 'unjudged';

export type ExpectationKind =
  | 'text_match'
  | 'information_present'
  | 'action_taken'
  | 'action_not_taken'
  | 'human_judgment'
  | 'rubric_judgment';

export interface PassRateSnapshot {
  run_id: string;
  pass_rate: number;
  pass_count: number;
  fail_count: number;
  errored_count: number;
  needs_human_review_count: number;
  unjudged_count: number;
  completed_at: string;
}

export interface TrendBucket {
  period_date: string;
  pass_count: number;
  fail_count: number;
  needs_human_review_count: number;
  errored_count: number;
  unjudged_count: number;
  total_count: number;
}

export interface PersistentFailure {
  eval_case_id: string;
  fail_count: number;
  total_count: number;
  fail_rate: number;
}

export interface AgentQualityOverview {
  agent_label: string;
  current_pass_rate: PassRateSnapshot | null;
  trend: {
    window_days: number;
    buckets: TrendBucket[];
  };
  persistent_failures: PersistentFailure[];
}

export interface JudgmentDetail {
  // score/justification are nullable at the source: a judgment that could
  // not be produced (the unjudged outcome) records neither, and an
  // override may correct one without supplying the other.
  score: number | null;
  justification: string | null;
  overridden: boolean;
  overridden_by: string | null;
  overridden_at: string | null;
}

export interface ExpectationResultDetail {
  kind: ExpectationKind;
  criteria: string;
  met: boolean;
  score?: number;
  status?: string;
  judgment_id?: string;
  judgment?: JudgmentDetail;
}

export interface CaseDetail {
  id: string;
  run_id: string;
  eval_case_id: string;
  eval_case_version_id: string;
  given: string;
  expected_behavior: string;
  outcome: EvalCaseOutcome;
  outcome_override: EvalCaseOutcome | null;
  produced_response: string | null;
  attempted_actions: Array<{ tool: string; arguments: Record<string, unknown> }>;
  expectation_results: ExpectationResultDetail[];
  error_message: string | null;
  created_at: string;
}

// Run breakdown types (US2 drill-down) — the existing, unmodified
// GET /eval-runs/{runId} and GET /eval-runs/{runId}/cases response shapes
// (contracts/eval-dashboard-api.md §3, EvalRunController::formatRunDetail()/
// formatCaseResult()), given their own names here since this package had no
// eval-run-detail types before this feature.

export interface EvalOutcomeCounts {
  pass: number;
  fail: number;
  needs_human_review: number;
  errored: number;
  unjudged: number;
}

export interface EvalRunConsumption {
  total_cost: number | null;
  cost_currency: string | null;
  cost_unpriced: boolean;
  total_tokens: number;
  tool_invocation_count: number;
  total_duration_ms: number;
  judging: {
    total_cost: number | null;
    total_tokens: number;
    invocation_count: number;
    cost_unpriced: boolean;
  };
}

export interface EvalRunDetail {
  id: string;
  suite_id: string;
  agent_label: string;
  status: string;
  case_count: number;
  completed_count: number;
  remaining_count: number;
  started_at: string | null;
  completed_at: string | null;
  failure_reason: string | null;
  overall: string;
  outcome_counts: EvalOutcomeCounts;
  consumption: EvalRunConsumption;
}

/**
 * Laravel's own default paginator serialization, which is what
 * `GET /eval-runs/{runId}/cases` returns: the eval-run controller hands a
 * `LengthAwarePaginator` straight to `response()->json()`, so the page
 * metadata sits at the top level of the body alongside `data` — it is not
 * wrapped in the `meta` object `PaginatedEnvelope<T>` describes, which is
 * the hand-built envelope the agent-run read endpoints assemble for
 * themselves. Two genuinely different shapes from two different
 * controllers; conflating them makes every page field silently
 * `undefined` at runtime while both packages' own tests keep passing.
 */
export interface LaravelPaginated<T> {
  data: T[];
  current_page: number;
  per_page: number;
  total: number;
  last_page: number;
}

export interface EvalCaseResultSummary {
  id: string;
  eval_case_id: string;
  eval_case_version_id: string;
  outcome: EvalCaseOutcome;
  outcome_override: EvalCaseOutcome | null;
  produced_response: string | null;
  attempted_actions: Array<{ tool: string; arguments: Record<string, unknown> }>;
  expectation_results: ExpectationResultDetail[];
  error_message: string | null;
  created_at: string;
}