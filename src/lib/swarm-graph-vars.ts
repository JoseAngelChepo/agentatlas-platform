import type { AdminAgentWorker, SwarmGraph } from "@/data/api/server"
import { getStartInputVariableNames } from "@/lib/start-node"

export type PromptVariableGroup = "goal" | "runInput" | "shared" | "upstream"

export type PromptVariable = {
  token: string
  label: string
  group: PromptVariableGroup
  sourceWorkerId?: string
  sourceWorkerName?: string
}

const SUGGESTED_SHARED_KEYS = ["result", "summary", "intent"]

/** Default upstream field when a worker uses text output (no JSON schema properties). */
const TEXT_WORKER_OUTPUT_KEYS = ["result"]

export type UpstreamPredecessor = {
  /** React Flow / graph node id — unique per canvas tile. */
  nodeId: string
  workerId: string
  /** Canvas label or worker name (display only). */
  workerName: string
  /** @deprecated Legacy; sub-swarm nodes use `upstream.swarm.*`. */
  slug: string
  outputKeys: string[]
  /** Graph node fans out over an upstream array. */
  scalable?: boolean
  /** Structured output fields inside each shard object (when `scalable`). */
  shardSchemaKeys?: string[]
}

/** Output key for scalable agent nodes — array of per-shard worker outputs. */
export const SCALABLE_AGENT_OUTPUT_KEY = "outputs"

/** User-defined wrapper key for scalable agent output (defaults to {@link SCALABLE_AGENT_OUTPUT_KEY}). */
export function readScalableOutputArrayKey(nodeData?: Record<string, unknown>): string {
  const raw = nodeData?.outputArrayKey
  if (typeof raw === "string") {
    const trimmed = raw.trim()
    if (trimmed.length > 0) return trimmed
  }
  return SCALABLE_AGENT_OUTPUT_KEY
}

export function isScalableNodeData(data?: Record<string, unknown>): boolean {
  return data?.scalable === true
}

function shardSchemaKeysForWorker(worker?: AdminAgentWorker): string[] {
  return extractSchemaPropertyKeys(worker?.outputSchema).filter(
    (key) => key !== SCALABLE_AGENT_OUTPUT_KEY,
  )
}

function resolveWorkerOutputKeys(
  upstreamWorker?: AdminAgentWorker,
  nodeData?: Record<string, unknown>,
): string[] {
  if (isScalableNodeData(nodeData)) {
    return [readScalableOutputArrayKey(nodeData)]
  }
  const fromSchema = extractSchemaPropertyKeys(upstreamWorker?.outputSchema)
  if (fromSchema.length > 0) return fromSchema
  return [...TEXT_WORKER_OUTPUT_KEYS]
}

function upstreamOutputDedupeKey(nodeId: string, key: string): string {
  return `${nodeId}::${key}`
}

function formatUpstreamOutputLabel(upstream: UpstreamPredecessor, key: string): string {
  if (upstream.scalable) {
    const inner =
      upstream.shardSchemaKeys && upstream.shardSchemaKeys.length > 0
        ? upstream.shardSchemaKeys.join(", ")
        : "…"
    return `${key} · shard results[] (${inner})`
  }
  return key
}

/** Extra prompt tokens for scalable upstream (shard element + nested schema fields). */
function buildScalableUpstreamPromptVariables(
  upstream: UpstreamPredecessor,
): PromptVariable[] {
  if (!upstream.scalable) return []

  const vars: PromptVariable[] = []
  const seen = new Set<string>()
  const root = upstream.outputKeys[0] ?? SCALABLE_AGENT_OUTPUT_KEY

  const push = (token: string, label: string) => {
    if (seen.has(token)) return
    seen.add(token)
    vars.push({
      token,
      label,
      group: "upstream",
      sourceWorkerId: upstream.workerId,
      sourceWorkerName: upstream.workerName,
    })
  }

  push(`{{${root}.item}}`, `Current shard object (${root})`)
  for (const prop of upstream.shardSchemaKeys ?? []) {
    push(`{{${root}.item.${prop}}}`, `Shard · ${prop}`)
  }

  return vars
}

export function slugifyWorkerName(name: string): string {
  const cleaned = name.trim().replace(/[^a-zA-Z0-9_]/g, "_").replace(/_+/g, "_")
  return cleaned.length > 0 ? cleaned : "worker"
}

