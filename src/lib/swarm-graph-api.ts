import type { SwarmGraph, SwarmGraphNode, UpsertSwarmGraphPayload } from "@/data/api/server"
import type { StartVariable } from "@/components/admin/swarms/editor/nodes/start/data"
import type { SwarmCanvasSnapshot } from "@/lib/merge-swarm-graph"
import { deriveEntryExitFromGraph } from "@/lib/derive-swarm-entry-exit"
import {
  START_CONTROL_KIND,
  findStartGraphNode,
  isStartGraphNode,
  parseStartNodeData,
} from "@/lib/start-node"
import { serializedAgentNodeData } from "@/lib/swarm-node-ref"

function isIfElseGraphNode(node: SwarmGraphNode): boolean {
  return node.kind === "ifelse" || node.type === "ifelse"
}

function isWhileGraphNode(node: SwarmGraphNode): boolean {
  return node.kind === "while" || node.type === "while"
}

function isScraperGraphNode(node: SwarmGraphNode): boolean {
  return node.kind === "scraper" || node.type === "scraper"
}

function isResearchPapersGraphNode(node: SwarmGraphNode): boolean {
  return node.kind === "research_papers" || node.type === "research_papers"
}

function isSwarmGraphNode(node: SwarmGraphNode): boolean {
  return node.kind === "swarm" || node.type === "swarm"
}

function isUserApprovalGraphNode(node: SwarmGraphNode): boolean {
  return node.kind === "user_approval" || node.type === "user_approval" || node.type === "userApproval"
}

function isEndGraphNode(node: SwarmGraphNode): boolean {
  return node.kind === "end" || node.type === "end"
}

function workerGraphNodes(nodes: SwarmGraphNode[]): SwarmGraphNode[] {
  return nodes.filter((n) => Boolean(n.workerId) && !isStartGraphNode(n))
}

/** Walks Start → control nodes → first worker for `entryNode`. */
function firstWorkerIdDownstream(
  snapshot: SwarmCanvasSnapshot,
  startId: string,
): string | null {
  const visited = new Set<string>()
  const queue = [startId]

  while (queue.length > 0) {
    const id = queue.shift()!
    if (visited.has(id)) continue
    visited.add(id)

    const node = snapshot.nodes.find((n) => n.id === id)
    if (node?.workerId) {
      return node.workerId
    }

    for (const edge of snapshot.edges) {
      if (edge.from === id) {
        queue.push(edge.to)
      }
    }
  }

  return null
}

/** Walks Start → first reachable graph node id (worker or control). */
function firstDownstreamNodeId(
  snapshot: SwarmCanvasSnapshot,
  startId: string,
): string | null {
  const visited = new Set<string>()
  const queue = [startId]

  while (queue.length > 0) {
    const id = queue.shift()!
    if (visited.has(id)) continue
    visited.add(id)

    if (id !== startId && snapshot.nodes.some((n) => n.id === id)) {
      return id
    }

    for (const edge of snapshot.edges) {
      if (edge.from === id) {
        queue.push(edge.to)
      }
    }
  }

  return null
}

/** End node with incoming wire(s) and no outgoing wires (or any End if none qualify). */
function findSinkEndNodeId(snapshot: SwarmCanvasSnapshot): string | null {
  const endNodes = snapshot.nodes.filter((n) => isEndGraphNode(n) && n.id)
  for (const node of endNodes) {
    const id = node.id!
    const hasIncoming = snapshot.edges.some((e) => e.to === id)
    const hasOutgoing = snapshot.edges.some((e) => e.from === id)
    if (hasIncoming && !hasOutgoing) {
      return id
    }
  }
  return endNodes[0]?.id ?? null
}

/** Worker-level reachability (paths may cross scraper / if-else nodes). */
function workerLevelEdges(snapshot: SwarmCanvasSnapshot): SwarmCanvasSnapshot["edges"] {
  const workerByNodeId = new Map<string, string>()
  for (const node of snapshot.nodes) {
    if (node.id && node.workerId) {
      workerByNodeId.set(node.id, node.workerId)
    }
  }

  const workerNodeIds = [...workerByNodeId.keys()]
  const projected: SwarmCanvasSnapshot["edges"] = []

  for (const fromNodeId of workerNodeIds) {
    for (const toNodeId of workerNodeIds) {
      if (fromNodeId === toNodeId) continue
      if (!hasDirectedPath(fromNodeId, toNodeId, snapshot.edges)) continue
      projected.push({
        from: workerByNodeId.get(fromNodeId)!,
        to: workerByNodeId.get(toNodeId)!,
        type: "sequential",
        condition: null,
        sourceHandle: null,
      })
    }
  }

  return projected
}

function hasDirectedPath(
  fromNodeId: string,
  toNodeId: string,
  edges: SwarmCanvasSnapshot["edges"],
): boolean {
  const visited = new Set<string>()
  const queue = [fromNodeId]

  while (queue.length > 0) {
    const id = queue.shift()!
    if (id === toNodeId) return true
    if (visited.has(id)) continue
    visited.add(id)
    for (const edge of edges) {
      if (edge.from === id) queue.push(edge.to)
    }
  }

  return false
}

