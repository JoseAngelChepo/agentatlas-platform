export type AgentWorkerModel = {
  provider: string
  name: string
  /** Deprecated — not used at inference time. */
  contextWindow?: number
  params?: Record<string, unknown>
}

/** Extra ordered messages after Instructions — see `agentatlas-services` docs/SWARMS-AGENT-IO.md */
export type AgentWorkerPromptMessage = {
  role: "system" | "user"
  content: string
}

/** OpenAI Responses API tools — see `agentatlas-services` docs/SWARMS-AGENT-IO.md */
export type OpenAiWorkerTools = {
  webSearch?: boolean
  webSearchContextSize?: "low" | "medium" | "high"
  webSearchAllowedDomains?: string[]
  toolChoice?: "auto" | "required" | "none"
}

/** xAI Responses API tools — see `agentatlas-services` docs/SWARMS-AGENT-IO.md#grok-tools-x_search */
export type GrokWorkerTools = {
  xSearch?: boolean
  xSearchAllowedHandles?: string[]
  xSearchExcludedHandles?: string[]
  xSearchFromDate?: string
  xSearchToDate?: string
  xSearchEnableImageUnderstanding?: boolean
  xSearchEnableVideoUnderstanding?: boolean
  webSearch?: boolean
  toolChoice?: "auto" | "required" | "none"
}

export type AdminAgentWorker = {
  id: string
  name: string
  model: AgentWorkerModel
  systemPrompt: string
  promptMessages: AgentWorkerPromptMessage[]
  /** Top-level keys from upstream when `compressOutput` is true; empty = backend defaults. */
  upstreamFields: string[]
  inputSchema?: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  openaiTools?: OpenAiWorkerTools | Record<string, unknown>
  grokTools?: GrokWorkerTools | Record<string, unknown>
  agentTools?: string[]
  /** Child swarm ids exposed as `swarm_<objectId>` functions at inference time. */
  swarmTools?: string[]
  compressOutput: boolean
  maxRetries: number
  timeoutMs: number
  createdBy: string
  createdAt?: string
  updatedAt?: string
}

export type AdminSwarm = {
  id: string
  name: string
  description?: string
  goal: string
  topology: string
  workers: string[]
  createdBy: string
  version: string
  isPublic: boolean
  /** When false, the swarm cannot be executed. */
  active: boolean
  /** When true, any authenticated user can run or reference this swarm without hiring. */
  platformRunnable?: boolean
  /** Routing tags for Floor Manager / agent catalogs. */
  triggers?: string[]
  createdAt?: string
  updatedAt?: string
}

export type SwarmNodePosition = {
  x: number
  y: number
}

export type SwarmGraphNode = {
  /** Stable React Flow node id; defaults to `workerId` when omitted on writes. */
  id?: string
  kind?: "worker" | "ifelse" | "while" | "scraper" | "research_papers" | "swarm" | "user_approval" | "end"
  workerId?: string | null
  type?: string
  position: SwarmNodePosition
  /** Worker UI metadata or control-node payload (e.g. if/else `cases`). */
  data?: Record<string, unknown>
}

export type SwarmGraphEdge = {
  /** Source graph node id. */
  from: string
  /** Target graph node id. */
  to: string
  type: string
  condition: string | null
  /** Branch handle from If/else nodes (`case-<id>` | `else`). */
  sourceHandle?: string | null
}

export type SwarmGraph = {
  id: string
  swarmId: string
  nodes: SwarmGraphNode[]
  edges: SwarmGraphEdge[]
  entryNode: string
  exitNode: string
  createdAt?: string
  updatedAt?: string
}

export type SwarmRunModelUsage = {
  provider: string
  model: string
  promptTokens: number
  completionTokens: number
  totalTokens: number
  costUsd: number | null
  agentRunCount: number
}

export type SwarmRunScrapeRequestLine = {
  scrapeRequestId: string
  url: string
  latencyMs: number
  costUsd: number
  status: string
}

export type SwarmRunScrapeUsage = {
  requestCount: number
  browserDurationMs: number
  costUsd: number
  requests: SwarmRunScrapeRequestLine[]
}