function graphNodeDisplayName(
  graph: SwarmGraph,
  nodeId: string,
  workerById: Record<string, AdminAgentWorker>,
  fallback: string,
): string {
  const node = graph.nodes.find((n) => n.id === nodeId)
  const workerId = node?.workerId
  if (workerId && workerById[workerId]?.name?.trim()) {
    return workerById[workerId].name.trim()
  }
  const rawLabel = node?.data?.label
  if (typeof rawLabel === "string" && rawLabel.trim().length > 0) {
    return rawLabel.trim()
  }
  return fallback
}

export function extractSchemaPropertyKeys(schema?: Record<string, unknown>): string[] {
  const props = schema?.properties
  if (!props || typeof props !== "object") return []
  return Object.keys(props as Record<string, unknown>)
}

/** React Flow / API node id for a worker blueprint (falls back to `workerId`). */
export function graphNodeIdForWorker(graph: SwarmGraph, workerId: string): string {
  const node = graph.nodes.find((n) => n.workerId === workerId)
  return node?.id ?? workerId
}

function graphNodeById(graph: SwarmGraph, nodeId: string): SwarmGraph["nodes"][number] | undefined {
  return graph.nodes.find((n) => n.id === nodeId || n.workerId === nodeId)
}

const SUGGESTED_SCRAPER_OUTPUT_KEYS = ["content", "url", "status"]
const SUGGESTED_RESEARCH_PAPERS_OUTPUT_KEYS = ["query", "papers", "paperCount", "status"]

/** Child swarm metadata for resolving sub-swarm node outputs in the graph. */
export type ReferencedSwarmLookup = Record<
  string,
  { name?: string; outputs: string[] }
>

export function buildReferencedSwarmLookup(
  swarms: Array<{ id: string; name?: string; outputs?: string[] }>,
): ReferencedSwarmLookup {
  const lookup: ReferencedSwarmLookup = {}
  for (const swarm of swarms) {
    lookup[swarm.id] = { name: swarm.name, outputs: swarm.outputs ?? [] }
  }
  return lookup
}

/** Walks back through if/else nodes to the worker that feeds `fromNodeId`. */
function resolveWorkerPredecessorFromNode(
  fromNodeId: string,
  graph: SwarmGraph,
  workerById: Record<string, AdminAgentWorker>,
  referencedSwarmById: ReferencedSwarmLookup = {},
  depth = 0,
): UpstreamPredecessor | null {
  if (depth > 8) return null

  const node = graphNodeById(graph, fromNodeId)
  const kind =
    node?.kind === "user_approval"
      ? "user_approval"
      : node?.kind ??
        (node?.type === "ifelse"
          ? "ifelse"
          : node?.type === "while"
            ? "while"
          : node?.type === "scraper"
            ? "scraper"
            : node?.type === "research_papers"
              ? "research_papers"
            : node?.type === "user_approval" || node?.type === "userApproval"
              ? "user_approval"
              : node?.type === "swarm"
                ? "swarm"
                : node?.type === "start"
                  ? "start"
                  : node?.type === "end"
                    ? "end"
                    : "worker")

  if (kind === "start") return null

  if (kind === "swarm") {
    const swarmId =
      typeof node?.data?.swarmId === "string" ? node.data.swarmId.trim() : ""
    const ref = swarmId ? referencedSwarmById[swarmId] : undefined
    const workerName = graphNodeDisplayName(
      graph,
      fromNodeId,
      workerById,
      ref?.name ?? "Sub-swarm",
    )
    const outputKeys = ref?.outputs ?? []
    return {
      nodeId: fromNodeId,
      workerId: fromNodeId,
      workerName,
      slug: "swarm",
      outputKeys,
    }
  }

  if (kind === "scraper") {
    return {
      nodeId: fromNodeId,
      workerId: fromNodeId,
      workerName: "Scraper",
      slug: "scraper",
      outputKeys: [...SUGGESTED_SCRAPER_OUTPUT_KEYS],
    }
  }

  if (kind === "research_papers") {
    return {
      nodeId: fromNodeId,
      workerId: fromNodeId,
      workerName: "Research papers",
      slug: "research_papers",
      outputKeys: [...SUGGESTED_RESEARCH_PAPERS_OUTPUT_KEYS],
    }
  }

  if (kind === "ifelse" || kind === "while" || kind === "user_approval" || kind === "end") {
    const incoming = graph.edges.filter((e) => e.to === fromNodeId)
    for (const edge of incoming) {
      const resolved = resolveWorkerPredecessorFromNode(
        edge.from,
        graph,
        workerById,
        referencedSwarmById,
        depth + 1,
      )
      if (resolved) return resolved
    }
    return null
  }

  const workerId = node?.workerId ?? (workerById[fromNodeId] ? fromNodeId : null)
  if (!workerId) return null

  const upstreamWorker = workerById[workerId]
  const workerName = graphNodeDisplayName(
    graph,
    fromNodeId,
    workerById,
    upstreamWorker?.name ?? workerId.slice(-6),
  )
  const outputKeys = resolveWorkerOutputKeys(upstreamWorker, node?.data)
  const scalable = isScalableNodeData(node?.data)
  return {
    nodeId: fromNodeId,
    workerId,
    workerName,
    slug: workerId,
    outputKeys,
    scalable,
    shardSchemaKeys: scalable ? shardSchemaKeysForWorker(upstreamWorker) : undefined,
  }
}