function isBranchGraphNode(node: SwarmGraphNode): boolean {
  const k = node.kind ?? node.type
  return (
    k === "ifelse" ||
    k === "while" ||
    k === "scraper" ||
    k === "research_papers" ||
    k === "swarm" ||
    k === "user_approval" ||
    k === "userApproval"
  )
}

function caseHandleId(caseId: string): string {
  return caseId.startsWith("case-") ? caseId : `case-${caseId}`
}

function ifElseWireMatchesCanonical(canonical: string, wire: string): boolean {
  const a = canonical.trim().toLowerCase()
  const b = wire.trim().toLowerCase()
  if (!a || !b) return false
  if (a === b) return true
  if (a.startsWith("case-") && b === `case-${a}`) return true
  if (b.startsWith("case-case-") && b.slice(5) === a) return true
  return false
}

/** Collapses duplicate If/else wires (legacy `case-case-*` + `case-*` on the same target). */
function dedupeCanvasEdges(edges: SwarmCanvasSnapshot["edges"]): SwarmCanvasSnapshot["edges"] {
  const byPair = new Map<string, SwarmCanvasSnapshot["edges"]>()
  for (const edge of edges) {
    const key = `${edge.from}|${edge.to}`
    const group = byPair.get(key) ?? []
    group.push(edge)
    byPair.set(key, group)
  }

  const result: SwarmCanvasSnapshot["edges"] = []
  for (const group of byPair.values()) {
    if (group.length === 1) {
      result.push(group[0]!)
      continue
    }
    const caseHandles = group
      .map((e) => e.sourceHandle?.trim() ?? "")
      .filter((h) => h.startsWith("case-"))
    if (caseHandles.length >= 2) {
      const canonical =
        caseHandles.find((h) => !h.startsWith("case-case-")) ??
        caseHandles[0]
      if (canonical) {
        let kept = false
        for (const edge of group) {
          const wire = edge.sourceHandle?.trim() ?? ""
          if (wire && ifElseWireMatchesCanonical(canonical, wire)) {
            if (!kept) {
              result.push({ ...edge, sourceHandle: canonical })
              kept = true
            }
            continue
          }
          if (!wire || !caseHandles.some((h) => ifElseWireMatchesCanonical(h, wire))) {
            result.push(edge)
          }
        }
        continue
      }
    }
    result.push(...group)
  }
  return result
}

function ifElseWireMatchesCase(caseId: string, sourceHandle: string): boolean {
  const expected = caseHandleId(caseId).toLowerCase()
  const wire = sourceHandle.trim().toLowerCase()
  if (!wire) return false
  if (wire === expected) return true
  if (wire === `case-${expected}`) return true
  if (expected.startsWith("case-") && wire === expected.slice(5)) return true
  return false
}

/** Each If case with a condition must have a wire from its case port (not only Else). */
export function validateIfElseCaseWiring(snapshot: SwarmCanvasSnapshot): string | null {
  for (const node of snapshot.nodes.filter(isIfElseGraphNode)) {
    if (!node.id) continue
    const raw = node.data
    const cases = Array.isArray((raw as { cases?: unknown })?.cases)
      ? ((raw as { cases: { id?: string; name?: string; condition?: string }[] }).cases ?? [])
      : []
    const outgoing = snapshot.edges.filter((e) => e.from === node.id)

    for (let i = 0; i < cases.length; i += 1) {
      const row = cases[i]
      if (!row) continue
      const condition = typeof row.condition === "string" ? row.condition.trim() : ""
      const caseId = row.id
      if (!condition || typeof caseId !== "string") continue
      const wired = outgoing.some(
        (e) => e.sourceHandle && ifElseWireMatchesCase(caseId, e.sourceHandle),
      )
      if (!wired) {
        const label =
          typeof row.name === "string" && row.name.trim()
            ? row.name.trim()
            : i === 0
              ? "If"
              : "Else if"
        return `If/else "${label}": add a wire from the "${label}" port on the right (handle ${caseHandleId(caseId)}).`
      }
    }
  }

  return null
}

/** Returns an error message when branch nodes have edges without `sourceHandle` (approve/reject/etc.). */
export function validateBranchEdgeHandles(snapshot: SwarmCanvasSnapshot): string | null {
  const branchIds = new Set(
    snapshot.nodes
      .filter(isBranchGraphNode)
      .map((n) => n.id)
      .filter((id): id is string => typeof id === "string" && id.length > 0),
  )

  for (const edge of snapshot.edges) {
    if (edge.from && branchIds.has(edge.from) && !edge.sourceHandle?.trim()) {
      return "Branch nodes must connect from Loop, Done, Approve, Reject, Success, Failed, or case handles — re-draw those edges from the node ports."
    }
  }

  return null
}

