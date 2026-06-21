"use client"

import { createContext, useContext, type ReactNode } from "react"
import type { AdminAgentWorker, ReferencedSwarmSummary } from "@/data/api/server"
import type { ControlNodeKind } from "./nodes/registry"

/** Live run state for a canvas node during Test Swarm SSE streaming. */
export type SwarmNodeRunState = "idle" | "running" | "done" | "skipped" | "waiting"

/** Visual fan-out state for scalable agent nodes during a test run. */
export type ScaleVisualPhase = "idle" | "expanding" | "expanded" | "collapsing"

export type ScaleVisualState = {
  count: number
  phase: ScaleVisualPhase
  shardStates: SwarmNodeRunState[]
}

/** Imperative canvas API for node config panels. */
export type SwarmEditorNodeApi = {
  getControlNodeKind: (nodeId: string) => ControlNodeKind | null
  isAgentNode: (nodeId: string) => boolean
  getAgentWorkerId: (nodeId: string) => string | null
  getNodeData: <T = unknown>(nodeId: string) => T | null
  setNodeData: (nodeId: string, data: unknown) => void
  removeSourceHandleEdges: (nodeId: string, sourceHandle: string) => void
  deleteNode: (nodeId: string) => void
}

export type SwarmEditorContextValue = {
  currentSwarmId: string
  /** Swarms available in the sub-swarm picker (excludes the open swarm). */
  pickerSwarms: ReferencedSwarmSummary[]
  workers: AdminAgentWorker[]
  workerById: Record<string, AdminAgentWorker>
  onSaveSwarm: (skipRedirect?: boolean) => void | Promise<void>
  onOpenNode: (nodeId: string) => void
  onSelectNode: (nodeId: string | null) => void
  selectedNodeId: string | null
  openNodeId: string | null
  onDeleteNode: (nodeId: string) => void
  /** Duplicate a canvas node (keyboard shortcut; clones agent workers). */
  onDuplicateNode: (nodeId: string) => void
  /** Renames the agent worker — same field as Configure agent → Name. */
  onUpdateAgentNodeLabel: (nodeId: string, label: string) => void
  isSaving: boolean
  duplicatingNode?: boolean
  /** Per-node execution state while Test Swarm is streaming. */
  nodeRunStates: Record<string, SwarmNodeRunState>
  setNodeRunState: (nodeId: string, state: SwarmNodeRunState) => void
  resetNodeRunStates: () => void
  /** Fan-out animation state for scalable agent nodes. */
  scaleVisuals: Record<string, ScaleVisualState>
  setScaleVisual: (
    nodeId: string,
    state:
      | ScaleVisualState
      | null
      | ((prev: ScaleVisualState | undefined) => ScaleVisualState | null),
  ) => void
  setScaleShardState: (nodeId: string, shardIndex: number, state: SwarmNodeRunState) => void
  resetScaleVisuals: () => void
}

const SwarmEditorContext = createContext<SwarmEditorContextValue | null>(null)

type Props = {
  value: SwarmEditorContextValue
  children: ReactNode
}

export function SwarmEditorProvider({ value, children }: Props) {
  return <SwarmEditorContext.Provider value={value}>{children}</SwarmEditorContext.Provider>
}

export function useSwarmEditor(): SwarmEditorContextValue {
  const ctx = useContext(SwarmEditorContext)
  if (!ctx) {
    throw new Error("useSwarmEditor must be used inside SwarmEditorProvider")
  }
  return ctx
}