/** Workers on edges directly into `nodeId` (skips if/else wrappers). */
export function listDirectUpstreamPredecessorsForNode(
  nodeId: string,
  graph: SwarmGraph | null,
  workerById: Record<string, AdminAgentWorker>,
  referencedSwarmById: ReferencedSwarmLookup = {},
): UpstreamPredecessor[] {
  if (!graph) return []

  return graph.edges
    .map((e) =>
      e.to === nodeId
        ? resolveWorkerPredecessorFromNode(e.from, graph, workerById, referencedSwarmById)
        : null,
    )
    .filter((p): p is UpstreamPredecessor => p != null)
}

/** All workers/scrapers upstream in the graph path (direct first, then ancestors). */
export function listTransitiveUpstreamPredecessorsForNode(
  nodeId: string,
  graph: SwarmGraph | null,
  workerById: Record<string, AdminAgentWorker>,
  referencedSwarmById: ReferencedSwarmLookup = {},
): UpstreamPredecessor[] {
  if (!graph) return []

  const resolvedGraph = graph
  const seen = new Set<string>()
  const result: UpstreamPredecessor[] = []

  function append(fromNodeId: string): void {
    const resolved = resolveWorkerPredecessorFromNode(
      fromNodeId,
      resolvedGraph,
      workerById,
      referencedSwarmById,
    )
    if (!resolved || seen.has(resolved.nodeId)) return
    seen.add(resolved.nodeId)
    result.push(resolved)
  }

  function walkAncestors(fromNodeId: string, depth: number): void {
    if (depth > 8) return

    for (const edge of resolvedGraph.edges) {
      if (edge.to !== fromNodeId) continue
      append(edge.from)
      walkAncestors(edge.from, depth + 1)
    }
  }

  for (const edge of resolvedGraph.edges) {
    if (edge.to !== nodeId) continue
    append(edge.from)
    walkAncestors(edge.from, 0)
  }

  return result
}

/** @deprecated Prefer {@link listDirectUpstreamPredecessorsForNode} or {@link listTransitiveUpstreamPredecessorsForNode}. */
export function listUpstreamPredecessorsForNode(
  nodeId: string,
  graph: SwarmGraph | null,
  workerById: Record<string, AdminAgentWorker>,
  referencedSwarmById: ReferencedSwarmLookup = {},
): UpstreamPredecessor[] {
  return listDirectUpstreamPredecessorsForNode(nodeId, graph, workerById, referencedSwarmById)
}

/** All upstream nodes on paths into `targetNodeId` (includes parallel-merge ancestors). */
export function listUpstreamPredecessorsForTargetNode(
  targetNodeId: string,
  graph: SwarmGraph | null,
  workerById: Record<string, AdminAgentWorker>,
  referencedSwarmById: ReferencedSwarmLookup = {},
): UpstreamPredecessor[] {
  if (!graph) return []
  return listTransitiveUpstreamPredecessorsForNode(
    targetNodeId,
    graph,
    workerById,
    referencedSwarmById,
  )
}

