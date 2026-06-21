import type { AdminAgentWorker, SwarmGraph } from "@/data/api/server"
import { extractSchemaPropertyKeys } from "@/lib/swarm-graph-vars"

/** Roots reserved for built-in prompt slices — cannot be output field names. */
export const RESERVED_PROMPT_ROOTS = new Set([
  "goal",
  "runInput",
  "input",
  "shared",
  "upstream",
  "output",
  "outputs",
])

export const SCRAPER_OUTPUT_KEYS = ["content", "url", "status"] as const

export function isReservedPromptRoot(key: string): boolean {
  return RESERVED_PROMPT_ROOTS.has(key.trim())
}

function graphHasScraper(graph: SwarmGraph | null): boolean {
  if (!graph) return false
  return graph.nodes.some((n) => n.kind === "scraper" || n.type === "scraper")
}

/** Maps output field name → owning worker display name (swarm-wide, excluding `excludeWorkerId`). */
export function collectSwarmOutputKeyOwners(
  graph: SwarmGraph | null,
  workerById: Record<string, AdminAgentWorker>,
  excludeWorkerId?: string,
): Map<string, string> {
  const owners = new Map<string, string>()

  if (graphHasScraper(graph)) {
    for (const key of SCRAPER_OUTPUT_KEYS) {
      owners.set(key, "Scraper")
    }
  }

  if (!graph) return owners

  const workerIds = new Set<string>()
  for (const node of graph.nodes) {
    if (node.workerId) workerIds.add(node.workerId)
  }

  for (const workerId of workerIds) {
    if (excludeWorkerId && workerId === excludeWorkerId) continue
    const worker = workerById[workerId]
    if (!worker) continue
    for (const key of extractSchemaPropertyKeys(worker.outputSchema)) {
      if (!owners.has(key)) {
        owners.set(key, worker.name)
      }
    }
  }

  return owners
}

/** Returns an error message when schema keys collide with another worker or reserved names. */
export function validateWorkerOutputSchemaUnique(
  workerId: string,
  schema: Record<string, unknown> | undefined,
  graph: SwarmGraph | null,
  workerById: Record<string, AdminAgentWorker>,
): string | null {
  const keys = extractSchemaPropertyKeys(schema)
  if (keys.length === 0) return null

  const owners = collectSwarmOutputKeyOwners(graph, workerById, workerId)

  for (const key of keys) {
    if (isReservedPromptRoot(key)) {
      return `"${key}" is reserved. Pick another output field name.`
    }
    const owner = owners.get(key)
    if (owner) {
      return `"${key}" is already used by "${owner}" in this swarm. Each output field must be unique.`
    }
  }

  return null
}