/** Maps canvas snapshot → API payload (backend-safe shapes). */
export function canvasSnapshotToApiPayload(
  snapshot: SwarmCanvasSnapshot,
): UpsertSwarmGraphPayload | null {
  const startNode = findStartGraphNode({ ...snapshot, id: "draft", swarmId: "" } as SwarmGraph)
  const startId = startNode?.id

  const downstreamIds = startId
    ? snapshot.edges.filter((e) => e.from === startId).map((e) => e.to)
    : []

  const apiNodes: SwarmGraphNode[] = []

  for (const node of snapshot.nodes) {
    if (isStartGraphNode(node)) {
      if (!node.id) continue
      const parsed = parseStartNodeData(node)
      const raw = node.data as Record<string, unknown> | undefined
      const inputVariables =
        parsed?.inputVariables ??
        (Array.isArray(raw?.inputVariables) ? (raw.inputVariables as StartVariable[]) : [])
      const stateVariables =
        parsed?.stateVariables ??
        (Array.isArray(raw?.stateVariables) ? (raw.stateVariables as StartVariable[]) : [])
      apiNodes.push({
        id: node.id,
        position: node.position,
        data: {
          controlKind: START_CONTROL_KIND,
          inputVariables,
          stateVariables,
          downstreamNodeIds: downstreamIds,
        },
      })
      continue
    }
    if (isIfElseGraphNode(node)) {
      apiNodes.push({
        id: node.id,
        kind: "ifelse",
        position: node.position,
        data: node.data ?? {},
      })
      continue
    }
    if (isWhileGraphNode(node)) {
      apiNodes.push({
        id: node.id,
        kind: "while",
        position: node.position,
        data: node.data ?? {},
      })
      continue
    }
    if (isScraperGraphNode(node)) {
      apiNodes.push({
        id: node.id,
        kind: "scraper",
        position: node.position,
        data: node.data ?? {},
      })
      continue
    }
    if (isSwarmGraphNode(node)) {
      apiNodes.push({
        id: node.id,
        kind: "swarm",
        position: node.position,
        data: node.data ?? {},
      })
      continue
    }
    if (isUserApprovalGraphNode(node)) {
      apiNodes.push({
        id: node.id,
        kind: "user_approval",
        position: node.position,
        data: node.data ?? {},
      })
      continue
    }
    if (isEndGraphNode(node)) {
      apiNodes.push({
        id: node.id,
        kind: "end",
        position: node.position,
        data: node.data ?? {},
      })
      continue
    }
    if (!node.workerId) continue
    const agentData = node.data as Record<string, unknown> | undefined
    apiNodes.push({
      id: node.id ?? node.workerId,
      kind: "worker",
      workerId: node.workerId,
      type: "worker",
      position: node.position,
      data: serializedAgentNodeData({
        ref: typeof agentData?.ref === "string" ? agentData.ref : undefined,
        label: typeof agentData?.label === "string" ? agentData.label : undefined,
        scalable: agentData?.scalable === true,
        outputArrayKey:
          typeof agentData?.outputArrayKey === "string" ? agentData.outputArrayKey : undefined,
        inputArrayExpression:
          typeof agentData?.inputArrayExpression === "string"
            ? agentData.inputArrayExpression
            : undefined,
        inputArrayPath:
          typeof agentData?.inputArrayPath === "string" ? agentData.inputArrayPath : undefined,
      }),
    })
  }

  if (apiNodes.length === 0) return null

  const rawEdges = startId
    ? snapshot.edges.filter((e) => e.from !== startId)
    : [...snapshot.edges]
  const apiEdges = dedupeCanvasEdges(rawEdges)

  const workers = workerGraphNodes(snapshot.nodes)
  const workerIds = workers.map((n) => n.workerId!).filter(Boolean)
  const workerEdges = workerLevelEdges(snapshot)

  const positions = new Map(
    workers.map((n) => [n.workerId!, { x: n.position.x, y: n.position.y }]),
  )

  let exitNode = deriveEntryExitFromGraph(workerIds, workerEdges, positions).exitNode
  if (!exitNode) {
    exitNode = findSinkEndNodeId(snapshot)
  }
  if (!exitNode) return null

  let entryNode: string | null = null
  if (startId) {
    entryNode = firstWorkerIdDownstream(snapshot, startId)
    if (!entryNode) {
      entryNode = firstDownstreamNodeId(snapshot, startId)
    }
  }
  if (!entryNode) {
    entryNode = deriveEntryExitFromGraph(workerIds, workerEdges, positions).entryNode
  }
  if (!entryNode) return null

  return {
    nodes: apiNodes,
    edges: apiEdges,
    entryNode,
    exitNode,
  }
}

/** Start → agent edges stripped on save; restore for the canvas editor. */
export function startDownstreamIdsFromGraph(graph: SwarmGraph | null | undefined): string[] {
  const start = findStartGraphNode(graph)
  if (!start?.data || typeof start.data !== "object") return []
  const raw = start.data as { downstreamNodeIds?: unknown }
  if (!Array.isArray(raw.downstreamNodeIds)) return []
  return raw.downstreamNodeIds.filter((id): id is string => typeof id === "string" && id.length > 0)
}