/** @deprecated Prefer {@link listUpstreamPredecessorsForTargetNode} with the canvas node id. */
export function listUpstreamPredecessors(
  workerId: string,
  graph: SwarmGraph | null,
  workerById: Record<string, AdminAgentWorker>,
  referencedSwarmById: ReferencedSwarmLookup = {},
): UpstreamPredecessor[] {
  if (!graph) return []
  const targetNodeId = graphNodeIdForWorker(graph, workerId)
  return listTransitiveUpstreamPredecessorsForNode(
    targetNodeId,
    graph,
    workerById,
    referencedSwarmById,
  )
}

export type ScraperUrlContextOption = {
  urlSource: "runInput" | "upstream"
  urlPath: string
  token: string
  label: string
  group: "runInput" | "upstream"
}

/** Pickable URL paths for the web scrape node (Start inputs + wired upstream outputs). */
export function buildScraperUrlContextOptions(
  nodeId: string,
  graph: SwarmGraph | null,
  workerById: Record<string, AdminAgentWorker>,
  referencedSwarmById: ReferencedSwarmLookup = {},
): ScraperUrlContextOption[] {
  const options: ScraperUrlContextOption[] = []

  for (const key of getStartInputVariableNames(graph)) {
    options.push({
      urlSource: "runInput",
      urlPath: key,
      token: `runInput.${key}`,
      label: key,
      group: "runInput",
    })
  }

  for (const variable of buildIfElseConditionVariables(nodeId, graph, workerById)) {
    options.push({
      urlSource: "upstream",
      urlPath: variable.token.replace(/^upstream\./, ""),
      token: variable.token,
      label: variable.label,
      group: "upstream",
    })
  }

  return options
}

export type IfElseConditionFieldOption = {
  /** Stable React key (unique per upstream node + field). */
  id: string
  /** Expression field token, e.g. `summary` or `runInput.message`. */
  value: string
  label: string
  group: "upstream" | "runInput"
}

/** Upstream output fields + Start run inputs for If/else condition pickers. */
export function buildIfElseConditionFieldOptions(
  nodeId: string,
  graph: SwarmGraph | null,
  workerById: Record<string, AdminAgentWorker>,
  referencedSwarmById: ReferencedSwarmLookup = {},
): IfElseConditionFieldOption[] {
  const options: IfElseConditionFieldOption[] = []
  const seen = new Set<string>()

  for (const upstream of listDirectUpstreamPredecessorsForNode(
    nodeId,
    graph,
    workerById,
    referencedSwarmById,
  )) {
    for (const key of upstream.outputKeys) {
      const dedupe = upstreamOutputDedupeKey(upstream.nodeId, key)
      if (seen.has(dedupe)) continue
      seen.add(dedupe)
      options.push({
        id: dedupe,
        value: key,
        label: formatUpstreamOutputLabel(upstream, key),
        group: "upstream",
      })
    }
  }

  for (const key of getStartInputVariableNames(graph)) {
    const token = `runInput.${key}`
    if (seen.has(token)) continue
    seen.add(token)
    options.push({
      id: token,
      value: token,
      label: `Run input · ${key}`,
      group: "runInput",
    })
  }

  return options
}

/** Context tokens for If/else Code mode (bare names for expressions, same menu as agents). */
export function buildIfElseCodeContextVariables(
  nodeId: string,
  graph: SwarmGraph | null,
  workerById: Record<string, AdminAgentWorker>,
  referencedSwarmById: ReferencedSwarmLookup = {},
): PromptVariable[] {
  const vars: PromptVariable[] = []

  vars.push({ token: "goal", label: "Swarm goal", group: "goal" })

  for (const key of getStartInputVariableNames(graph)) {
    vars.push({
      token: `runInput.${key}`,
      label: `Run input · ${key}`,
      group: "runInput",
    })
  }

  for (const key of SUGGESTED_SHARED_KEYS) {
    vars.push({
      token: `shared.${key}`,
      label: `Shared · ${key}`,
      group: "shared",
    })
  }

  const seen = new Set<string>()
  for (const upstream of listDirectUpstreamPredecessorsForNode(
    nodeId,
    graph,
    workerById,
    referencedSwarmById,
  )) {
    for (const key of upstream.outputKeys) {
      const dedupe = upstreamOutputDedupeKey(upstream.nodeId, key)
      if (seen.has(dedupe)) continue
      seen.add(dedupe)
      vars.push({
        token: key,
        label: formatUpstreamOutputLabel(upstream, key),
        group: "upstream",
        sourceWorkerId: upstream.workerId,
        sourceWorkerName: upstream.workerName,
      })
    }
  }

  return vars
}