export type SwarmRun = {
  id: string
  swarmId: string
  triggeredBy: string
  runKind?: "swarm" | "worker_preview" | "sub_swarm"
  parentSwarmRunId?: string | null
  parentNodeId?: string | null
  depth?: number
  input: Record<string, unknown>
  output: Record<string, unknown> | null
  agentRuns: string[]
  status: string
  durationMs: number | null
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  costUsd?: number | null
  scrapeCostUsd?: number
  totalCostUsd?: number
  usageByModel?: SwarmRunModelUsage[]
  scrapeUsage?: SwarmRunScrapeUsage
  failureReason: string | null
  pendingApprovalId?: string | null
  createdAt?: string
  updatedAt?: string
}

export type SwarmRunApproval = {
  id: string
  swarmRunId: string
  swarmId: string
  nodeId: string
  name: string
  message: string
  passthrough: Record<string, unknown>
  assigneeUserId: string
  requestedBy: string
  status: string
  decision: "approve" | "reject" | null
  comment: string
  decidedBy: string | null
  decidedAt: string | null
  createdAt?: string
  updatedAt?: string
}

export type DecideSwarmRunApprovalPayload = {
  decision: "approve" | "reject"
  comment?: string
}

export type DecideSwarmRunApprovalResult = {
  approval: SwarmRunApproval
  swarmRun: SwarmRun
  output: Record<string, unknown> | null
  paused: boolean
  nextApproval?: SwarmRunApproval
}

export type AgentRun = {
  id: string
  workerId: string
  swarmRunId: string
  messages: WorkerInferenceMessage[]
  input: Record<string, unknown>
  output: Record<string, unknown> | null
  inference: InferenceTrace
  status: string
  durationMs: number
  attempt: number
  createdAt?: string
  updatedAt?: string
}

export type AdminListSwarmsQuery = {
  page?: number
  limit?: number
  search?: string
  userId?: string
}

export type AdminSwarmListResult = {
  items: AdminSwarm[]
  total: number
  page: number
  limit: number
}

export type CreateAgentWorkerPayload = {
  name: string
  model: AgentWorkerModel
  systemPrompt: string
  promptMessages?: AgentWorkerPromptMessage[]
  upstreamFields?: string[]
  inputSchema?: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  compressOutput?: boolean
  maxRetries?: number
  timeoutMs?: number
}

export type CreateSwarmPayload = {
  name: string
  goal: string
  description?: string
  topology?: string
  workers?: string[]
  version?: string
  isPublic?: boolean
  active?: boolean
  triggers?: string[]
}

export type DuplicateSwarmPayload = {
  name?: string
}

export type DuplicateSwarmResult = {
  swarm: AdminSwarm
  graph: SwarmGraph | null
}

export type AdminUpdateAgentWorkerPayload = {
  name?: string
  model?: AgentWorkerModel
  systemPrompt?: string
  promptMessages?: AgentWorkerPromptMessage[]
  upstreamFields?: string[]
  inputSchema?: Record<string, unknown>
  outputSchema?: Record<string, unknown>
  openaiTools?: OpenAiWorkerTools | Record<string, unknown>
  grokTools?: GrokWorkerTools | Record<string, unknown>
  agentTools?: string[]
  swarmTools?: string[]
  compressOutput?: boolean
  maxRetries?: number
  timeoutMs?: number
}

export type AdminUpdateSwarmPayload = {
  name?: string
  description?: string
  goal?: string
  topology?: string
  workers?: string[]
  version?: string
  isPublic?: boolean
  active?: boolean
  triggers?: string[]
}

export type UpsertSwarmGraphPayload = {
  nodes: SwarmGraphNode[]
  edges: SwarmGraphEdge[]
  entryNode: string
  exitNode: string
}

export type RunSwarmPayload = {
  input?: Record<string, unknown>
  maxNodeVisits?: number
}

export type RunSwarmResult = {
  swarmRun: SwarmRun
  output: Record<string, unknown> | null
}

export type UpstreamSourceMeta = {
  workerId: string
  workerName: string
  nodeId?: string
  ref?: string
}

