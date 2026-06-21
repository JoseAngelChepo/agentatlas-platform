"use client"

import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from "react"
import {
  Background,
  Controls,
  MarkerType,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  SelectionMode,
  addEdge,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeChange,
  type NodeChange,
  type OnSelectionChangeParams,
  type ReactFlowInstance,
  type XYPosition,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import type { SwarmGraph } from "@/data/api/server"
import { deriveEntryExitFromGraph } from "@/lib/derive-swarm-entry-exit"
import { startDownstreamIdsFromGraph } from "@/lib/swarm-graph-api"
import { START_CONTROL_KIND, isStartGraphNode, parseStartNodeData } from "@/lib/start-node"
import { placeSwarmNodes } from "@/lib/swarm-layout"
import type { SwarmCanvasSnapshot } from "@/lib/merge-swarm-graph"
import { serializedAgentNodeData } from "@/lib/swarm-node-ref"
import { toast } from "@/lib/toast"
import {
  type AgentNodeData,
  type AgentNodeType,
  type EditorNode,
  buildStartNodeData,
  getControlNodeDefinition,
  getControlNodeDefinitionByFlowType,
  isAgentNode,
  isControlFlowNode,
  START_FLOW_TYPE,
  START_NODE_KIND,
  SWARM_FLOW_NODE_TYPES,
  SWARM_PALETTE_CONTROL_MIME,
  type ControlNodeKind,
  type StartNodeData,
} from "./nodes"
import { IF_ELSE_FLOW_TYPE } from "./nodes/ifelse/definition"
import type { IfElseNodeData } from "./nodes/ifelse/data"
import { WHILE_FLOW_TYPE } from "./nodes/while/definition"
import type { WhileNodeData } from "./nodes/while/data"
import { SCRAPER_FLOW_TYPE } from "./nodes/scraper/definition"
import { RESEARCH_PAPERS_FLOW_TYPE } from "./nodes/researchPapers/definition"
import type { ScraperNodeData } from "./nodes/scraper/data"
import type { ResearchPapersNodeData } from "./nodes/researchPapers/data"
import { SWARM_FLOW_TYPE } from "./nodes/swarm/definition"
import { buildSwarmNodeData, type SwarmNodeData } from "./nodes/swarm/data"
import { USER_APPROVAL_FLOW_TYPE } from "./nodes/userApproval/definition"
import { buildUserApprovalNodeData, type UserApprovalNodeData } from "./nodes/userApproval/data"
import { END_FLOW_TYPE } from "./nodes/end/definition"
import { buildEndNodeData, type EndNodeData } from "./nodes/end/data"
import DeletableEdge from "./edges/DeletableEdge"
import { SWARM_PALETTE_AGENT_MIME } from "./SwarmEditorSidebar"
import {
  useSwarmEditor,
  type SwarmEditorNodeApi,
} from "./SwarmEditorContext"

export type { EditorNode } from "./nodes"

const nodeTypes = SWARM_FLOW_NODE_TYPES
const edgeTypes = { default: DeletableEdge }

function agentNodes(nodes: EditorNode[]): AgentNodeType[] {
  return nodes.filter(isAgentNode)
}

/** Keep `nodesRef` in sync before `onOpenNode` so the config panel can resolve the new node. */
function appendNodeSyncRef(
  nodesRef: React.MutableRefObject<EditorNode[]>,
  setNodes: ReturnType<typeof useNodesState<EditorNode>>[1],
  newNode: EditorNode,
): void {
  setNodes((current) => {
    const next = [...current, newNode]
    nodesRef.current = next
    return next
  })
}

const DUPLICATE_OFFSET = { x: 48, y: 48 }

/** Default canvas framing — higher padding / lower maxZoom = less zoomed in. */
const CANVAS_FIT_PADDING = 0.5
const CANVAS_FIT_OPTIONS = {
  padding: CANVAS_FIT_PADDING,
  maxZoom: 1,
  minZoom: 0.35,
} as const
const CANVAS_FIT_ANIMATION = {
  padding: CANVAS_FIT_PADDING,
  maxZoom: CANVAS_FIT_OPTIONS.maxZoom,
  duration: 220,
} as const

type SwarmNodeClipboardItem =
  | {
      kind: "agent"
      workerId: string
      label?: string
      offset: XYPosition
    }
  | {
      kind: "control"
      flowType: string
      controlKind: ControlNodeKind
      data: unknown
      offset: XYPosition
    }

type SwarmNodeClipboard = {
  anchor: XYPosition
  items: SwarmNodeClipboardItem[]
}

function selectionAnchor(nodes: EditorNode[]): XYPosition {
  let minX = Infinity
  let minY = Infinity
  for (const node of nodes) {
    minX = Math.min(minX, node.position.x)
    minY = Math.min(minY, node.position.y)
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0 }
  return { x: minX, y: minY }
}

function nodeToClipboardItem(
  node: EditorNode,
  anchor: XYPosition,
): SwarmNodeClipboardItem | null {
  const offset = {
    x: node.position.x - anchor.x,
    y: node.position.y - anchor.y,
  }

  if (isAgentNode(node)) {
    return {
      kind: "agent",
      workerId: node.data.workerId,
      label: node.data.label,
      offset,
    }
  }

  const def = getControlNodeDefinitionByFlowType(node.type)
  if (!def) return null

  return {
    kind: "control",
    flowType: node.type,
    controlKind: def.kind as ControlNodeKind,
    data: structuredClone(node.data),
    offset,
  }
}

function newAgentNodeId(): string {
  return `agent-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
}

const NODE_WIDTH = 224
const NODE_HEIGHT = 168

const defaultEdgeOptions: Partial<Edge> = {
  type: "default",
  markerEnd: { type: MarkerType.ArrowClosed, color: "var(--app-text)" },
  style: { stroke: "var(--app-border-strong)", strokeWidth: 1.5 },
}

export type SwarmEditorHandle = {
  /** Insert an agent node at the viewport center (or `position`), persisting after the change. */
  addAgent: (
    workerId: string,
    position?: XYPosition,
    options?: { label?: string; openConfig?: boolean },
  ) => string | null
  /** Clone a control-flow node on the canvas (same data, new id). */
  duplicateControlNode: (nodeId: string) => string | null
  /** Read a node's canvas position. */
  getNodePosition: (nodeId: string) => XYPosition | null
  /** Insert a control-flow node; returns the new React Flow node id. */
  addControlNode: (
    kind: ControlNodeKind,
    position?: XYPosition,
    options?: { openConfig?: boolean },
  ) => string
  /** Read/update control nodes for the side config panel. */
  getNodeApi: () => SwarmEditorNodeApi
  /** Serialize the current graph in the API shape expected by `upsertSwarmGraph`. */
  toJSON: () => SwarmCanvasSnapshot
  /** Replace canvas state with a graph fetched from the API. */
  loadFromJSON: (graph: SwarmGraph | null) => void
}

type Props = {
  /** Initial graph from the API (null = empty canvas). */
  initialGraph: SwarmGraph | null
  /** Notified once the imperative editor handle is ready. */
  onEditorReady: (editor: SwarmEditorHandle) => void
  /** Persist the current graph state. Called after every mutation. */
  onPersist: () => void
  /** Live canvas snapshot for configure-panel variable pickers (before API save). */
  onCanvasChange?: (snapshot: SwarmCanvasSnapshot) => void
  /** Drop from palette: create a new AgentWorker at the drop position. */
  onPlaceNewAgent?: (position: XYPosition) => void
  /** Paste an agent from the clipboard (clones the worker). */
  onPasteAgent?: (workerId: string, position: XYPosition) => void
  /** Bumps parent state so the node config panel re-reads canvas data. */
  onControlNodeDataChange?: () => void
}

function workerPositionsFromNodes(nodes: EditorNode[]): Map<string, { x: number; y: number }> {
  return new Map(
    agentNodes(nodes).map((node) => [
      node.data.workerId,
      { x: node.position.x, y: node.position.y },
    ]),
  )
}

function wireEdgesFromFlow(nodes: EditorNode[], edges: Edge[]): SwarmCanvasSnapshot["edges"] {
  const knownNodeIds = new Set(nodes.map((n) => n.id))
  const wire: SwarmCanvasSnapshot["edges"] = []
  for (const edge of edges) {
    if (!knownNodeIds.has(edge.source) || !knownNodeIds.has(edge.target)) continue
    wire.push({
      from: edge.source,
      to: edge.target,
      type: "sequential",
      condition: null,
      sourceHandle: edge.sourceHandle ?? null,
    })
  }
  return wire
}

function workerOnlyEdges(
  nodes: EditorNode[],
  wireEdges: SwarmCanvasSnapshot["edges"],
): SwarmCanvasSnapshot["edges"] {
  const workerByNodeId = new Map<string, string>()
  for (const node of agentNodes(nodes)) workerByNodeId.set(node.id, node.data.workerId)

  const projected: SwarmCanvasSnapshot["edges"] = []
  for (const edge of wireEdges) {
    const from = workerByNodeId.get(edge.from)
    const to = workerByNodeId.get(edge.to)
    if (!from || !to) continue
    projected.push({ ...edge, from, to })
  }
  return projected
}

function hasStartNode(nodes: EditorNode[]): boolean {
  return nodes.some((n) => n.type === START_FLOW_TYPE)
}

function serializeGraphNodes(nodes: EditorNode[]): SwarmCanvasSnapshot["nodes"] {
  const serialized: SwarmCanvasSnapshot["nodes"] = []
  for (const node of nodes) {
    if (isAgentNode(node)) {
      serialized.push({
        id: node.id ?? node.data.workerId,
        kind: "worker",
        workerId: node.data.workerId,
        type: "worker",
        position: { x: node.position.x, y: node.position.y },
        data: serializedAgentNodeData(node.data),
      })
      continue
    }
    if (node.type === START_FLOW_TYPE) {
      const startData = node.data as StartNodeData
      serialized.push({
        id: node.id,
        type: START_FLOW_TYPE,
        position: { x: node.position.x, y: node.position.y },
        data: {
          controlKind: START_CONTROL_KIND,
          inputVariables: startData.inputVariables ?? [],
          stateVariables: startData.stateVariables ?? [],
        },
      })
      continue
    }
    if (isControlFlowNode(node) && node.type === IF_ELSE_FLOW_TYPE) {
      serialized.push({
        id: node.id,
        kind: "ifelse",
        position: { x: node.position.x, y: node.position.y },
        data: node.data as unknown as Record<string, unknown>,
      })
      continue
    }
    if (isControlFlowNode(node) && node.type === WHILE_FLOW_TYPE) {
      serialized.push({
        id: node.id,
        kind: "while",
        position: { x: node.position.x, y: node.position.y },
        data: node.data as unknown as Record<string, unknown>,
      })
      continue
    }
    if (isControlFlowNode(node) && node.type === SCRAPER_FLOW_TYPE) {
      serialized.push({
        id: node.id,
        kind: "scraper",
        position: { x: node.position.x, y: node.position.y },
        data: node.data as unknown as Record<string, unknown>,
      })
      continue
    }
    if (isControlFlowNode(node) && node.type === RESEARCH_PAPERS_FLOW_TYPE) {
      serialized.push({
        id: node.id,
        kind: "research_papers",
        position: { x: node.position.x, y: node.position.y },
        data: node.data as unknown as Record<string, unknown>,
      })
      continue
    }
    if (isControlFlowNode(node) && node.type === SWARM_FLOW_TYPE) {
      serialized.push({
        id: node.id,
        kind: "swarm",
        position: { x: node.position.x, y: node.position.y },
        data: node.data as unknown as Record<string, unknown>,
      })
      continue
    }
    if (isControlFlowNode(node) && node.type === USER_APPROVAL_FLOW_TYPE) {
      serialized.push({
        id: node.id,
        kind: "user_approval",
        position: { x: node.position.x, y: node.position.y },
        data: node.data as unknown as Record<string, unknown>,
      })
      continue
    }
    if (isControlFlowNode(node) && node.type === END_FLOW_TYPE) {
      serialized.push({
        id: node.id,
        kind: "end",
        position: { x: node.position.x, y: node.position.y },
        data: node.data as unknown as Record<string, unknown>,
      })
      continue
    }
  }
  return serialized
}

/** Serializes the canvas; entry is the Start node when present, else inferred worker entry. */
function buildCanvasSnapshot(nodes: EditorNode[], edges: Edge[]): SwarmCanvasSnapshot {
  const wireEdges = wireEdgesFromFlow(nodes, edges)
  const workers = agentNodes(nodes)
  const workerIds = workers.map((node) => node.data.workerId)
  const startNode = nodes.find((n) => n.type === START_FLOW_TYPE)

  const { exitNode } = deriveEntryExitFromGraph(
    workerIds,
    workerOnlyEdges(nodes, wireEdges),
    workerPositionsFromNodes(nodes),
  )

  let entryNode: string | null
  if (startNode) {
    entryNode = startNode.id
  } else {
    entryNode = deriveEntryExitFromGraph(
      workerIds,
      workerOnlyEdges(nodes, wireEdges),
      workerPositionsFromNodes(nodes),
    ).entryNode
  }

  return {
    nodes: serializeGraphNodes(nodes),
    edges: wireEdges,
    entryNode,
    exitNode,
  }
}

function tagFor(workerId: string, entry: string | null, exit: string | null): AgentNodeData["tag"] {
  if (workerId === entry && workerId === exit) return "entry-exit"
  if (workerId === entry) return "entry"
  if (workerId === exit) return "exit"
  return null
}

function applyTags(nodes: EditorNode[], entry: string | null, exit: string | null): EditorNode[] {
  const startPresent = hasStartNode(nodes)
  return nodes.map((node) => {
    if (!isAgentNode(node)) return node
    if (startPresent) {
      const tag = node.data.workerId === exit ? "exit" : null
      return { ...node, data: { ...node.data, tag } }
    }
    return { ...node, data: { ...node.data, tag: tagFor(node.data.workerId, entry, exit) } }
  })
}

function SwarmEditorCanvasInner(
  {
    initialGraph,
    onEditorReady,
    onPersist,
    onCanvasChange,
    onPlaceNewAgent,
    onPasteAgent,
    onControlNodeDataChange,
  }: Props,
  ref: React.ForwardedRef<SwarmEditorHandle>,
) {
  const { selectedNodeId, onSelectNode, onOpenNode, workerById, onDuplicateNode } =
    useSwarmEditor()

  const { setEdges: setFlowEdges, deleteElements } = useReactFlow()

  const [nodes, setNodes, onNodesChange] = useNodesState<EditorNode>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  const nodesRef = useRef<EditorNode[]>([])
  const edgesRef = useRef<Edge[]>([])
  const clipboardRef = useRef<SwarmNodeClipboard | null>(null)
  const pasteCountRef = useRef(0)
  const onPasteAgentRef = useRef(onPasteAgent)
  const persistRef = useRef(onPersist)
  const flowInstanceRef = useRef<ReactFlowInstance<EditorNode, Edge> | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const loadedGraphRef = useRef<string | null>(null)
  const { fitView } = useReactFlow()

  useEffect(() => {
    nodesRef.current = nodes
  }, [nodes])
  useEffect(() => {
    edgesRef.current = edges
  }, [edges])
  useEffect(() => {
    persistRef.current = onPersist
  }, [onPersist])

  const canvasChangeRef = useRef(onCanvasChange)
  const onControlNodeDataChangeRef = useRef(onControlNodeDataChange)
  useEffect(() => {
    canvasChangeRef.current = onCanvasChange
  }, [onCanvasChange])
  useEffect(() => {
    onControlNodeDataChangeRef.current = onControlNodeDataChange
  }, [onControlNodeDataChange])
  useEffect(() => {
    onPasteAgentRef.current = onPasteAgent
  }, [onPasteAgent])

  const schedulePersist = useCallback(() => {
    setTimeout(() => {
      const snapshot = buildCanvasSnapshot(nodesRef.current, edgesRef.current)
      setNodes(applyTags(nodesRef.current, snapshot.entryNode, snapshot.exitNode))
      canvasChangeRef.current?.(snapshot)
      persistRef.current()
    }, 50)
  }, [setNodes])

  const computeDropPosition = useCallback((): XYPosition => {
    const instance = flowInstanceRef.current
    const wrap = wrapRef.current
    if (!instance || !wrap) return { x: 200, y: 160 }
    const rect = wrap.getBoundingClientRect()
    const center = instance.screenToFlowPosition({
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    })
    let x = center.x - NODE_WIDTH / 2
    let y = center.y - NODE_HEIGHT / 2

    let lowestBottom = y
    let overlap = false
    for (const node of nodesRef.current) {
      if (Math.abs(node.position.x - x) >= NODE_WIDTH / 2) continue
      overlap = true
      const bottom = node.position.y + NODE_HEIGHT
      if (bottom > lowestBottom) lowestBottom = bottom
    }
    if (overlap) {
      y = lowestBottom + 24
    }
    return { x, y }
  }, [])

  const insertAgent = useCallback(
    (
      workerId: string,
      position?: XYPosition,
      options?: { label?: string; openConfig?: boolean },
    ): string | null => {
      const worker = workerById[workerId]
      if (!worker) return null

      const pos = position ?? computeDropPosition()
      const id = newAgentNodeId()
      const newNode: AgentNodeType = {
        id,
        type: "agent",
        position: pos,
        data: {
          workerId,
          tag: null,
        },
      }

      appendNodeSyncRef(nodesRef, setNodes, newNode)
      onSelectNode(id)
      if (options?.openConfig !== false) {
        onOpenNode(id)
      }
      schedulePersist()
      return id
    },
    [computeDropPosition, onOpenNode, onSelectNode, schedulePersist, setNodes, workerById],
  )

  const duplicateControlNode = useCallback(
    (nodeId: string): string | null => {
      const source = nodesRef.current.find((n) => n.id === nodeId)
      if (!source || isAgentNode(source)) return null

      const def = getControlNodeDefinitionByFlowType(source.type)
      if (!def) return null
      if (def.kind === START_NODE_KIND && nodesRef.current.some((n) => n.type === START_FLOW_TYPE)) {
        toast.info("This swarm already has a Start node")
        return null
      }

      const id = `${def.flowType}-${Date.now()}`
      const newNode = {
        id,
        type: source.type,
        position: {
          x: source.position.x + DUPLICATE_OFFSET.x,
          y: source.position.y + DUPLICATE_OFFSET.y,
        },
        data: structuredClone(source.data),
      } as EditorNode

      appendNodeSyncRef(nodesRef, setNodes, newNode)
      onSelectNode(id)
      onOpenNode(id)
      schedulePersist()
      return id
    },
    [onOpenNode, onSelectNode, schedulePersist, setNodes],
  )

  const getNodePosition = useCallback((nodeId: string): XYPosition | null => {
    const node = nodesRef.current.find((n) => n.id === nodeId)
    return node ? { x: node.position.x, y: node.position.y } : null
  }, [])

  const insertControlNode = useCallback(
    (
      kind: ControlNodeKind,
      position?: XYPosition,
      options?: { openConfig?: boolean },
    ): string => {
      const def = getControlNodeDefinition(kind)
      if (!def) return ""

      if (kind === START_NODE_KIND && nodesRef.current.some((n) => n.type === START_FLOW_TYPE)) {
        toast.info("This swarm already has a Start node")
        return ""
      }

      const pos = position ?? computeDropPosition()
      const id = `${def.flowType}-${Date.now()}`

      const newNode = {
        id,
        type: def.flowType,
        position: pos,
        data: def.buildDefaultData(),
      } as EditorNode

      appendNodeSyncRef(nodesRef, setNodes, newNode)

      const openConfig = options?.openConfig !== false
      if (openConfig) {
        onSelectNode(id)
        onOpenNode(id)
      } else {
        onSelectNode(id)
      }

      return id
    },
    [computeDropPosition, onOpenNode, onSelectNode, setNodes],
  )

  const schedulePersistRef = useRef(schedulePersist)
  useEffect(() => {
    schedulePersistRef.current = schedulePersist
  }, [schedulePersist])

  const nodeApi = useMemo(
    (): SwarmEditorNodeApi => ({
      getControlNodeKind(nodeId) {
        const node = nodesRef.current.find((n) => n.id === nodeId)
        if (!node || isAgentNode(node)) return null
        const def = getControlNodeDefinitionByFlowType(node.type)
        return (def?.kind as ControlNodeKind) ?? null
      },
      isAgentNode(nodeId) {
        const node = nodesRef.current.find((n) => n.id === nodeId)
        return Boolean(node && isAgentNode(node))
      },
      getAgentWorkerId(nodeId) {
        const node = nodesRef.current.find((n) => n.id === nodeId)
        if (!node || !isAgentNode(node)) return null
        return node.data.workerId
      },
      getNodeData<T>(nodeId: string) {
        const node = nodesRef.current.find((n) => n.id === nodeId)
        if (!node) return null
        return node.data as T
      },
      setNodeData(nodeId, data) {
        setNodes((current) => {
          const next = current.map((n) =>
            n.id === nodeId ? ({ ...n, data } as EditorNode) : n,
          )
          nodesRef.current = next
          return next
        })
        schedulePersistRef.current()
        onControlNodeDataChangeRef.current?.()
      },
      removeSourceHandleEdges(nodeId, sourceHandle) {
        setFlowEdges((current) => {
          const next = current.filter(
            (e) => !(e.source === nodeId && e.sourceHandle === sourceHandle),
          )
          edgesRef.current = next
          canvasChangeRef.current?.(buildCanvasSnapshot(nodesRef.current, next))
          return next
        })
        onControlNodeDataChangeRef.current?.()
      },
      deleteNode(nodeId) {
        onSelectNode(null)
        void deleteElements({ nodes: [{ id: nodeId }] })
        onControlNodeDataChangeRef.current?.()
      },
    }),
    [deleteElements, onSelectNode, schedulePersist, setFlowEdges, setNodes],
  )

  const onConnect = useCallback(
    (params: Connection) => {
      if (!params.source || !params.target || params.source === params.target) return
      const targetNode = nodesRef.current.find((n) => n.id === params.target)
      if (targetNode?.type === START_FLOW_TYPE) return

      const sourceNode = nodesRef.current.find((n) => n.id === params.source)
      const sourceType = sourceNode?.type
      const isBranchSource =
        sourceType === IF_ELSE_FLOW_TYPE ||
        sourceType === WHILE_FLOW_TYPE ||
        sourceType === SCRAPER_FLOW_TYPE ||
        sourceType === RESEARCH_PAPERS_FLOW_TYPE ||
        sourceType === SWARM_FLOW_TYPE ||
        sourceType === USER_APPROVAL_FLOW_TYPE
      if (isBranchSource && !params.sourceHandle?.trim()) {
        toast.error(
          "Connect from Loop, Done, Approve, Reject, Success, Failed, or case handle — not the node body",
        )
        return
      }

      setEdges((current) =>
        addEdge(
          {
            ...defaultEdgeOptions,
            ...params,
            id: `${params.source}-${params.target}-${params.sourceHandle ?? "default"}`,
          },
          current,
        ),
      )
      schedulePersist()
    },
    [schedulePersist, setEdges],
  )

  const onInit = useCallback(
    (instance: ReactFlowInstance<EditorNode, Edge>) => {
      flowInstanceRef.current = instance
      requestAnimationFrame(() => {
        void fitView(CANVAS_FIT_ANIMATION)
      })
    },
    [fitView],
  )

  useEffect(() => {
    if (!initialGraph || initialGraph.id === loadedGraphRef.current) return
    loadedGraphRef.current = initialGraph.id

    const placed = placeSwarmNodes(
      initialGraph.nodes,
      initialGraph.edges.map((e) => ({ from: e.from, to: e.to })),
      initialGraph.entryNode,
    )

    const flowNodes: EditorNode[] = []

    for (const node of placed) {
      if (isStartGraphNode(node)) {
        const parsed = parseStartNodeData(node)
        flowNodes.push({
          id: node.id ?? `start-${Date.now()}`,
          type: START_FLOW_TYPE,
          position: { x: node.position.x, y: node.position.y },
          data: (parsed ?? buildStartNodeData()) as StartNodeData,
        })
        continue
      }
      const kind =
        node.kind ??
        (node.type === IF_ELSE_FLOW_TYPE
          ? "ifelse"
          : node.type === WHILE_FLOW_TYPE
            ? "while"
          : node.type === SCRAPER_FLOW_TYPE
            ? "scraper"
            : node.type === RESEARCH_PAPERS_FLOW_TYPE
              ? "research_papers"
            : node.type === SWARM_FLOW_TYPE
              ? "swarm"
              : node.type === USER_APPROVAL_FLOW_TYPE
              ? "user_approval"
              : node.type === END_FLOW_TYPE
                ? "end"
                : "worker")
      if (kind === "ifelse" || node.type === IF_ELSE_FLOW_TYPE) {
        flowNodes.push({
          id: node.id ?? `ifelse-${Date.now()}`,
          type: IF_ELSE_FLOW_TYPE,
          position: { x: node.position.x, y: node.position.y },
          data: (node.data ?? { cases: [] }) as IfElseNodeData,
        })
        continue
      }
      if (kind === "while" || node.type === WHILE_FLOW_TYPE) {
        flowNodes.push({
          id: node.id ?? `while-${Date.now()}`,
          type: WHILE_FLOW_TYPE,
          position: { x: node.position.x, y: node.position.y },
          data: (node.data ?? { condition: "" }) as WhileNodeData,
        })
        continue
      }
      if (kind === "scraper" || node.type === SCRAPER_FLOW_TYPE) {
        flowNodes.push({
          id: node.id ?? `scraper-${Date.now()}`,
          type: SCRAPER_FLOW_TYPE,
          position: { x: node.position.x, y: node.position.y },
          data: (node.data ?? { urlSource: "runInput", urlPath: "website" }) as ScraperNodeData,
        })
        continue
      }
      if (kind === "research_papers" || node.type === RESEARCH_PAPERS_FLOW_TYPE) {
        flowNodes.push({
          id: node.id ?? `research_papers-${Date.now()}`,
          type: RESEARCH_PAPERS_FLOW_TYPE,
          position: { x: node.position.x, y: node.position.y },
          data: (node.data ?? {
            querySource: "runInput",
            queryPath: "query",
            limit: 10,
          }) as ResearchPapersNodeData,
        })
        continue
      }
      if (kind === "swarm" || node.type === SWARM_FLOW_TYPE) {
        flowNodes.push({
          id: node.id ?? `swarm-${Date.now()}`,
          type: SWARM_FLOW_TYPE,
          position: { x: node.position.x, y: node.position.y },
          data: (node.data ?? buildSwarmNodeData()) as SwarmNodeData,
        })
        continue
      }
      if (kind === "user_approval" || node.type === USER_APPROVAL_FLOW_TYPE) {
        flowNodes.push({
          id: node.id ?? `user_approval-${Date.now()}`,
          type: USER_APPROVAL_FLOW_TYPE,
          position: { x: node.position.x, y: node.position.y },
          data: (node.data ?? buildUserApprovalNodeData()) as UserApprovalNodeData,
        })
        continue
      }
      if (kind === "end" || node.type === END_FLOW_TYPE) {
        flowNodes.push({
          id: node.id ?? `end-${Date.now()}`,
          type: END_FLOW_TYPE,
          position: { x: node.position.x, y: node.position.y },
          data: (node.data ?? buildEndNodeData()) as EndNodeData,
        })
        continue
      }
      if (!node.workerId) continue
      flowNodes.push({
        id: node.id ?? newAgentNodeId(),
        type: "agent",
        position: { x: node.position.x, y: node.position.y },
        data: {
          workerId: node.workerId,
          label:
            typeof node.data?.label === "string" ? (node.data.label as string) : undefined,
          scalable: node.data?.scalable === true,
          outputArrayKey:
            typeof node.data?.outputArrayKey === "string"
              ? (node.data.outputArrayKey as string)
              : undefined,
          inputArrayExpression:
            typeof node.data?.inputArrayExpression === "string"
              ? (node.data.inputArrayExpression as string)
              : typeof node.data?.inputArrayPath === "string"
                ? (node.data.inputArrayPath as string)
                : undefined,
          tag: null,
        },
      })
    }

    const nodeIdByKey = new Map<string, string>()
    for (const node of flowNodes) {
      nodeIdByKey.set(node.id, node.id)
      if (isAgentNode(node)) {
        nodeIdByKey.set(node.data.workerId, node.id)
      }
    }

    const flowEdges: Edge[] = []
    for (const edge of initialGraph.edges) {
      const sourceId = nodeIdByKey.get(edge.from) ?? edge.from
      const targetId = nodeIdByKey.get(edge.to) ?? edge.to
      if (!nodeIdByKey.has(sourceId) && !flowNodes.some((n) => n.id === sourceId)) continue
      if (!nodeIdByKey.has(targetId) && !flowNodes.some((n) => n.id === targetId)) continue
      flowEdges.push({
        id: `${sourceId}-${targetId}-${edge.sourceHandle ?? edge.type}`,
        source: sourceId,
        target: targetId,
        sourceHandle: edge.sourceHandle ?? undefined,
        ...defaultEdgeOptions,
      })
    }

    const startNode = flowNodes.find((n) => n.type === START_FLOW_TYPE)
    const restoredStartTargets = startDownstreamIdsFromGraph(initialGraph)
    if (startNode && restoredStartTargets.length > 0) {
      for (const targetId of restoredStartTargets) {
        const targetFlowId = nodeIdByKey.get(targetId) ?? targetId
        if (!flowNodes.some((n) => n.id === targetFlowId)) continue
        const edgeKey = `${startNode.id}-${targetFlowId}-start`
        if (flowEdges.some((e) => e.id === edgeKey)) continue
        flowEdges.push({
          id: edgeKey,
          source: startNode.id,
          target: targetFlowId,
          ...defaultEdgeOptions,
        })
      }
    }

    const snapshot = buildCanvasSnapshot(flowNodes, flowEdges)
    setNodes(applyTags(flowNodes, snapshot.entryNode, snapshot.exitNode))
    setEdges(flowEdges)
    nodesRef.current = applyTags(flowNodes, snapshot.entryNode, snapshot.exitNode)
    edgesRef.current = flowEdges

    requestAnimationFrame(() => {
      void fitView(CANVAS_FIT_ANIMATION)
    })
  }, [initialGraph, fitView, setEdges, setNodes, workerById])

  const handle: SwarmEditorHandle = useMemo(
    () => ({
      addAgent: (workerId, position, options) => insertAgent(workerId, position, options),
      duplicateControlNode: (nodeId) => duplicateControlNode(nodeId),
      getNodePosition: (nodeId) => getNodePosition(nodeId),
      addControlNode: (kind, position, options) => insertControlNode(kind, position, options),
      getNodeApi: () => nodeApi,
      toJSON: () => buildCanvasSnapshot(nodesRef.current, edgesRef.current),
      loadFromJSON: (graph) => {
        loadedGraphRef.current = null
        if (!graph) {
          setNodes([])
          setEdges([])
          return
        }
        loadedGraphRef.current = graph.id
        // delegated through the initialGraph effect when caller updates it
      },
    }),
    [duplicateControlNode, getNodePosition, insertAgent, insertControlNode, nodeApi, setEdges, setNodes],
  )

  useImperativeHandle(ref, () => handle, [handle])

  const onEditorReadyRef = useRef(onEditorReady)
  useEffect(() => {
    onEditorReadyRef.current = onEditorReady
  }, [onEditorReady])

  useEffect(() => {
    onEditorReadyRef.current(handle)
  }, [handle])

  const onSelectionChange = useCallback(
    ({ nodes: selected }: OnSelectionChangeParams) => {
      if (selected.length === 0) {
        onSelectNode(null)
        return
      }
      if (selected.length === 1) {
        onSelectNode(selected[0]!.id)
        return
      }
      onSelectNode(null)
    },
    [onSelectNode],
  )

  const onNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: EditorNode) => {
      onSelectNode(node.id)
      onOpenNode(node.id)
    },
    [onOpenNode, onSelectNode],
  )

  const onPaneClick = useCallback(() => {
    onSelectNode(null)
  }, [onSelectNode])

  const copySelection = useCallback(() => {
    const selected = nodesRef.current.filter((node) => node.selected)
    if (selected.length === 0) return

    const anchor = selectionAnchor(selected)
    const items = selected
      .map((node) => nodeToClipboardItem(node, anchor))
      .filter((item): item is SwarmNodeClipboardItem => item != null)

    if (items.length === 0) return

    clipboardRef.current = { anchor, items }
    pasteCountRef.current = 0
  }, [])

  const pasteFromClipboard = useCallback(() => {
    const clip = clipboardRef.current
    if (!clip || clip.items.length === 0) return

    pasteCountRef.current += 1
    const step = pasteCountRef.current
    const base = {
      x: clip.anchor.x + DUPLICATE_OFFSET.x * step,
      y: clip.anchor.y + DUPLICATE_OFFSET.y * step,
    }

    const hasStart = nodesRef.current.some((n) => n.type === START_FLOW_TYPE)
    const newControlNodes: EditorNode[] = []
    let skippedStart = false

    for (const item of clip.items) {
      const position = {
        x: base.x + item.offset.x,
        y: base.y + item.offset.y,
      }

      if (item.kind === "agent") {
        onPasteAgentRef.current?.(item.workerId, position)
        continue
      }

      if (item.controlKind === START_NODE_KIND && hasStart) {
        skippedStart = true
        continue
      }

      const id = `${item.flowType}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
      newControlNodes.push({
        id,
        type: item.flowType,
        position,
        data: structuredClone(item.data),
      } as EditorNode)
    }

    if (skippedStart) {
      toast.info("This swarm already has a Start node")
    }

    if (newControlNodes.length > 0) {
      setNodes((current) => [...current, ...newControlNodes])
      onSelectNode(newControlNodes[newControlNodes.length - 1]!.id)
      schedulePersist()
    }
  }, [onSelectNode, schedulePersist, setNodes])

  useEffect(() => {
    const isEditableTarget = (target: EventTarget | null) => {
      if (!(target instanceof HTMLElement)) return false
      const tag = target.tagName
      return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) return
      const mod = event.metaKey || event.ctrlKey
      if (!mod) return

      if (event.code === "KeyC") {
        const hasSelection = nodesRef.current.some((node) => node.selected)
        if (!hasSelection) return
        event.preventDefault()
        copySelection()
        return
      }

      if (event.code === "KeyV") {
        if (!clipboardRef.current) return
        event.preventDefault()
        pasteFromClipboard()
        return
      }

      if (event.code === "KeyD") {
        const selected = nodesRef.current.filter((node) => node.selected)
        const targetId =
          selected.length > 0
            ? selected[selected.length - 1]!.id
            : selectedNodeId
        if (!targetId) return
        event.preventDefault()
        onDuplicateNode(targetId)
      }
    }

    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [copySelection, onDuplicateNode, pasteFromClipboard, selectedNodeId])

  const onDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault()
      const instance = flowInstanceRef.current
      if (!instance) return
      const position = instance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      })
      const at = {
        x: position.x - NODE_WIDTH / 2,
        y: position.y - NODE_HEIGHT / 2,
      }

      if (event.dataTransfer.getData(SWARM_PALETTE_AGENT_MIME)) {
        onPlaceNewAgent?.(at)
        return
      }

      const controlKind = event.dataTransfer.getData(SWARM_PALETTE_CONTROL_MIME)
      if (controlKind) {
        insertControlNode(controlKind as ControlNodeKind, at)
        return
      }

      const workerId = event.dataTransfer.getData("application/agentatlas-worker-id")
      if (!workerId) return
      insertAgent(workerId, at)
    },
    [insertAgent, insertControlNode, onPlaceNewAgent],
  )

  const onDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
  }, [])

  const handleNodesChange = useCallback(
    (changes: NodeChange<EditorNode>[]) => {
      onNodesChange(changes)
      const moved = changes.some((c) => c.type === "position" && c.dragging === false)
      const removed = changes.some((c) => c.type === "remove")
      if (moved || removed) schedulePersist()
    },
    [onNodesChange, schedulePersist],
  )

  const handleEdgesChange = useCallback(
    (changes: EdgeChange<Edge>[]) => {
      onEdgesChange(changes)
      if (changes.some((c) => c.type === "remove")) schedulePersist()
    },
    [onEdgesChange, schedulePersist],
  )

  return (
    <div ref={wrapRef} className="canvas-wrap" onDrop={onDrop} onDragOver={onDragOver}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={onConnect}
        onNodeDoubleClick={onNodeDoubleClick}
        onPaneClick={onPaneClick}
        onSelectionChange={onSelectionChange}
        onInit={onInit}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        defaultEdgeOptions={defaultEdgeOptions}
        fitView
        fitViewOptions={CANVAS_FIT_OPTIONS}
        minZoom={0.25}
        maxZoom={1.75}
        selectionOnDrag
        selectionMode={SelectionMode.Partial}
        panOnDrag={false}
        panOnScroll
        panActivationKeyCode="Space"
        zoomActivationKeyCode="Meta"
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={18} size={1} color="var(--app-border)" />
        <Controls showInteractive={false} position="bottom-right" />
        <MiniMap
          pannable
          zoomable
          nodeColor="var(--app-text-muted)"
          maskColor="rgba(10, 10, 10, 0.06)"
          position="bottom-left"
        />
      </ReactFlow>

      <style jsx global>{`
        .canvas-wrap .react-flow {
          --xy-edge-stroke: var(--app-border-strong);
          --xy-edge-stroke-selected: var(--app-text);
          --xy-controls-button-background-color: var(--app-surface);
          --xy-controls-button-background-color-hover: var(--app-surface-muted);
          --xy-controls-button-color: var(--app-text-muted);
          --xy-controls-button-color-hover: var(--app-text);
          --xy-controls-button-border-color: var(--app-border);
          --xy-minimap-background-color: var(--app-surface-muted);
          --xy-minimap-mask-background-color: rgba(10, 10, 10, 0.06);
          --xy-minimap-node-color: var(--app-text-muted);
        }
        .canvas-wrap :global(.react-flow__node) {
          overflow: visible;
        }
      `}</style>
      <style jsx>{`
        .canvas-wrap {
          flex: 1;
          min-height: 0;
          height: 100%;
          background: linear-gradient(
            180deg,
            var(--app-surface-muted) 0%,
            var(--app-surface) 100%
          );
        }
        .canvas-wrap :global(.react-flow) {
          width: 100%;
          height: 100%;
        }
      `}</style>
    </div>
  )
}

const SwarmEditorCanvasForward = forwardRef(SwarmEditorCanvasInner)

export default function SwarmEditorCanvas(props: Props & { editorRef?: React.Ref<SwarmEditorHandle> }) {
  const { editorRef, ...rest } = props
  return (
    <ReactFlowProvider>
      <SwarmEditorCanvasForward {...rest} ref={editorRef} />
    </ReactFlowProvider>
  )
}
