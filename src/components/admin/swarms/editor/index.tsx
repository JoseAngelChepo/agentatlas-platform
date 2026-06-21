"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { TbArrowLeft, TbDeviceFloppy, TbLoader2 } from "react-icons/tb"
import Loader from "@/components/ui/Loader"
import { createSwarmWorkspaceApi, type SwarmApiMode } from "@/lib/swarm-workspace-api"
import { swarmListRoute } from "@/lib/paths"
import createServices, {
  type AdminAgentWorker,
  type AdminSwarm,
  type AdminUpdateAgentWorkerPayload,
  type ReferencedSwarmSummary,
  type SwarmGraph,
} from "@/data/api/server"
import { ApiServices } from "@/data/api/server/config"
import { useServices } from "@/data/providers/ServicesProvider"
import { toast } from "@/lib/toast"
import { isAdminRole } from "@/lib/roles"
import { findStartGraphNode, getStartInputVariableNames } from "@/lib/start-node"
import { buildSwarmNameLookup } from "@/lib/swarm-tool-invocations"
import { buildClonedAgentWorkerPayload, buildNewAgentWorkerPayload } from "@/lib/default-agent-worker"
import SwarmTestPanel from "../SwarmTestPanel"
import SwarmWorkerPanel from "../SwarmWorkerPanel"
import SwarmEditorCanvas, { type SwarmEditorHandle } from "./SwarmEditorCanvas"
import {
  mergeSwarmGraphWithCanvas,
  type SwarmCanvasSnapshot,
} from "@/lib/merge-swarm-graph"
import {
  canvasSnapshotToApiPayload,
  validateBranchEdgeHandles,
  validateIfElseCaseWiring,
} from "@/lib/swarm-graph-api"
import { SwarmEditorProvider, type SwarmNodeRunState, type ScaleVisualState } from "./SwarmEditorContext"
import SwarmEditorSidebar from "./SwarmEditorSidebar"
import SwarmEditorTitle from "./SwarmEditorTitle"
import SwarmTriggersField from "../SwarmTriggersField"
import SwarmNodeConfigPanel from "./SwarmNodeConfigPanel"
import SwarmEditorSnapshotCopyButton from "./SwarmEditorSnapshotCopyButton"
import {
  buildSwarmWorkspaceSnapshot,
  swarmWorkspaceSnapshotToJson,
} from "@/lib/swarm-workspace-snapshot"
import {
  collectWorkerIdsFromGraph,
  collectWorkerIdsFromSnapshot,
  filterWorkersToIds,
  pruneWorkerIdsList,
  workerIdsNeedSync,
} from "@/lib/swarm-workers-sync"

type Props = {
  swarmId: string
  apiMode?: SwarmApiMode
}

function buildPickerSwarms(
  currentSwarmId: string,
  allSwarms: AdminSwarm[],
  referenced: ReferencedSwarmSummary[],
): ReferencedSwarmSummary[] {
  const referencedById = new Map(referenced.map((row) => [row.id, row]))
  return allSwarms
    .filter((swarm) => swarm.id !== currentSwarmId)
    .map((swarm) => {
      const ref = referencedById.get(swarm.id)
      return {
        id: swarm.id,
        name: swarm.name,
        goal: swarm.goal,
        active: swarm.active ?? true,
        platformRunnable: ref?.platformRunnable ?? swarm.platformRunnable ?? false,
        canRun: ref?.canRun ?? true,
        inputs: ref?.inputs ?? ["message"],
        outputs: ref?.outputs ?? [],
      }
    })
}

function mergeReferencedSwarmsIntoPicker(
  picker: ReferencedSwarmSummary[],
  referenced: ReferencedSwarmSummary[],
): ReferencedSwarmSummary[] {
  const refById = new Map(referenced.map((row) => [row.id, row]))
  return picker.map((row) => {
    const ref = refById.get(row.id)
    if (!ref) return row
    return {
      ...row,
      goal: ref.goal ?? row.goal,
      active: ref.active,
      platformRunnable: ref.platformRunnable,
      canRun: ref.canRun,
      inputs: ref.inputs,
      outputs: ref.outputs,
    }
  })
}