export type EndOutputFieldOption = {
  /** Stable React key (unique per upstream node + field). */
  id: string
  value: string
  label: string
  group: "upstream" | "runInput"
}

/** Upstream + run-input variables for End node output mapping (transitive upstream). */
export function buildEndOutputFieldOptions(
  nodeId: string,
  graph: SwarmGraph | null,
  workerById: Record<string, AdminAgentWorker>,
  referencedSwarmById: ReferencedSwarmLookup = {},
): EndOutputFieldOption[] {
  const options: EndOutputFieldOption[] = []
  const seen = new Set<string>()

  for (const upstream of listUpstreamPredecessorsForTargetNode(
    nodeId,
    graph,
    workerById,
    referencedSwarmById,
  )) {
    for (const key of upstream.outputKeys) {
      const dedupe = upstreamOutputDedupeKey(upstream.nodeId, key)
      if (seen.has(dedupe)) continue
      seen.add(dedupe)
      options.push({
        id: dedupe,
        value: key,
        label: formatUpstreamOutputLabel(upstream, key),
        group: "upstream",
      })
    }
  }

  for (const key of getStartInputVariableNames(graph)) {
    const token = `runInput.${key}`
    if (seen.has(token)) continue
    seen.add(token)
    options.push({
      id: token,
      value: token,
      label: `Run input · ${key}`,
      group: "runInput",
    })
  }

  return options
}

/** Condition tokens for If/else (no mustache — backend accepts both forms). */
export function buildIfElseConditionVariables(
  nodeId: string,
  graph: SwarmGraph | null,
  workerById: Record<string, AdminAgentWorker>,
  referencedSwarmById: ReferencedSwarmLookup = {},
): PromptVariable[] {
  return buildIfElseConditionFieldOptions(nodeId, graph, workerById, referencedSwarmById).map(
    (option) => ({
    token: option.value,
    label: option.label,
    group: option.group === "runInput" ? "runInput" : "upstream",
  }))
}

export function buildPromptVariables(
  targetNodeId: string,
  graph: SwarmGraph | null,
  workerById: Record<string, AdminAgentWorker>,
  runInputKeys: string[],
  includeGoal: boolean,
  referencedSwarmById: ReferencedSwarmLookup = {},
): PromptVariable[] {
  const vars: PromptVariable[] = []

  if (includeGoal) {
    vars.push({ token: "{{goal}}", label: "Swarm goal", group: "goal" })
  }

  for (const key of runInputKeys) {
    vars.push({
      token: `{{runInput.${key}}}`,
      label: `Run input · ${key}`,
      group: "runInput",
    })
  }

  const seenKeys = new Set<string>()
  for (const upstream of listUpstreamPredecessorsForTargetNode(
    targetNodeId,
    graph,
    workerById,
    referencedSwarmById,
  )) {
    for (const key of upstream.outputKeys) {
      const dedupe = upstreamOutputDedupeKey(upstream.nodeId, key)
      if (seenKeys.has(dedupe)) continue
      seenKeys.add(dedupe)
      vars.push({
        token: `{{${key}}}`,
        label: formatUpstreamOutputLabel(upstream, key),
        group: "upstream",
        sourceWorkerId: upstream.workerId,
      })
    }
  }

  return vars
}