/** Resolved context the worker consumed at inference time (SSE `worker_done.inferenceRequest`, `agent_runs.input`). */
export type InferenceRequestPayload = {
  goal?: string
  systemPrompt: string
  upstream: Record<string, unknown>[]
  upstreamMeta?: UpstreamSourceMeta[]
  shared: Record<string, unknown>
  runInput: Record<string, unknown>
  promptMessages?: AgentWorkerPromptMessage[]
  /** Wired at inference from `worker.agentTools` (empty = no platform tools connected). */
  connectedAgentTools?: string[]
}

export type InferenceTrace = {
  request: Record<string, unknown> | null
  response: Record<string, unknown> | null
}

export type WorkerInferenceMessage = {
  role: string
  content: string
  tokensUsed?: number
}

/** SSE payloads for `POST /swarms/:id/run/stream` and admin stream. */
export type SwarmGraphNodeKind =
  | "start"
  | "scraper"
  | "research_papers"
  | "swarm"
  | "ifelse"
  | "while"
  | "user_approval"
  | "end"
  | "worker"

export type ReferencedSwarmSummary = {
  id: string
  name: string
  goal?: string
  active: boolean
  platformRunnable: boolean
  canRun: boolean
  inputs: string[]
  outputs: string[]
}

/** @deprecated Prefer `SwarmGraphNodeKind`. */
export type SwarmControlNodeKind = SwarmGraphNodeKind

export type SwarmNodeSkippedReason = "branch_pruned" | "unreachable"

export type SwarmSseEvent =
  | {
      type: "swarm_start"
      swarmId: string
      swarmRunId: string
      runKind: "swarm" | "worker_preview"
    }
  | {
      type: "node_start"
      nodeId: string
      nodeKind: SwarmGraphNodeKind
      nodeName: string
      step: number
      wave: number
    }
  | {
      type: "node_done"
      nodeId: string
      nodeKind: SwarmGraphNodeKind
      nodeName: string
      step: number
      wave: number
      output: Record<string, unknown>
      latencyMs: number
    }
  | {
      type: "node_skipped"
      nodeId: string
      nodeKind: SwarmGraphNodeKind
      nodeName: string
      wave: number
      reason: SwarmNodeSkippedReason
      fromNodeId?: string
    }
  | {
      type: "scale_expand"
      nodeId: string
      count: number
      wave: number
    }
  | {
      type: "scale_shard_start"
      nodeId: string
      shardIndex: number
      wave: number
    }
  | {
      type: "scale_shard_done"
      nodeId: string
      shardIndex: number
      wave: number
      latencyMs: number
    }
  | {
      type: "scale_collapse"
      nodeId: string
      wave: number
    }
  | {
      type: "worker_start"
      nodeId: string
      workerId: string
      workerName: string
      step: number
      wave: number
      shardIndex?: number
    }
  | {
      type: "worker_meta"
      nodeId: string
      workerId: string
      provider: string
      model: string
      baseURL: string
      wave: number
      shardIndex?: number
    }
  | {
      type: "delta"
      nodeId: string
      workerId: string
      delta: string
      wave: number
      shardIndex?: number
    }
  | {
      type: "worker_done"
      nodeId: string
      workerId: string
      agentRunId: string
      output: Record<string, unknown>
      latencyMs: number
      step: number
      wave: number
      shardIndex?: number
      inference?: InferenceTrace
      inferenceRequest?: InferenceRequestPayload
      messages?: WorkerInferenceMessage[]
    }
  | {
      type: "approval_required"
      approvalId: string
      swarmRunId: string
      swarmId: string
      nodeId: string
      name: string
      message: string
      passthrough: Record<string, unknown>
      assigneeUserId: string
    }
  | {
      type: "swarm_done"
      swarmRun: SwarmRun
      output: Record<string, unknown> | null
      durationMs: number
      promptTokens: number
      completionTokens: number
      totalTokens: number
      costUsd: number | null
      scrapeCostUsd: number
      totalCostUsd: number
    }
  | {
      type: "error"
      message: string
    }
