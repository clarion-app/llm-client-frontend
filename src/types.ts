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

export type ActionType = 'llm_request' | 'tool_invocation' | 'context_reshape' | 'delegation';

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

// Agent summary card usage types (095-agent-summary-cards, contracts/
// frontend-agent-cards.md §2, data-model.md §6/§8)

export interface AgentReliabilitySummary {
  invocation_count: number;
  success_count: number;
  failure_count: number;
  low_sample: boolean;
  no_activity: boolean;
}

export interface AgentCostSummary {
  priced_cost_total: string;
  request_count: number;
  unpriced_request_count: number;
  has_estimated_cost: boolean;
}

export interface AgentUsageSummary {
  has_run: boolean;
  run_count: number;
  reliability: AgentReliabilitySummary;
  cost: AgentCostSummary;
}

// Agent sharing types (096-agent-sharing, data-model.md §10)

export interface AgentShareOwner {
  id: string;
  name: string;
}

export type AgentSharePermission = 'use' | 'use_and_edit';

export interface AgentShare {
  id: string;
  agent_id: string;
  recipient_user_id: string;
  recipient_name: string;
  permission: AgentSharePermission;
  created_at: string;
  updated_at: string;
}

export interface InstallationUser {
  id: string;
  name: string;
  email: string;
}

export interface AgentSearchEntry {
  id: string;
  name: string;
  is_active: boolean;
  can_use: boolean;
  current_version_number: number | null;
  // New (095-agent-summary-cards, data-model.md §8):
  purpose: string;
  capabilities: string[];
  operation_count: number;
  memory_enabled: boolean;
  usage: AgentUsageSummary;
  // New (096-agent-sharing, data-model.md §10):
  is_shared: boolean;
  shared_by: AgentShareOwner | null;
  permission: 'owner' | AgentSharePermission;
}

export type AgentSearchEnvelope = PaginatedEnvelope<AgentSearchEntry> & { total_unfiltered: number };

// Sub-Agent Model types (data-model.md §8, 097-subagent-model)
export type HelperStatus = 'active' | 'deactivated' | 'gone';

export interface AgentHelper {
  id: string; // AgentHelperAssignment id
  parent_agent_id: string;
  helper_agent_id: string;
  helper_name: string;
  helper_purpose: string | null;
  helper_status: HelperStatus;
  within_bounds: boolean;
  effective_operation_count: number;
  created_at: string;
  updated_at: string;
}

export interface AgentHelperHierarchyEntry {
  agent_id: string;
  name: string;
  depth: number;
  path: string[];
  helper_status: HelperStatus;
  within_bounds: boolean;
  effective_operation_count: number;
}

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

// Delegation protocol types (data-model.md §9, 098-delegation-protocol).
// 'queued' and batch_id added by 101-parallel-subagent-execution
// (data-model.md §1, contracts §2) -- a batch member's row starts
// 'queued' (before DelegationConcurrencyGate admits it to 'in_progress')
// and carries the batch it was dispatched with; both are null/absent for
// every delegation created by the pre-existing solo delegate() path.

export type DelegationStatus = 'queued' | 'in_progress' | 'completed' | 'exhausted' | 'failed';

export interface Delegation {
  id: string;
  parent_conversation_id: string;
  helper_agent_id: string;
  helper_agent_name: string;
  helper_conversation_id: string;
  depth: number;
  status: DelegationStatus;
  task: string;
  context: string | null;
  parent_run_id: string | null;
  parent_action_id: string | null;
  helper_run_id: string | null;
  outcome_summary: string | null;
  started_at: string;
  completed_at: string | null;
  /** 101-parallel-subagent-execution: null for a solo delegation, shared
   *  by every member of the same concurrent batch otherwise. */
  batch_id: string | null;
}

// Multi-agent arrangement types (106-multi-agent-run-view, data-model.md
// §1.1, contracts/arrangement-api.md §1) -- the run-rooted, whole-tree
// projection GET /agent-runs/{runId}/arrangement returns. A narrower
// per-delegation shape than `Delegation` above (no task/context/
// outcome_summary/result_* -- not needed for the shape-at-a-glance view,
// data-model.md §1.1's own note).

export interface ArrangementDelegation {
  id: string;
  parent_run_id: string | null;
  parent_action_id: string | null;
  helper_run_id: string | null;
  helper_agent_id: string;
  helper_agent_name: string | null;
  depth: number;
  status: DelegationStatus;
  batch_id: string | null;
  started_at: string;
  completed_at: string | null;
}

export interface ArrangementResponse {
  root_run_id: string;
  has_delegations: boolean;
  truncated: boolean;
  runs: Record<string, RunSummary>;
  delegations: ArrangementDelegation[];
}