/** Variables from all upstream nodes on graph paths (for Instructions → Add context). */
export function buildUpstreamPromptVariables(
  targetNodeId: string,
  graph: SwarmGraph | null,
  workerById: Record<string, AdminAgentWorker>,
  referencedSwarmById: ReferencedSwarmLookup = {},
): PromptVariable[] {
  const predecessors = listUpstreamPredecessorsForTargetNode(
    targetNodeId,
    graph,
    workerById,
    referencedSwarmById,
  )
  const vars: PromptVariable[] = []
  const seenFlatKeys = new Set<string>()
  const seenExplicitTokens = new Set<string>()
  const seenTokens = new Set<string>()

  if (predecessors.length > 0) {
    vars.push({
      token: "{{upstream}}",
      label: "All upstream outputs (JSON)",
      group: "upstream",
    })
    seenTokens.add("{{upstream}}")
  }

  const pushVar = (variable: PromptVariable) => {
    if (seenTokens.has(variable.token)) return
    seenTokens.add(variable.token)
    vars.push(variable)
  }

  for (const upstream of predecessors) {
    for (const key of upstream.outputKeys) {
      if (upstream.slug === "swarm") {
        const explicitToken = `{{upstream.swarm.${key}}}`
        if (!seenExplicitTokens.has(explicitToken)) {
          seenExplicitTokens.add(explicitToken)
          pushVar({
            token: explicitToken,
            label: `${upstream.workerName} → ${key}`,
            group: "upstream",
            sourceWorkerId: upstream.workerId,
            sourceWorkerName: upstream.workerName,
          })
        }
      }

      const flatToken = `{{${key}}}`
      const dedupe = upstreamOutputDedupeKey(upstream.nodeId, key)
      if (seenFlatKeys.has(dedupe)) continue
      seenFlatKeys.add(dedupe)
      pushVar({
        token: flatToken,
        label: formatUpstreamOutputLabel(upstream, key),
        group: "upstream",
        sourceWorkerId: upstream.workerId,
        sourceWorkerName: upstream.workerName,
      })
    }

    for (const nested of buildScalableUpstreamPromptVariables(upstream)) {
      pushVar(nested)
    }
  }

  return vars
}

/** Tokens for Instructions / prompt messages → Add context. */
export function buildInstructionsContextVariables(
  targetNodeId: string,
  graph: SwarmGraph | null,
  workerById: Record<string, AdminAgentWorker>,
  referencedSwarmById: ReferencedSwarmLookup = {},
): PromptVariable[] {
  const vars: PromptVariable[] = []

  vars.push({ token: "{{goal}}", label: "Swarm goal", group: "goal" })

  const runInputKeys = getStartInputVariableNames(graph)
  for (const key of runInputKeys) {
    vars.push({
      token: `{{runInput.${key}}}`,
      label: key,
      group: "runInput",
    })
  }

  for (const key of SUGGESTED_SHARED_KEYS) {
    vars.push({
      token: `{{shared.${key}}}`,
      label: key,
      group: "shared",
    })
  }

  vars.push(...buildUpstreamPromptVariables(targetNodeId, graph, workerById, referencedSwarmById))
  return vars
}

/** Root field name from a scalable array expression — e.g. `papers`, `items`. */
export function rootFieldFromScalableArrayExpression(expression: string): string | null {
  const expr = expression.trim()
  if (!expr || expr.startsWith("runInput.")) return null
  const root = expr.includes(".") ? expr.split(".").pop() : expr
  return root?.trim() || null
}

/** Per-shard tokens for scalable agents (e.g. `{{papers.item}}`). */
export function buildScalableShardPromptVariables(
  inputArrayExpression: string,
  predecessors: UpstreamPredecessor[] = [],
): PromptVariable[] {
  const expr = inputArrayExpression.trim()
  if (!expr) return []

  const vars: PromptVariable[] = []

  if (expr.startsWith("runInput.")) {
    const field = expr.slice("runInput.".length)
    return [
      {
        token: "{{runInput.item}}",
        label: `Current · ${field} element`,
        group: "runInput",
      },
      {
        token: "{{runInput.shardIndex}}",
        label: "Shard index (0-based)",
        group: "runInput",
      },
    ]
  }

  const fieldRoot = rootFieldFromScalableArrayExpression(expr)
  if (!fieldRoot) return []

  const source = predecessors.find((row) => row.outputKeys.includes(fieldRoot))
  const sourceLabel = fieldRoot

  vars.push({
    token: `{{${fieldRoot}.item}}`,
    label: `${sourceLabel} · current element`,
    group: "upstream",
    sourceWorkerId: source?.workerId,
    sourceWorkerName: source?.workerName,
  })

  if (source?.scalable && source.outputKeys.includes(fieldRoot)) {
    for (const prop of source.shardSchemaKeys ?? []) {
      vars.push({
        token: `{{${fieldRoot}.item.${prop}}}`,
        label: `${sourceLabel} · shard · ${prop}`,
        group: "upstream",
        sourceWorkerId: source?.workerId,
        sourceWorkerName: source?.workerName,
      })
    }
  }

  vars.push(
    {
      token: "{{runInput.item}}",
      label: "Current array element",
      group: "runInput",
    },
    {
      token: "{{runInput.shardIndex}}",
      label: "Shard index (0-based)",
      group: "runInput",
    },
  )

  return vars
}
