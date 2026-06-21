import type { SwarmGraph } from "@/data/api/server"

/** Max length for `upstream.<ref>.*` segments in prompts. */
const MAX_REF_LENGTH = 28

/**
 * Short, readable token segment from a canvas label (e.g. "Agent 1" → `agent_1`).
 * Not guaranteed unique — use {@link allocateNodeRef}.
 */
export function slugifyNodeRef(name: string): string {
  let cleaned = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
  if (!cleaned) cleaned = "agent"
  if (/^\d/.test(cleaned)) cleaned = `n_${cleaned}`
  return cleaned.slice(0, MAX_REF_LENGTH)
}

/** Assigns a unique ref inside `taken` (mutates the set). */
export function allocateNodeRef(taken: Set<string>, preferredLabel?: string): string {
  const base = slugifyNodeRef(preferredLabel ?? "agent")
  if (!taken.has(base)) {
    taken.add(base)
    return base
  }
  for (let i = 2; i < 10_000; i++) {
    const candidate = `${base}_${i}`.slice(0, MAX_REF_LENGTH)
    if (!taken.has(candidate)) {
      taken.add(candidate)
      return candidate
    }
  }
  const fallback = `node_${taken.size + 1}`
  taken.add(fallback)
  return fallback
}

export function readGraphNodeRef(node: { data?: Record<string, unknown> } | undefined): string | null {
  const raw = node?.data?.ref
  if (typeof raw !== "string") return null
  const trimmed = raw.trim()
  return trimmed.length > 0 ? trimmed : null
}

export function collectAgentRefsFromGraph(graph: SwarmGraph | null | undefined): Set<string> {
  const taken = new Set<string>()
  if (!graph) return taken
  for (const node of graph.nodes) {
    if (!node.workerId) continue
    const ref = readGraphNodeRef(node)
    if (ref) taken.add(ref)
  }
  return taken
}

/** Resolve prompt ref for a worker graph node (uses stored `data.ref`). */
export function upstreamRefForGraphNode(
  graph: SwarmGraph,
  nodeId: string,
  displayLabel: string,
): string {
  const node = graph.nodes.find((n) => n.id === nodeId)
  const stored = readGraphNodeRef(node)
  if (stored) return stored
  const taken = collectAgentRefsFromGraph(graph)
  return allocateNodeRef(taken, displayLabel)
}

export function serializedAgentNodeData(data: {
  ref?: string
  label?: string
  scalable?: boolean
  /** Wrapper key for scalable output array (defaults to `outputs`). */
  outputArrayKey?: string
  inputArrayExpression?: string
  inputArrayPath?: string
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {}
  if (data.ref) payload.ref = data.ref
  if (data.label) payload.label = data.label
  if (data.scalable) payload.scalable = true
  if (data.outputArrayKey?.trim()) {
    payload.outputArrayKey = data.outputArrayKey.trim()
  }
  if (data.inputArrayExpression?.trim()) {
    payload.inputArrayExpression = data.inputArrayExpression.trim()
  }
  return payload
}