// Capability offering types (109-agent-as-capability, data-model.md §10,
// contracts/capability-offering-api.md)
export interface CapabilityOffering {
  id: string;
  offered_agent_id: string;
  offered_agent_name: string;
  caller_agent_id: string;
  caller_agent_name: string;
  capability_name: string;
  capability_description: string;
  input_description: string;
  created_at: string;
  updated_at: string;
}

// Workspace browser types (122-workspace-browser-ui, US1, contracts/
// workspace-list-api.md). `reachable` is computed fresh by the backend on
// every GET -- never a cached/stored value (FR-002, research.md D3).
export interface CodingWorkspaceType {
  id: string;
  user_id: string;
  name: string;
  root_path: string;
  test_command: string | null;
  confirmation_relaxed: boolean;
  reachable: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * The flat `{data, total, page, per_page}` envelope T006 settled on for
 * this feature's list endpoints -- deliberately NOT `PaginatedEnvelope<T>`'s
 * nested `.meta.total` shape (Grounding note 6), since neither
 * `CodingProjectController::index()` nor `CodingWorkspaceController::
 * changes()` build on `RunController`'s own envelope helper.
 */
export interface FlatPaginatedEnvelope<T> {
  data: T[];
  total: number;
  page: number;
  per_page: number;
}

/**
 * Workspace change history types (122-workspace-browser-ui, US3, contracts/
 * workspace-change-history-api.md). One row is one recorded change an agent
 * made to one file -- `created`/`modified`/`deleted` -- captured at the
 * moment of mutation. `agent_id`/`agent_name`/`conversation_id` are all
 * `null` together when the underlying write/delete call carried no
 * verifiable attribution header (a valid, expected shape, not an error).
 * For each side (`old`/`new`) independently, at most one of `_binary`/
 * `_content_truncated` is ever true, and when `_binary` is true `_content`
 * is `null`.
 */
export type CodingWorkspaceChangeOperation = 'created' | 'modified' | 'deleted';

export interface CodingWorkspaceChangeType {
  id: string;
  path: string;
  operation: CodingWorkspaceChangeOperation;
  old_content: string | null;
  old_content_truncated: boolean;
  old_binary: boolean;
  old_size: number | null;
  new_content: string | null;
  new_content_truncated: boolean;
  new_binary: boolean;
  new_size: number | null;
  agent_id: string | null;
  agent_name: string | null;
  conversation_id: string | null;
  created_at: string;
}

// MCP client server management types (119-mcp-server-management-ui,
// data-model.md's decision table). connection_status's five values —
// 'unknown' is a server with no status row yet (never refreshed);
// 'protocol_error' is distinct from 'unreachable' (FR-010) — the classifier
// this feature adds is what makes that distinction possible at all.
export type McpClientServerStatusCategory = 'unknown' | 'reachable' | 'unreachable' | 'auth_failed' | 'protocol_error';

export type McpClientServerTransport = 'streamable_http' | 'stdio';

export type McpClientServerScope = 'personal' | 'project';

export interface McpClientServerType {
  id: string;
  name: string;
  transport: McpClientServerTransport;
  scope: McpClientServerScope;
  connection_status: McpClientServerStatusCategory;
  last_reachable_at: string | null;
  tool_count: number;
}

export interface McpClientServerStatusType {
  connection_status: McpClientServerStatusCategory;
  last_error: string | null;
  tool_count: number;
  refresh_finished_at: string | null;
  last_reachable_at: string | null;
}

// contracts/connection-test-api.md's own response shapes — the three
// failure_category values are exactly McpClientConnectionOutcomeClassifier's
// three failure categories (D5), the same vocabulary
// McpClientServerStatusCategory already carries minus 'reachable'/'unknown',
// which a test result never reports.
export type McpConnectionTestStatus = 'pending' | 'passed' | 'failed';

export type McpConnectionTestFailureCategory = 'unreachable' | 'auth_failed' | 'protocol_error';

export interface McpConnectionTestType {
  id: string;
  status: McpConnectionTestStatus;
  failure_category: McpConnectionTestFailureCategory | null;
  message: string | null;
  tool_count: number | null;
}

// The connection-shape fields shared by store() and testConnection() —
// testConnection() accepts exactly these (no name/scope, per
// contracts/connection-test-api.md); store() accepts these plus name/scope.
export interface McpServerConnectionFields {
  transport: McpClientServerTransport;
  url?: string | null;
  command?: string | null;
  args?: string[] | null;
  credential?: string | null;
}

export interface McpCreateServerRequest extends McpServerConnectionFields {
  name: string;
  scope: McpClientServerScope;
}