function apiErrorMessage(err: unknown, fallback: string): string {
  if (
    err &&
    typeof err === "object" &&
    "response" in err &&
    err.response &&
    typeof err.response === "object" &&
    "data" in err.response &&
    err.response.data &&
    typeof err.response.data === "object" &&
    "message" in err.response.data
  ) {
    const message = (err.response.data as { message?: string | string[] }).message
    if (Array.isArray(message)) return message.join(", ")
    if (typeof message === "string") return message
  }
  return fallback
}

/**
 * Crewy-style swarm editor.
 *
 * Mirrors the structure of `crewy-webapp/.../WorkflowEditor`:
 * `[Container] -> [Header] [Sidebar palette | Canvas | Worker drawer | Test panel]`.
 * Swarm editor: the left palette places new AgentWorker blueprints;
 * `entryNode` / `exitNode` are derived from graph topology on each save; when a Start
 * node is present it becomes `entryNode` and agents no longer get an entry badge.
 */
export default function SwarmEditor({ swarmId, apiMode = "admin" }: Props) {
  const router = useRouter()
  const { role } = useServices()
  const isAdmin = isAdminRole(role)
  const services = useMemo(() => createServices(ApiServices), [])
  const swarmApi = useMemo(() => createSwarmWorkspaceApi(services, apiMode), [services, apiMode])

  const [loading, setLoading] = useState(true)
  const [swarm, setSwarm] = useState<AdminSwarm | null>(null)
  const [graph, setGraph] = useState<SwarmGraph | null>(null)
  const [workers, setWorkers] = useState<AdminAgentWorker[]>([])
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
  const [openNodeId, setOpenNodeId] = useState<string | null>(null)
  const [savingGraph, setSavingGraph] = useState(false)
  const [savingWorker, setSavingWorker] = useState(false)
  const [creatingAgent, setCreatingAgent] = useState(false)
  const [duplicatingNode, setDuplicatingNode] = useState(false)
  const [savingName, setSavingName] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [canvasSnapshot, setCanvasSnapshot] = useState<SwarmCanvasSnapshot | null>(null)
  const [nodeRunStates, setNodeRunStates] = useState<Record<string, SwarmNodeRunState>>({})
  const [scaleVisuals, setScaleVisuals] = useState<Record<string, ScaleVisualState>>({})
  const [pickerSwarms, setPickerSwarms] = useState<ReferencedSwarmSummary[]>([])

  const setNodeRunState = useCallback((nodeId: string, state: SwarmNodeRunState) => {
    setNodeRunStates((prev) => ({ ...prev, [nodeId]: state }))
  }, [])

  const resetNodeRunStates = useCallback(() => {
    setNodeRunStates({})
  }, [])

  const setScaleVisual = useCallback(
    (
      nodeId: string,
      state:
        | ScaleVisualState
        | null
        | ((prev: ScaleVisualState | undefined) => ScaleVisualState | null),
    ) => {
      setScaleVisuals((prev) => {
        const resolved = typeof state === "function" ? state(prev[nodeId]) : state
        if (resolved == null) {
          if (!(nodeId in prev)) return prev
          const next = { ...prev }
          delete next[nodeId]
          return next
        }
        return { ...prev, [nodeId]: resolved }
      })
    },
    [],
  )

  const setScaleShardState = useCallback(
    (nodeId: string, shardIndex: number, state: SwarmNodeRunState) => {
      setScaleVisuals((prev) => {
        const current = prev[nodeId]
        if (!current) return prev
        const shardStates = [...current.shardStates]
        shardStates[shardIndex] = state
        return { ...prev, [nodeId]: { ...current, shardStates } }
      })
    },
    [],
  )

  const resetScaleVisuals = useCallback(() => {
    setScaleVisuals({})
  }, [])

  const editorRef = useRef<SwarmEditorHandle | null>(null)
  const canvasSnapshotRef = useRef<SwarmCanvasSnapshot | null>(null)
  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleCanvasChange = useCallback((snapshot: SwarmCanvasSnapshot) => {
    canvasSnapshotRef.current = snapshot
    setCanvasSnapshot(snapshot)
  }, [])

  const workerById = useMemo(() => {
    const map: Record<string, AdminAgentWorker> = {}
    for (const worker of workers) map[worker.id] = worker
    return map
  }, [workers])

  const searchableSwarmIds = useMemo(() => {
    const ids = new Set<string>()
    for (const row of pickerSwarms) ids.add(row.id)
    for (const worker of workers) {
      for (const toolId of worker.swarmTools ?? []) ids.add(toolId)
    }
    return [...ids]
  }, [pickerSwarms, workers])

  const swarmNameById = useMemo(
    () => buildSwarmNameLookup(pickerSwarms),
    [pickerSwarms],
  )

  const graphForConfig = useMemo(
    () => mergeSwarmGraphWithCanvas(graph, canvasSnapshot, swarmId),
    [graph, canvasSnapshot, swarmId],
  )

  const runInputKeys = useMemo(
    () => getStartInputVariableNames(graphForConfig),
    [graphForConfig],
  )

  const startNode = useMemo(() => findStartGraphNode(graphForConfig), [graphForConfig])

  const syncSwarmWorkersWithCanvas = useCallback(
    async (
      currentSwarm: AdminSwarm,
      currentWorkers: AdminAgentWorker[],
      activeWorkerIds: string[],
    ): Promise<{ swarm: AdminSwarm; workers: AdminAgentWorker[] }> => {
      const canvasWorkers = filterWorkersToIds(currentWorkers, activeWorkerIds)
      const listed = currentSwarm.workers ?? []
      if (!workerIdsNeedSync(listed, activeWorkerIds)) {
        return { swarm: currentSwarm, workers: canvasWorkers }
      }

      const updatedSwarm = await swarmApi.updateSwarm(currentSwarm.id, {
        workers: pruneWorkerIdsList(listed, activeWorkerIds),
      })
      return { swarm: updatedSwarm, workers: canvasWorkers }
    },
    [swarmApi],
  )

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [workspace, allSwarms] = await Promise.all([
        swarmApi.loadWorkspace(swarmId),
        swarmApi.listSwarms(),
      ])
      const graphWorkerIds = collectWorkerIdsFromGraph(workspace.graph)
      const { swarm: syncedSwarm, workers: syncedWorkers } = await syncSwarmWorkersWithCanvas(
        workspace.swarm,
        workspace.workers,
        graphWorkerIds,
      )
      setSwarm(syncedSwarm)
      setGraph(workspace.graph)
      canvasSnapshotRef.current = null
      setCanvasSnapshot(null)
      setWorkers(syncedWorkers)
      setPickerSwarms(buildPickerSwarms(swarmId, allSwarms, workspace.referencedSwarms))
    } catch {
      toast.error("Could not load swarm")
      setSwarm(null)
      setGraph(null)
      setWorkers([])
      setPickerSwarms([])
    } finally {
      setLoading(false)
      setHasUnsavedChanges(false)
    }
  }, [swarmApi, swarmId, syncSwarmWorkersWithCanvas])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    return () => {
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current)
    }
  }, [])

  const persistGraph = useCallback(async () => {
    const editor = editorRef.current
    if (!editor) return
    const snapshot = canvasSnapshotRef.current ?? editor.toJSON()
    const branchEdgeError = validateBranchEdgeHandles(snapshot)
    if (branchEdgeError) {
      toast.error(branchEdgeError)
      setHasUnsavedChanges(true)
      return
    }
    const ifElseWireError = validateIfElseCaseWiring(snapshot)
    if (ifElseWireError) {
      toast.error(ifElseWireError)
      setHasUnsavedChanges(true)
      return
    }

    const payload = canvasSnapshotToApiPayload(snapshot)
    if (!payload) {
      setHasUnsavedChanges(snapshot.nodes.length > 0)
      if (snapshot.nodes.length > 0) {
        toast.error("Connect the graph (e.g. Start → End) before saving")
      }
      return
    }

    setSavingGraph(true)
    try {
      const updated = await swarmApi.upsertGraph(swarmId, payload)
      setGraph(updated)
      if (swarm) {
        const canvasWorkerIds = collectWorkerIdsFromSnapshot(snapshot)
        const { swarm: syncedSwarm, workers: syncedWorkers } = await syncSwarmWorkersWithCanvas(
          swarm,
          workers,
          canvasWorkerIds,
        )
        setSwarm(syncedSwarm)
        setWorkers(syncedWorkers)
      }
      setHasUnsavedChanges(false)
      try {
        const workspace = await services.getSwarmWorkspace(swarmId)
        if (workspace.referencedSwarms?.length) {
          setPickerSwarms((prev) =>
            mergeReferencedSwarmsIntoPicker(prev, workspace.referencedSwarms ?? []),
          )
        }
      } catch {
        /* picker metadata refresh is best-effort */
      }
    } catch (err: unknown) {
      const message =
        err &&
        typeof err === "object" &&
        "response" in err &&
        err.response &&
        typeof err.response === "object" &&
        "data" in err.response &&
        err.response.data &&
        typeof err.response.data === "object" &&
        "message" in err.response.data
          ? String((err.response.data as { message?: string }).message)
          : "Could not save swarm graph"
      toast.error(message)
      setHasUnsavedChanges(true)
    } finally {
      setSavingGraph(false)
    }
  }, [swarm, services, swarmApi, swarmId, syncSwarmWorkersWithCanvas, workers])

  const handleSaveSwarm = useCallback(
    (skipRedirect: boolean = false) => {
      setHasUnsavedChanges(true)
      if (persistTimerRef.current) clearTimeout(persistTimerRef.current)
      const delay = skipRedirect ? 250 : 0
      persistTimerRef.current = setTimeout(() => {
        void persistGraph()
      }, delay)
    },
    [persistGraph],
  )

  /** Palette drop: always a new AgentWorker blueprint (unique prompt per canvas node). */
  const placeNewAgentOnCanvas = useCallback(
    async (options?: { openConfig?: boolean; position?: { x: number; y: number } }) => {
      if (!swarm || creatingAgent) return
      setCreatingAgent(true)
      try {
        const created = await services.createAgentWorker(buildNewAgentWorkerPayload())
        setWorkers((prev) => [...prev, created])

        if (!swarm.workers.includes(created.id)) {
          const updatedSwarm = await swarmApi.updateSwarm(swarm.id, {
            workers: [...swarm.workers, created.id],
          })
          setSwarm(updatedSwarm)
        }

        editorRef.current?.addAgent(created.id, options?.position, {
          openConfig: options?.openConfig !== false,
        })
      } catch (err: unknown) {
        toast.error(apiErrorMessage(err, "Could not create agent"))
      } finally {
        setCreatingAgent(false)
      }
    },
    [creatingAgent, services, swarm, swarmApi, workers],
  )

  const updateWorker = useCallback(
    async (id: string, patch: AdminUpdateAgentWorkerPayload) => {
      setSavingWorker(true)
      try {
        const updated = await swarmApi.updateAgentWorker(id, patch)
        setWorkers((prev) => {
          const idx = prev.findIndex((w) => w.id === id)
          if (idx === -1) return [...prev, updated]
          const next = [...prev]
          next[idx] = updated
          return next
        })
        return updated
      } catch (err: unknown) {
        const message =
          err &&
          typeof err === "object" &&
          "response" in err &&
          err.response &&
          typeof err.response === "object" &&
          "data" in err.response &&
          err.response.data &&
          typeof err.response.data === "object" &&
          "message" in err.response.data
            ? String((err.response.data as { message?: string }).message)
            : "Could not save agent worker"
        toast.error(message)
        return null
      } finally {
        setSavingWorker(false)
      }
    },
    [services],
  )

  const nodeApi = editorRef.current?.getNodeApi() ?? null
  const openNodeKind = useMemo(() => {
    if (!openNodeId || !nodeApi) return null
    return nodeApi.getControlNodeKind(openNodeId)
  }, [openNodeId, nodeApi, canvasSnapshot])
  const openAgentWorkerId =
    openNodeId && nodeApi?.isAgentNode(openNodeId)
      ? nodeApi.getAgentWorkerId(openNodeId)
      : null
  const selectedWorker =
    openAgentWorkerId != null ? workerById[openAgentWorkerId] ?? null : null

  const refreshWorker = useCallback(
    (workerId: string) => {
      void swarmApi
        .getAgentWorker(workerId)
        .then((fresh) => {
          setWorkers((prev) => {
            const idx = prev.findIndex((w) => w.id === workerId)
            if (idx === -1) return [...prev, fresh]
            const next = [...prev]
            next[idx] = fresh
            return next
          })
        })
        .catch(() => {
          // Keep the cached worker if refresh fails.
        })
    },
    [swarmApi],
  )

  const handleSelectNode = useCallback((nodeId: string | null) => {
    setSelectedNodeId(nodeId)
    if (!nodeId) setOpenNodeId(null)
  }, [])

  const handleOpenNode = useCallback(
    (nodeId: string) => {
      setSelectedNodeId(nodeId)
      setOpenNodeId(nodeId)
      const editor = editorRef.current
      const workerId = editor?.getNodeApi().getAgentWorkerId(nodeId)
      if (workerId) refreshWorker(workerId)
    },
    [refreshWorker],
  )

  const handleEditStartVariables = useCallback(() => {
    const start = findStartGraphNode(graphForConfig)
    if (!start?.id) {
      toast.info("Add a Start node from the palette to declare run inputs.")
      return
    }
    handleOpenNode(start.id)
  }, [graphForConfig, handleOpenNode])

  const handleUpdateAgentNodeLabel = useCallback(
    async (nodeId: string, label: string) => {
      const api = editorRef.current?.getNodeApi()
      if (!api) return
      const data = api.getNodeData<{ workerId: string; label?: string; tag?: unknown }>(nodeId)
      if (!data?.workerId) return

      const trimmed = label.trim()
      if (!trimmed) return

      const currentName = workerById[data.workerId]?.name?.trim()
      if (trimmed !== currentName) {
        const updated = await updateWorker(data.workerId, { name: trimmed })
        if (!updated) return
      }

      if (data.label) {
        const { label: _removed, ...rest } = data
        api.setNodeData(nodeId, rest)
      }
    },
    [updateWorker, workerById],
  )

  const cloneAgentWorkerToCanvas = useCallback(
    async (sourceWorkerId: string, position: { x: number; y: number }) => {
      if (!swarm || creatingAgent || duplicatingNode) return

      const source = workerById[sourceWorkerId]
      if (!source) return

      setDuplicatingNode(true)
      try {
        let created = await services.createAgentWorker(buildClonedAgentWorkerPayload(source))
        if (
          source.openaiTools ||
          source.grokTools ||
          (source.agentTools?.length ?? 0) > 0 ||
          (source.swarmTools?.length ?? 0) > 0
        ) {
          created = await swarmApi.updateAgentWorker(created.id, {
            openaiTools: source.openaiTools,
            grokTools: source.grokTools,
            agentTools: source.agentTools,
            swarmTools: source.swarmTools,
          })
        }
        setWorkers((prev) => [...prev, created])

        if (!swarm.workers.includes(created.id)) {
          const updatedSwarm = await swarmApi.updateSwarm(swarm.id, {
            workers: [...swarm.workers, created.id],
          })
          setSwarm(updatedSwarm)
        }

        editorRef.current?.addAgent(created.id, position, {
          openConfig: false,
        })
      } catch (err: unknown) {
        toast.error(apiErrorMessage(err, "Could not duplicate agent"))
      } finally {
        setDuplicatingNode(false)
      }
    },
    [creatingAgent, duplicatingNode, services, swarm, workerById],
  )

  const handleDuplicateNode = useCallback(
    async (nodeId: string) => {
      const editor = editorRef.current
      if (!editor || !swarm) return

      const api = editor.getNodeApi()
      if (!api.isAgentNode(nodeId)) {
        editor.duplicateControlNode(nodeId)
        return
      }

      const workerId = api.getAgentWorkerId(nodeId)
      if (!workerId) return
      const source = workerById[workerId]
      if (!source) return

      const pos = editor.getNodePosition(nodeId) ?? { x: 200, y: 160 }

      await cloneAgentWorkerToCanvas(workerId, { x: pos.x + 48, y: pos.y + 48 })
    },
    [cloneAgentWorkerToCanvas, swarm, workerById],
  )

  const handlePasteAgent = useCallback(
    (workerId: string, position: { x: number; y: number }) => {
      void cloneAgentWorkerToCanvas(workerId, position)
    },
    [cloneAgentWorkerToCanvas],
  )

  const handleEditorReady = useCallback((handle: SwarmEditorHandle) => {
    editorRef.current = handle
  }, [])

  const buildSnapshotJson = useCallback(() => {
    if (!swarm) return null

    const editor = editorRef.current
    const canvas = canvasSnapshotRef.current ?? editor?.toJSON() ?? null
    const mergedGraph = mergeSwarmGraphWithCanvas(graph, canvas, swarmId)

    const snapshot = buildSwarmWorkspaceSnapshot({
      swarm,
      graph: mergedGraph,
      workers,
      hasUnsavedGraphChanges: hasUnsavedChanges,
    })

    return swarmWorkspaceSnapshotToJson(snapshot)
  }, [graph, hasUnsavedChanges, swarm, swarmId, workers])

  const handleDeleteNode = useCallback((nodeId: string) => {
    editorRef.current?.getNodeApi()?.deleteNode(nodeId)
    setOpenNodeId((current) => (current === nodeId ? null : current))
  }, [])

  const handleSaveSwarmName = useCallback(
    async (name: string) => {
      if (!swarm) return
      setSavingName(true)
      try {
        const updated = await swarmApi.updateSwarm(swarm.id, { name })
        setSwarm(updated)
      } catch (err: unknown) {
        toast.error(apiErrorMessage(err, "Could not rename swarm"))
        throw err
      } finally {
        setSavingName(false)
      }
    },
    [swarm, swarmApi],
  )

  const handleSaveSwarmTriggers = useCallback(
    async (triggers: string[]) => {
      if (!swarm) return
      const updated = await swarmApi.updateSwarm(swarm.id, { triggers })
      setSwarm(updated)
    },
    [swarm, swarmApi],
  )

  if (loading) {
    return (
      <div className="workspace workspace--loading">
        <Loader compact />
        <style jsx>{`
          .workspace--loading {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--app-bg);
          }
        `}</style>
      </div>
    )
  }

  if (!swarm) {
    return (
      <div className="workspace">
        <div className="empty">
          <p>Swarm not found.</p>
          <button
            type="button"
            className="back"
            onClick={() => router.push(swarmListRoute(apiMode))}
            aria-label="Back to swarms"
            title="Back to swarms"
          >
            <TbArrowLeft size={16} aria-hidden />
          </button>
        </div>
        <style jsx>{`
          .workspace {
            flex: 1;
            padding: 2rem;
            background: var(--app-bg);
          }
          .empty p {
            margin: 0 0 1rem;
            color: var(--app-text-muted);
            font-size: 0.8125rem;
          }
          .back {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 1.75rem;
            height: 1.75rem;
            padding: 0;
            border: 1px solid var(--app-border);
            border-radius: var(--app-radius);
            background: var(--app-surface);
            color: var(--app-text-muted);
            cursor: pointer;
            font-family: var(--app-font);
            transition:
              color 0.15s ease,
              border-color 0.15s ease,
              background 0.15s ease;
          }
          .back:hover {
            color: var(--app-text);
            border-color: var(--app-border-strong);
            background: var(--app-surface-muted);
          }
        `}</style>
      </div>
    )
  }

  return (
    <SwarmEditorProvider
      value={{
        currentSwarmId: swarmId,
        pickerSwarms,
        workers,
        workerById,
        onSaveSwarm: handleSaveSwarm,
        onOpenNode: handleOpenNode,
        onSelectNode: handleSelectNode,
        selectedNodeId,
        openNodeId,
        onDeleteNode: handleDeleteNode,
        onDuplicateNode: (nodeId) => void handleDuplicateNode(nodeId),
        onUpdateAgentNodeLabel: handleUpdateAgentNodeLabel,
        isSaving: savingGraph,
        duplicatingNode,
        nodeRunStates,
        setNodeRunState,
        resetNodeRunStates,
        scaleVisuals,
        setScaleVisual,
        setScaleShardState,
        resetScaleVisuals,
      }}
    >
      <div className="editor">
        <header className="bar">
          <button
            type="button"
            className="back"
            onClick={() => router.push(swarmListRoute(apiMode))}
            aria-label="Back to swarms"
            title="Back to swarms"
          >
            <TbArrowLeft size={16} aria-hidden />
          </button>
          <div className="meta">
            <div className="meta-head">
              <div className="meta-title">
                <SwarmEditorTitle
                  name={swarm.name}
                  onSave={handleSaveSwarmName}
                  disabled={savingName}
                />
              </div>
              <SwarmTriggersField
                layout="inline"
                triggers={swarm.triggers ?? []}
                disabled={savingName}
                onSave={handleSaveSwarmTriggers}
              />
            </div>
            {swarm.goal?.trim() ? <p className="sub">{swarm.goal}</p> : null}
          </div>
          <div className="status">
            {savingGraph ? (
              <span className="status-pill status-pill--saving">
                <TbLoader2 size={12} className="spin" aria-hidden />
                Saving…
              </span>
            ) : hasUnsavedChanges ? (
              <button
                type="button"
                className="status-pill status-pill--dirty"
                onClick={() => persistGraph()}
              >
                <TbDeviceFloppy size={12} aria-hidden />
                Save changes
              </button>
            ) : (
              <span className="status-pill">All changes saved</span>
            )}
            {isAdmin ? (
              <SwarmEditorSnapshotCopyButton
                onCopy={buildSnapshotJson}
                disabled={!swarm}
              />
            ) : null}
          </div>
        </header>

        <div className="stage">
          <SwarmEditorSidebar
            onPlaceAgent={() => void placeNewAgentOnCanvas({ openConfig: true })}
            onPlaceControl={(kind) => editorRef.current?.addControlNode(kind, undefined, { openConfig: true })}
            placingAgent={creatingAgent}
          />

          <div className="canvas-col">
            <SwarmEditorCanvas
              initialGraph={graph}
              onEditorReady={handleEditorReady}
              onPersist={() => handleSaveSwarm(true)}
              onCanvasChange={handleCanvasChange}
              onPlaceNewAgent={(position) =>
                void placeNewAgentOnCanvas({ openConfig: false, position })
              }
              onPasteAgent={(workerId, position) => handlePasteAgent(workerId, position)}
            />
          </div>

          {selectedWorker && openNodeId ? (
            <SwarmWorkerPanel
              key={openNodeId}
              canvasNodeId={openNodeId}
              nodeApi={nodeApi}
              worker={selectedWorker}
              graph={graphForConfig}
              workerById={workerById}
              saving={savingWorker}
              onClose={() => setOpenNodeId(null)}
              onSave={(patch) => updateWorker(selectedWorker.id, patch)}
            />
          ) : null}

          {openNodeId && openNodeKind && nodeApi ? (
            <SwarmNodeConfigPanel
              key={openNodeId}
              nodeId={openNodeId}
              kind={openNodeKind}
              nodeApi={nodeApi}
              graph={graphForConfig}
              workerById={workerById}
              onClose={() => setOpenNodeId(null)}
              onDataChange={() => {}}
              onDeleteNode={() => handleDeleteNode(openNodeId)}
            />
          ) : null}

          <SwarmTestPanel
            swarmId={swarm.id}
            swarmName={swarm.name}
            workspaceApi={swarmApi}
            inputKeys={runInputKeys}
            hasStartNode={startNode != null}
            hasUnsavedGraph={hasUnsavedChanges}
            onEditStartVariables={handleEditStartVariables}
            workerById={workerById}
            searchableSwarmIds={searchableSwarmIds}
            swarmNameById={swarmNameById}
            setNodeRunState={setNodeRunState}
            resetNodeRunStates={resetNodeRunStates}
            setScaleVisual={setScaleVisual}
            setScaleShardState={setScaleShardState}
            resetScaleVisuals={resetScaleVisuals}
            agentConfigOpen={Boolean(selectedWorker && openNodeId)}
          />
        </div>

        <style jsx>{`
          .editor {
            flex: 1;
            display: flex;
            flex-direction: column;
            height: 100%;
            max-height: 100%;
            min-height: 0;
            min-width: 0;
            overflow: hidden;
            background: var(--app-bg);
          }
          .bar {
            display: flex;
            align-items: center;
            gap: 1rem;
            padding: 0.75rem 1.25rem;
            border-bottom: 1px solid var(--app-border);
            background: var(--app-surface);
            flex-shrink: 0;
          }
          .back {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            width: 1.75rem;
            height: 1.75rem;
            padding: 0;
            color: var(--app-text-muted);
            background: var(--app-surface);
            border: 1px solid var(--app-border);
            border-radius: var(--app-radius);
            cursor: pointer;
            font-family: var(--app-font);
            flex-shrink: 0;
            transition:
              color 0.15s ease,
              border-color 0.15s ease,
              background 0.15s ease;
          }
          .back:hover {
            color: var(--app-text);
            border-color: var(--app-border-strong);
            background: var(--app-surface-muted);
          }
          .meta {
            min-width: 0;
            flex: 1;
          }
          .meta-head {
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: 0.75rem 1rem;
            min-width: 0;
          }
          .meta-title {
            flex-shrink: 0;
          }
          .sub {
            margin: 0.2rem 0 0;
            font-size: 0.6875rem;
            color: var(--app-text-faint);
            line-height: 1.4;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .status {
            display: flex;
            align-items: center;
            gap: 0.5rem;
            flex-shrink: 0;
            margin-left: auto;
          }
          .status-pill {
            display: inline-flex;
            align-items: center;
            gap: 0.375rem;
            padding: 0.25rem 0.5rem;
            font-size: 0.6875rem;
            color: var(--app-text-muted);
            border: 1px solid var(--app-border);
            border-radius: var(--app-radius-pill);
            background: var(--app-surface);
            font-family: var(--app-font);
          }
          .status-pill--saving {
            color: var(--app-text);
            border-color: var(--app-border-strong);
          }
          .status-pill--dirty {
            color: var(--app-bg);
            background: var(--app-text);
            border-color: var(--app-text);
            cursor: pointer;
          }
          .status-pill--dirty:hover {
            opacity: 0.92;
          }
          .stage {
            flex: 1;
            display: flex;
            min-height: 0;
            overflow: hidden;
          }
          .stage :global(aside.sidebar) {
            height: 100%;
            max-height: 100%;
          }
          .stage :global(aside.panel) {
            height: 100%;
            max-height: 100%;
            min-height: 0;
            overflow: hidden;
          }
          .stage :global(aside.test-panel) {
            height: 100%;
            max-height: 100%;
            min-height: 0;
            overflow: hidden;
          }
          .canvas-col {
            flex: 1;
            display: flex;
            min-width: 0;
            min-height: 0;
          }
          :global(.spin) {
            animation: spin 0.9s linear infinite;
          }
          @keyframes spin {
            from {
              transform: rotate(0deg);
            }
            to {
              transform: rotate(360deg);
            }
          }
          @media (max-width: 639px) {
            .bar {
              gap: 0.5rem;
              padding: 0.625rem 0.75rem;
            }
            .sub {
              display: none;
            }
          }
        `}</style>
      </div>
    </SwarmEditorProvider>
  )
}
