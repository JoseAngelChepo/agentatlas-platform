"use client"

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react"
import {
  TbChevronLeft,
  TbChevronRight,
  TbCopy,
  TbGripVertical,
  TbHelpCircle,
  TbHistory,
  TbPlayerPlay,
  TbRefresh,
  TbSettings,
} from "react-icons/tb"
import createServices, {
  type AdminAgentWorker,
  type RunSwarmResult,
  type SwarmRunApproval,
} from "@/data/api/server"
import { ApiServices } from "@/data/api/server/config"
import SwarmRunSummary from "@/components/admin/swarms/SwarmRunSummary"
import type { SwarmRun, SwarmSseEvent } from "@/data/api/server/swarms"
import type { SwarmRunUsageView } from "@/lib/swarm-run-usage"
import { usageFromSwarmDone, usageFromSwarmRun } from "@/lib/swarm-run-usage"
import {
  adminDecideSwarmRunStream,
  adminRunSwarmStream,
  decideSwarmRunStream,
  runSwarmStream,
} from "@/lib/swarm-run-stream"
import type { SwarmWorkspaceApi } from "@/lib/swarm-workspace-api"
import {
  appendSubSwarmToolLogs,
  buildHistoricalSwarmLogs,
  formatEndLogBody,
  formatHistoricalOutput,
  formatSwarmRunHistoryLabel,
  formatSwarmWorkerLogsForCopy,
  runInputToFormValues,
  type HistoricalSwarmLog,
} from "@/lib/swarm-run-history"
import { loadAgentToolSubSwarmRuns } from "@/lib/swarm-tool-invocations"
import {
  formatIfElseBranchMeta,
  formatIfElseLogBody,
} from "@/lib/if-else-branch-label"
import { toast } from "@/lib/toast"
import SwarmRunApprovalGate from "./SwarmRunApprovalGate"
import WorkerLogCard from "./WorkerLogCard"
import type { SwarmNodeRunState, ScaleVisualState } from "./editor/SwarmEditorContext"

type Props = {
  swarmId: string
  swarmName: string
  workspaceApi: SwarmWorkspaceApi
  /** Run input field names from the Start node (defaults to `message`). */
  inputKeys?: string[]
  hasStartNode?: boolean
  /** When true, the test run uses the last saved graph — not the live canvas. */
  hasUnsavedGraph?: boolean
  onEditStartVariables?: () => void
  workerById?: Record<string, AdminAgentWorker>
  /** Swarm ids to scan for nested agent-tool sub-swarm runs in logs. */
  searchableSwarmIds?: string[]
  swarmNameById?: Record<string, string>
  setNodeRunState?: (nodeId: string, state: SwarmNodeRunState) => void
  resetNodeRunStates?: () => void
  setScaleVisual?: (
    nodeId: string,
    state:
      | ScaleVisualState
      | null
      | ((prev: ScaleVisualState | undefined) => ScaleVisualState | null),
  ) => void
  setScaleShardState?: (nodeId: string, shardIndex: number, state: SwarmNodeRunState) => void
  resetScaleVisuals?: () => void
  /** When true, the panel collapses to give room to Configure agent. */
  agentConfigOpen?: boolean
}

type SwarmLog = HistoricalSwarmLog

const TEST_PANEL_MIN_WIDTH_PX = 448
const TEST_PANEL_DEFAULT_WIDTH_PX = 672
const TEST_PANEL_MAX_WIDTH_RATIO = 0.65

function clampTestPanelWidth(width: number): number {
  if (typeof window === "undefined") {
    return Math.round(Math.min(1200, Math.max(TEST_PANEL_MIN_WIDTH_PX, width)))
  }

  const viewportCap = Math.max(280, window.innerWidth - 24)
  const min = Math.min(TEST_PANEL_MIN_WIDTH_PX, viewportCap)
  const max = Math.min(window.innerWidth * TEST_PANEL_MAX_WIDTH_RATIO, 1200, viewportCap)
  return Math.round(Math.min(max, Math.max(min, width)))
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function formatOutput(output: RunSwarmResult["output"]): string {
  if (output == null) return ""
  if (typeof output === "string") return output
  const result = output.result
  if (typeof result === "string") return result
  try {
    return JSON.stringify(output, null, 2)
  } catch {
    return String(output)
  }
}

function formatStartLogBody(output: Record<string, unknown>): string {
  const runInput = output.runInput
  if (runInput && typeof runInput === "object") {
    return formatJson(runInput)
  }
  return "(no run input)"
}

function formatUserApprovalLogBody(output: Record<string, unknown>): string {
  const lines: string[] = []
  if (typeof output.decision === "string") lines.push(`decision: ${output.decision}`)
  if (typeof output.branchHandle === "string") lines.push(`branch: ${output.branchHandle}`)
  if (typeof output.comment === "string" && output.comment.trim()) {
    lines.push(`comment: ${output.comment}`)
  }
  if (typeof output.message === "string" && output.message.trim()) {
    lines.push(`message: ${output.message}`)
  }
  return lines.length > 0 ? lines.join("\n") : formatJson(output)
}

function formatResearchPapersLogBody(output: Record<string, unknown>): string {
  const lines: string[] = []
  if (typeof output.branchHandle === "string") lines.push(`branch: ${output.branchHandle}`)
  if (typeof output.status === "string") lines.push(`status: ${output.status}`)
  if (typeof output.query === "string") lines.push(`query: ${output.query}`)
  if (typeof output.paperCount === "number") lines.push(`paperCount: ${output.paperCount}`)
  if (typeof output.error === "string" && output.error.trim()) lines.push(`error: ${output.error}`)
  if (Array.isArray(output.papers) && output.papers.length > 0) {
    lines.push(`papers:\n${formatJson(output.papers.slice(0, 5))}`)
  }
  return lines.length > 0 ? lines.join("\n") : formatJson(output)
}

function formatScraperLogBody(output: Record<string, unknown>): string {
  const lines: string[] = []
  if (typeof output.branchHandle === "string") lines.push(`branch: ${output.branchHandle}`)
  if (typeof output.status === "string") lines.push(`status: ${output.status}`)
  if (typeof output.url === "string") lines.push(`url: ${output.url}`)
  if (typeof output.error === "string" && output.error.trim()) lines.push(`error: ${output.error}`)
  if (typeof output.content === "string" && output.content.trim()) {
    const preview = output.content.slice(0, 600)
    lines.push(`content:\n${preview}${output.content.length > 600 ? "\n…" : ""}`)
  }
  return lines.length > 0 ? lines.join("\n") : formatJson(output)
}

type SwarmLogPatch = Partial<Omit<SwarmLog, "logId">>

const DEFAULT_SWARM_LOG = (logId: string, step: number): SwarmLog => ({
  logId,
  kind: "worker",
  name: logId.slice(-6),
  step,
  status: "running",
  streamText: "",
})

function mergeSwarmLog(base: SwarmLog, patch: SwarmLogPatch): SwarmLog {
  return {
    logId: base.logId,
    kind: patch.kind ?? base.kind,
    name: patch.name ?? base.name,
    step: patch.step ?? base.step,
    status: patch.status ?? base.status,
    streamText: patch.streamText ?? base.streamText,
    meta: patch.meta ?? base.meta,
    model: patch.model ?? base.model,
    latencyMs: patch.latencyMs ?? base.latencyMs,
    inference: patch.inference ?? base.inference,
    messages: patch.messages ?? base.messages,
    contextInput: patch.contextInput ?? base.contextInput,
  }
}

function upsertSwarmLog(logs: SwarmLog[], logId: string, patch: SwarmLogPatch): SwarmLog[] {
  const idx = logs.findIndex((log) => log.logId === logId)
  if (idx === -1) {
    return [...logs, mergeSwarmLog(DEFAULT_SWARM_LOG(logId, logs.length + 1), patch)]
  }
  const next = [...logs]
  next[idx] = mergeSwarmLog(logs[idx]!, patch)
  return next
}

export default function SwarmTestPanel({
  swarmId,
  swarmName,
  workspaceApi,
  inputKeys = ["message"],
  hasStartNode = false,
  hasUnsavedGraph = false,
  onEditStartVariables,
  workerById = {},
  searchableSwarmIds = [],
  swarmNameById = {},
  setNodeRunState,
  resetNodeRunStates,
  setScaleVisual,
  setScaleShardState,
  resetScaleVisuals,
  agentConfigOpen = false,
}: Props) {
  const services = useMemo(() => createServices(ApiServices), [])

  const [inputs, setInputs] = useState<Record<string, string>>({})
  const [running, setRunning] = useState(false)
  const [swarmLogs, setSwarmLogs] = useState<SwarmLog[]>([])
  const [finalOutput, setFinalOutput] = useState("")
  const [runMeta, setRunMeta] = useState<{
    status: string
    durationMs?: number
    failureReason?: string
    usage?: SwarmRunUsageView | null
  } | null>(null)
  const [runHistory, setRunHistory] = useState<SwarmRun[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyRunLoading, setHistoryRunLoading] = useState(false)
  const [selectedHistoryRunId, setSelectedHistoryRunId] = useState<string | null>(null)
  const [liveSessionRunId, setLiveSessionRunId] = useState<string | null>(null)
  const liveSessionRunIdRef = useRef<string | null>(null)
  const [logsCollapsed, setLogsCollapsed] = useState(true)
  const [panelCollapsed, setPanelCollapsed] = useState(false)
  const [panelWidthPx, setPanelWidthPx] = useState(TEST_PANEL_DEFAULT_WIDTH_PX)

  useEffect(() => {
    if (agentConfigOpen) setPanelCollapsed(true)
  }, [agentConfigOpen])
  const [resizeActive, setResizeActive] = useState(false)
  const [pendingApproval, setPendingApproval] = useState<SwarmRunApproval | null>(null)

  const runAbortRef = useRef<AbortController | null>(null)
  const resumeAbortRef = useRef<AbortController | null>(null)
  const logsEndRef = useRef<HTMLDivElement>(null)
  const viewingHistory = selectedHistoryRunId != null

  useEffect(() => {
    setInputs((prev) => {
      const next: Record<string, string> = {}
      for (const key of inputKeys) {
        next[key] = prev[key] ?? ""
      }
      return next
    })
  }, [inputKeys.join("|")])

  useEffect(() => {
    if (running && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" })
    }
  }, [swarmLogs, running])

  const hasSwarmLogs = swarmLogs.length > 0
  useEffect(() => {
    setLogsCollapsed(!hasSwarmLogs)
  }, [hasSwarmLogs])

  const resetRunState = useCallback(() => {
    setSwarmLogs([])
    setFinalOutput("")
    setRunMeta(null)
    setSelectedHistoryRunId(null)
    setLiveSessionRunId(null)
    liveSessionRunIdRef.current = null
    setPendingApproval(null)
    resetNodeRunStates?.()
    resetScaleVisuals?.()
  }, [resetNodeRunStates, resetScaleVisuals])

  const loadToolInvocationRuns = useCallback(
    (parentRunId: string) =>
      loadAgentToolSubSwarmRuns(
        parentRunId,
        searchableSwarmIds,
        workspaceApi.listSwarmRuns,
      ),
    [searchableSwarmIds, workspaceApi],
  )

  const refreshRunLogs = useCallback(
    async (runId: string) => {
      try {
        const [swarmRun, agentRuns, childSubSwarmRuns] = await Promise.all([
          workspaceApi.getSwarmRun(runId),
          workspaceApi.listSwarmRunAgentRuns(runId),
          loadToolInvocationRuns(runId),
        ])
        setSwarmLogs(
          buildHistoricalSwarmLogs(swarmRun, agentRuns, workerById, {
            childSubSwarmRuns,
            swarmNameById,
          }),
        )
        setFinalOutput(formatHistoricalOutput(swarmRun.output))
        setRunMeta({
          status: swarmRun.status,
          durationMs: swarmRun.durationMs ?? undefined,
          failureReason: swarmRun.failureReason ?? undefined,
          usage: usageFromSwarmRun(swarmRun),
        })
        if (swarmRun.status === "awaiting_approval") {
          const approval = await services.getSwarmRunPendingApproval(runId)
          setPendingApproval(approval)
        } else {
          setPendingApproval(null)
        }
      } catch {
        // Keep existing logs if refresh fails.
      }
    },
    [loadToolInvocationRuns, services, swarmNameById, workerById, workspaceApi],
  )

  const refreshRunHistory = useCallback(async () => {
    setHistoryLoading(true)
    try {
      const runs = await workspaceApi.listSwarmRuns(swarmId)
      setRunHistory(runs)
    } catch {
      toast.error("Could not load swarm run history")
    } finally {
      setHistoryLoading(false)
    }
  }, [swarmId, workspaceApi])

  const applyHistoricalRun = useCallback(
    async (runId: string) => {
      setHistoryRunLoading(true)
      try {
        const [swarmRun, agentRuns, childSubSwarmRuns] = await Promise.all([
          workspaceApi.getSwarmRun(runId),
          workspaceApi.listSwarmRunAgentRuns(runId),
          loadToolInvocationRuns(runId),
        ])
        setSelectedHistoryRunId(runId)
        setInputs(runInputToFormValues(swarmRun.input, inputKeys))
        setSwarmLogs(
          buildHistoricalSwarmLogs(swarmRun, agentRuns, workerById, {
            childSubSwarmRuns,
            swarmNameById,
          }),
        )
        setFinalOutput(formatHistoricalOutput(swarmRun.output))
        setRunMeta({
          status: swarmRun.status,
          durationMs: swarmRun.durationMs ?? undefined,
          failureReason: swarmRun.failureReason ?? undefined,
          usage: usageFromSwarmRun(swarmRun),
        })
        if (swarmRun.status === "awaiting_approval") {
          const approval = await services.getSwarmRunPendingApproval(runId)
          setPendingApproval(approval)
        } else {
          setPendingApproval(null)
        }
      } catch {
        toast.error("Could not load swarm run")
      } finally {
        setHistoryRunLoading(false)
      }
    },
    [inputKeys, loadToolInvocationRuns, services, swarmNameById, workerById, workspaceApi],
  )

  useEffect(() => {
    void refreshRunHistory()
  }, [refreshRunHistory])

  const appendToolInvocationLogs = useCallback(
    (parentRunId: string | null) => {
      if (!parentRunId) return
      void loadToolInvocationRuns(parentRunId).then((childRuns) => {
        if (childRuns.length === 0) return
        setSwarmLogs((prev) => appendSubSwarmToolLogs(prev, childRuns, swarmNameById))
      })
    },
    [loadToolInvocationRuns, swarmNameById],
  )

  const handleStreamEvent = useCallback((event: SwarmSseEvent) => {
    switch (event.type) {
      case "swarm_start":
        liveSessionRunIdRef.current = event.swarmRunId
        setLiveSessionRunId(event.swarmRunId)
        break
      case "node_start":
        setNodeRunState?.(event.nodeId, "running")
        if (
          event.nodeKind === "start" ||
          event.nodeKind === "scraper" ||
          event.nodeKind === "research_papers" ||
          event.nodeKind === "ifelse" ||
          event.nodeKind === "while" ||
          event.nodeKind === "user_approval" ||
          event.nodeKind === "end" ||
          event.nodeKind === "worker"
        ) {
          const nodeKind = event.nodeKind
          setSwarmLogs((prev) =>
            upsertSwarmLog(prev, event.nodeId, {
              kind: nodeKind === "worker" ? "worker" : nodeKind,
              name: event.nodeName,
              step: event.step,
              status: "running",
              streamText:
                nodeKind === "user_approval" ? "Waiting for human approval…" : "",
            }),
          )
        }
        break
      case "node_skipped":
        setNodeRunState?.(event.nodeId, "skipped")
        setSwarmLogs((prev) =>
          upsertSwarmLog(prev, event.nodeId, {
            kind:
              event.nodeKind === "worker"
                ? "worker"
                : event.nodeKind,
            name: event.nodeName,
            step: event.wave,
            status: "done",
            streamText:
              event.reason === "branch_pruned"
                ? "Skipped — inactive branch"
                : "Skipped — unreachable",
            meta: event.fromNodeId ? `from · ${event.fromNodeId}` : undefined,
          }),
        )
        break
      case "node_done":
        setNodeRunState?.(event.nodeId, "done")
        if (event.nodeKind === "start") {
          setSwarmLogs((prev) =>
            upsertSwarmLog(prev, event.nodeId, {
              kind: "start",
              name: event.nodeName,
              step: event.step,
              status: "done",
              latencyMs: event.latencyMs,
              streamText: formatStartLogBody(event.output),
            }),
          )
        } else if (event.nodeKind === "research_papers") {
          setSwarmLogs((prev) =>
            upsertSwarmLog(prev, event.nodeId, {
              kind: "research_papers",
              name: event.nodeName,
              step: event.step,
              status: "done",
              latencyMs: event.latencyMs,
              streamText: formatResearchPapersLogBody(event.output),
              meta:
                typeof event.output.status === "string"
                  ? `branch · ${String(event.output.branchHandle ?? "—")}`
                  : undefined,
            }),
          )
        } else if (event.nodeKind === "scraper") {
          setSwarmLogs((prev) =>
            upsertSwarmLog(prev, event.nodeId, {
              kind: "scraper",
              name: event.nodeName,
              step: event.step,
              status: "done",
              latencyMs: event.latencyMs,
              streamText: formatScraperLogBody(event.output),
              meta:
                typeof event.output.status === "string"
                  ? `branch · ${String(event.output.branchHandle ?? "—")}`
                  : undefined,
            }),
          )
        } else if (event.nodeKind === "swarm") {
          setSwarmLogs((prev) =>
            upsertSwarmLog(prev, event.nodeId, {
              kind: "swarm",
              name: event.nodeName,
              step: event.step,
              status: "done",
              latencyMs: event.latencyMs,
              streamText: formatJson(event.output),
              meta:
                typeof event.output.branchHandle === "string"
                  ? `branch · ${event.output.branchHandle}`
                  : undefined,
            }),
          )
        } else if (event.nodeKind === "ifelse") {
          setSwarmLogs((prev) =>
            upsertSwarmLog(prev, event.nodeId, {
              kind: "ifelse",
              name: event.nodeName,
              step: event.step,
              status: "done",
              latencyMs: event.latencyMs,
              streamText: formatIfElseLogBody(event.output),
              meta: formatIfElseBranchMeta(event.output),
            }),
          )
        } else if (event.nodeKind === "while") {
          setSwarmLogs((prev) =>
            upsertSwarmLog(prev, event.nodeId, {
              kind: "while",
              name: event.nodeName,
              step: event.step,
              status: "done",
              latencyMs: event.latencyMs,
              streamText: formatJson(event.output),
              meta:
                typeof event.output.branchHandle === "string"
                  ? `branch · ${event.output.branchHandle}`
                  : undefined,
            }),
          )
        } else if (event.nodeKind === "user_approval") {
          setSwarmLogs((prev) =>
            upsertSwarmLog(prev, event.nodeId, {
              kind: "user_approval",
              name: event.nodeName,
              step: event.step,
              status: "done",
              latencyMs: event.latencyMs,
              streamText: formatUserApprovalLogBody(event.output),
              meta:
                typeof event.output.decision === "string"
                  ? `decision · ${event.output.decision}`
                  : undefined,
            }),
          )
        } else if (event.nodeKind === "end") {
          setSwarmLogs((prev) =>
            upsertSwarmLog(prev, event.nodeId, {
              kind: "end",
              name: event.nodeName,
              step: event.step,
              status: "done",
              latencyMs: event.latencyMs,
              streamText: formatEndLogBody(event.output),
            }),
          )
        } else if (event.nodeKind === "worker") {
          setSwarmLogs((prev) =>
            upsertSwarmLog(prev, event.nodeId, {
              kind: "worker",
              name: event.nodeName,
              step: event.step,
              status: "done",
              latencyMs: event.latencyMs,
            }),
          )
        }
        break
      case "approval_required":
        setNodeRunState?.(event.nodeId, "waiting")
        setLogsCollapsed(false)
        setPendingApproval({
          id: event.approvalId,
          swarmRunId: event.swarmRunId,
          swarmId: event.swarmId,
          nodeId: event.nodeId,
          name: event.name,
          message: event.message,
          passthrough: event.passthrough,
          assigneeUserId: event.assigneeUserId,
          requestedBy: "",
          status: "pending",
          decision: null,
          comment: "",
          decidedBy: null,
          decidedAt: null,
        })
        setRunMeta({ status: "awaiting_approval" })
        break
      case "worker_start":
        setSwarmLogs((prev) =>
          upsertSwarmLog(prev, event.nodeId, {
            kind: "worker",
            name: event.workerName,
            step: event.step,
            status: "running",
            streamText: "",
          }),
        )
        break
      case "worker_meta":
        setSwarmLogs((prev) =>
          upsertSwarmLog(prev, event.nodeId, {
            meta: `${event.provider} · ${event.model}`,
            model: event.model,
          }),
        )
        break
      case "delta":
        setSwarmLogs((prev) => {
          const existing = prev.find((log) => log.logId === event.nodeId)
          return upsertSwarmLog(prev, event.nodeId, {
            kind: "worker",
            streamText: (existing?.streamText ?? "") + event.delta,
          })
        })
        break
      case "worker_done":
        setSwarmLogs((prev) =>
          upsertSwarmLog(prev, event.nodeId, {
            kind: "worker",
            status: "done",
            latencyMs: event.latencyMs,
            inference: event.inference,
            messages: event.messages,
            contextInput: event.inferenceRequest,
          }),
        )
        appendToolInvocationLogs(liveSessionRunIdRef.current)
        break
      case "swarm_done": {
        const swarmRun = event.swarmRun
        appendToolInvocationLogs(liveSessionRunIdRef.current ?? swarmRun.id)
        setFinalOutput(formatOutput(event.output))
        setRunMeta({
          status: String(swarmRun.status ?? "done"),
          durationMs: event.durationMs,
          failureReason: swarmRun.failureReason ?? undefined,
          usage: usageFromSwarmDone(event),
        })
        break
      }
      case "scale_expand":
        setScaleVisual?.(event.nodeId, {
          count: event.count,
          phase: "expanded",
          shardStates: Array.from({ length: event.count }, () => "running" as const),
        })
        break
      case "scale_shard_start":
        setScaleShardState?.(event.nodeId, event.shardIndex, "running")
        break
      case "scale_shard_done":
        setScaleShardState?.(event.nodeId, event.shardIndex, "done")
        break
      case "scale_collapse":
        setScaleVisual?.(event.nodeId, (current) =>
          current
            ? { ...current, phase: "collapsing" }
            : { count: 1, phase: "collapsing", shardStates: ["done"] },
        )
        window.setTimeout(() => setScaleVisual?.(event.nodeId, null), 420)
        break
      case "error":
        setRunMeta({ status: "failed", failureReason: event.message })
        toast.error(event.message)
        break
      default:
        break
    }
  }, [appendToolInvocationLogs, setNodeRunState, setScaleShardState, setScaleVisual])

  const onHistoryChange = useCallback(
    (value: string) => {
      if (value === "live") {
        setSelectedHistoryRunId(null)
        if (liveSessionRunId) {
          void applyHistoricalRun(liveSessionRunId)
          return
        }
        resetRunState()
        return
      }
      void applyHistoricalRun(value)
    },
    [applyHistoricalRun, liveSessionRunId, resetRunState],
  )

  const applyDecideResult = useCallback(
    async (
      result: Awaited<ReturnType<typeof workspaceApi.decideSwarmRunApproval>>,
      approvalSnapshot: SwarmRunApproval,
      decision: "approve" | "reject",
    ) => {
      setRunMeta({
        status: result.swarmRun.status,
        durationMs: result.swarmRun.durationMs ?? undefined,
        failureReason: result.swarmRun.failureReason ?? undefined,
        usage: usageFromSwarmRun(result.swarmRun),
      })
      setFinalOutput(formatOutput(result.output))
      setSwarmLogs((prev) =>
        upsertSwarmLog(prev, approvalSnapshot.nodeId, {
          kind: "user_approval",
          name: approvalSnapshot.name,
          status: "done",
          streamText: `${decision === "approve" ? "Approved" : "Rejected"} — swarm continued`,
          meta: `decision · ${decision}`,
        }),
      )
      if (result.paused && result.nextApproval) {
        setPendingApproval(result.nextApproval)
      } else {
        setPendingApproval(null)
        await refreshRunLogs(result.swarmRun.id)
      }
    },
    [refreshRunLogs],
  )

  const onDecideApproval = useCallback(
    async (decision: "approve" | "reject", comment?: string) => {
      if (!pendingApproval) return

      const approvalSnapshot = pendingApproval
      setPendingApproval(null)
      setRunning(true)
      setLogsCollapsed(false)
      setRunMeta({ status: "running" })

      setNodeRunState?.(approvalSnapshot.nodeId, "running")
      setSwarmLogs((prev) =>
        upsertSwarmLog(prev, approvalSnapshot.nodeId, {
          kind: "user_approval",
          name: approvalSnapshot.name,
          status: "running",
          streamText: `${decision === "approve" ? "Approved" : "Rejected"} — resuming swarm…`,
        }),
      )

      resumeAbortRef.current?.abort()
      const controller = new AbortController()
      resumeAbortRef.current = controller

      try {
        const decideStream = workspaceApi.runUsesAdminStream
          ? adminDecideSwarmRunStream
          : decideSwarmRunStream
        await decideStream(
          approvalSnapshot.id,
          { decision, comment },
          { onEvent: handleStreamEvent },
          controller.signal,
        )
        setRunMeta((prev) => {
          if (prev?.status === "failed") return prev
          return prev ?? { status: "done" }
        })
      } catch (streamErr: unknown) {
        if (streamErr instanceof DOMException && streamErr.name === "AbortError") return

        try {
          const result = await workspaceApi.decideSwarmRunApproval(approvalSnapshot.id, {
            decision,
            comment,
          })
          await applyDecideResult(result, approvalSnapshot, decision)
        } catch (syncErr: unknown) {
          const message =
            syncErr instanceof Error ? syncErr.message : "Could not submit approval"
          toast.error(message)
          setRunMeta({ status: "failed", failureReason: message })
          try {
            const pending = await services.getSwarmRunPendingApproval(approvalSnapshot.swarmRunId)
            setPendingApproval(pending)
          } catch {
            // Run may have failed without a pending gate.
          }
        }
      } finally {
        setRunning(false)
        resumeAbortRef.current = null
        void refreshRunHistory()
      }
    },
    [
      applyDecideResult,
      handleStreamEvent,
      pendingApproval,
      refreshRunHistory,
      services,
      setNodeRunState,
      workspaceApi,
    ],
  )

  const onRun = async () => {
    const payload: Record<string, string> = {}
    for (const key of inputKeys) {
      const value = (inputs[key] ?? "").trim()
      if (value) payload[key] = value
    }
    if (Object.keys(payload).length === 0) {
      toast.error("Enter at least one run input value")
      return
    }
    if (hasUnsavedGraph) {
      toast.error("Save the graph first — the test run uses the last saved version, not the live canvas.")
      return
    }

    runAbortRef.current?.abort()
    resumeAbortRef.current?.abort()
    const controller = new AbortController()
    runAbortRef.current = controller

    resetRunState()
    setRunning(true)

    try {
      const runStream = workspaceApi.runUsesAdminStream ? adminRunSwarmStream : runSwarmStream
      await runStream(
        swarmId,
        { input: payload },
        { onEvent: handleStreamEvent },
        controller.signal,
      )
      setRunMeta((prev) => {
        if (prev?.status === "failed") return prev
        return prev ?? { status: "done" }
      })
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === "AbortError") return
      const errMessage = err instanceof Error ? err.message : "Could not run swarm"
      toast.error(errMessage)
      setRunMeta({ status: "failed", failureReason: errMessage })
    } finally {
      setRunning(false)
      runAbortRef.current = null
      void refreshRunHistory()
    }
  }

  const historySelectValue = selectedHistoryRunId ?? (liveSessionRunId ? "live" : "")

  const sortedLogs = [...swarmLogs].sort((a, b) => a.step - b.step)
  const canCopyFinalOutput = finalOutput.trim().length > 0
  const canCopySwarmLogs = sortedLogs.some(
    (log) => log.kind === "worker" || log.kind === "swarm_tool",
  )

  const testPanelHelpText = useMemo(
    () =>
      `Send run inputs through ${swarmName}. Values map to runInput.* for agents wired from Start. Company context is merged automatically when you have a company selected. Exit output streams on the right.`,
    [swarmName],
  )

  const startPanelResize = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      event.preventDefault()
      const startX = event.clientX
      const startWidth = panelWidthPx
      setResizeActive(true)
      document.body.style.cursor = "col-resize"
      document.body.style.userSelect = "none"

      const onMove = (moveEvent: MouseEvent) => {
        setPanelWidthPx(clampTestPanelWidth(startWidth + (startX - moveEvent.clientX)))
      }

      const onUp = () => {
        setResizeActive(false)
        document.body.style.cursor = ""
        document.body.style.userSelect = ""
        window.removeEventListener("mousemove", onMove)
        window.removeEventListener("mouseup", onUp)
      }

      window.addEventListener("mousemove", onMove)
      window.addEventListener("mouseup", onUp)
    },
    [panelWidthPx],
  )

  const copyFinalOutput = useCallback(async () => {
    const text = finalOutput.trim()
    if (!text) return
    try {
      await navigator.clipboard.writeText(text)
      toast.success("Output copied to clipboard")
    } catch {
      toast.error("Could not copy to clipboard")
    }
  }, [finalOutput])

  const copySwarmLogs = useCallback(async () => {
    const text = formatSwarmWorkerLogsForCopy(sortedLogs)
    if (!text.trim()) return
    try {
      await navigator.clipboard.writeText(text)
      toast.success("Agent logs copied")
    } catch {
      toast.error("Could not copy to clipboard")
    }
  }, [sortedLogs])

  const panelStyle = panelCollapsed
    ? undefined
    : {
        width: panelWidthPx,
        minWidth: panelWidthPx,
        maxWidth: panelWidthPx,
      }

  return (
    <aside
      className={`panel test-panel${panelCollapsed ? " test-panel--collapsed" : ""}${resizeActive ? " test-panel--resizing" : ""}`}
      style={panelStyle}
      aria-label="Swarm test console"
    >
      {!panelCollapsed ? (
        <div className={`test-panel-resize${resizeActive ? " test-panel-resize--active" : ""}`}>
          <button
            type="button"
            className="test-panel-resize-handle"
            onMouseDown={startPanelResize}
            aria-label="Resize test swarm panel"
            title="Drag to resize panel width"
          >
            <TbGripVertical size={14} aria-hidden />
          </button>
        </div>
      ) : null}

      <header className="test-panel-head">
        {panelCollapsed ? (
          <span className="test-panel-rail-label" aria-hidden>
            Test
          </span>
        ) : (
          <div className="test-panel-head-start">
            <span className="test-panel-head-title">Test swarm</span>
            <button
              type="button"
              className="test-panel-help"
              aria-label="About test swarm"
              title={testPanelHelpText}
            >
              <TbHelpCircle size={14} aria-hidden />
            </button>
          </div>
        )}
        <button
          type="button"
          className="test-panel-toggle"
          onClick={() => setPanelCollapsed((collapsed) => !collapsed)}
          aria-expanded={!panelCollapsed}
          aria-label={panelCollapsed ? "Expand test swarm panel" : "Minimize test swarm panel"}
          title={panelCollapsed ? "Expand test swarm panel" : "Minimize test swarm panel"}
        >
          {panelCollapsed ? (
            <TbChevronLeft size={14} aria-hidden />
          ) : (
            <TbChevronRight size={14} aria-hidden />
          )}
        </button>
        {panelCollapsed && running ? (
          <span className="test-panel-rail-live" aria-label="Swarm run in progress" />
        ) : null}
      </header>

      {!panelCollapsed ? (
      <div className="body">
        <div className="results">
          <div className="history-bar">
            <label className="history-field">
              <span className="history-label">
                <TbHistory size={12} aria-hidden />
                Run history
              </span>
              <select
                className="history-select"
                value={historySelectValue}
                onChange={(e) => onHistoryChange(e.target.value)}
                disabled={running || historyLoading || historyRunLoading}
              >
                <option value="" disabled>
                  {historyLoading ? "Loading runs…" : "Select a past run…"}
                </option>
                {liveSessionRunId && !running ? (
                  <option value="live">Current session</option>
                ) : null}
                {runHistory.map((run) => (
                  <option key={run.id} value={run.id}>
                    {formatSwarmRunHistoryLabel(run)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="history-refresh"
              onClick={() => void refreshRunHistory()}
              disabled={running || historyLoading}
              aria-label="Refresh run history"
              title="Refresh run history"
            >
              <TbRefresh size={14} aria-hidden />
            </button>
          </div>

          {viewingHistory ? <p className="history-note">Viewing a saved run from history.</p> : null}

          {runMeta ? (
            <SwarmRunSummary
              status={runMeta.status}
              durationMs={runMeta.durationMs}
              usage={runMeta.usage}
              failureReason={runMeta.failureReason}
            />
          ) : null}

          {pendingApproval ? (
            <SwarmRunApprovalGate
              approval={pendingApproval}
              disabled={running}
              onDecide={(decision, comment) => void onDecideApproval(decision, comment)}
            />
          ) : null}

          <div className={`split${logsCollapsed ? " split--logs-collapsed" : ""}`}>
            <section className="col col--out" aria-label="Run inputs and final output">
              <div className="input-vars-head">
                <span className="col-label">Input variables</span>
                <button
                  type="button"
                  className="input-vars-edit"
                  onClick={() => onEditStartVariables?.()}
                  disabled={running}
                  title={
                    hasStartNode
                      ? "Open Start node on canvas"
                      : "Add a Start node to declare variables"
                  }
                >
                  <TbSettings size={13} aria-hidden />
                  <span>{hasStartNode ? "Edit Start" : "Add Start"}</span>
                </button>
              </div>

              <div className="fields">
                {inputKeys.map((key) => (
                  <label key={key} className="field">
                    <span>{key}</span>
                    {key === "message" || inputKeys.length === 1 ? (
                      <textarea
                        rows={key === "message" ? 4 : 3}
                        placeholder={
                          key === "message"
                            ? "e.g. Analyze acme.com and summarize the ICP…"
                            : `Enter ${key}…`
                        }
                        value={inputs[key] ?? ""}
                        onChange={(e) =>
                          setInputs((prev) => ({ ...prev, [key]: e.target.value }))
                        }
                        disabled={running}
                      />
                    ) : (
                      <input
                        type="text"
                        placeholder={`Enter ${key}…`}
                        value={inputs[key] ?? ""}
                        onChange={(e) =>
                          setInputs((prev) => ({ ...prev, [key]: e.target.value }))
                        }
                        disabled={running}
                      />
                    )}
                  </label>
                ))}
              </div>
              <span className="col-label">Final output</span>
              <button
                type="button"
                className="run"
                disabled={running || pendingApproval != null}
                onClick={() => void onRun()}
              >
                <TbPlayerPlay size={15} aria-hidden />
                <span>{running ? "Running…" : "Run Swarm"}</span>
              </button>
              <div className={`out-wrap${canCopyFinalOutput ? " out-wrap--copyable" : ""}`}>
                {canCopyFinalOutput ? (
                  <button
                    type="button"
                    className="out-copy"
                    onClick={() => void copyFinalOutput()}
                    aria-label="Copy final output"
                    title="Copy final output"
                  >
                    <TbCopy size={14} aria-hidden />
                  </button>
                ) : null}
                <pre className="out">
                  {finalOutput || (running ? "Running…" : "(empty output)")}
                </pre>
              </div>
            </section>

            <section
              className={`col col--logs${logsCollapsed ? " col--logs-collapsed" : ""}`}
              aria-label="Swarm execution logs"
            >
              <div className="logs-toolbar">
                {!logsCollapsed ? (
                  <span className="col-label">Swarm logs</span>
                ) : (
                  <span className="logs-collapsed-label" aria-hidden>
                    Logs
                  </span>
                )}
                <div className="logs-toolbar-actions">
                  {canCopySwarmLogs ? (
                    <button
                      type="button"
                      className="logs-copy-btn"
                      onClick={() => void copySwarmLogs()}
                      aria-label="Copy agent and sub-swarm tool logs"
                      title="Copy agent and sub-swarm tool logs"
                    >
                      <TbCopy size={14} aria-hidden />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="logs-collapse-btn"
                    onClick={() => setLogsCollapsed((collapsed) => !collapsed)}
                    aria-expanded={!logsCollapsed}
                    aria-label={logsCollapsed ? "Expand swarm logs" : "Minimize swarm logs"}
                    title={logsCollapsed ? "Expand swarm logs" : "Minimize swarm logs"}
                  >
                    {logsCollapsed ? (
                      <TbChevronLeft size={14} aria-hidden />
                    ) : (
                      <TbChevronRight size={14} aria-hidden />
                    )}
                  </button>
                </div>
              </div>
              {!logsCollapsed ? (
                sortedLogs.length === 0 ? (
                  <p className="col-empty">
                    {running
                      ? "Waiting for swarm steps…"
                      : historyRunLoading
                        ? "Loading run…"
                        : "No swarm steps recorded."}
                  </p>
                ) : (
                  <ul className="log-list">
                    {sortedLogs.map((log) =>
                      log.kind === "worker" ? (
                        <li key={log.logId} className="log-list-item">
                          <WorkerLogCard
                            name={log.name}
                            step={log.step}
                            status={log.status}
                            streamText={log.streamText}
                            meta={log.meta}
                            latencyMs={log.latencyMs}
                            model={log.model}
                            inference={log.inference}
                            messages={log.messages}
                            contextInput={log.contextInput}
                          />
                        </li>
                      ) : (
                        <li key={log.logId} className={`log log--${log.status} log--${log.kind}`}>
                          <div className="log-head log-head--static">
                            <span className="log-step">{log.step}</span>
                            <span className="log-kind">{log.kind}</span>
                            <span className="log-name">{log.name}</span>
                            {log.latencyMs != null ? (
                              <span className="log-dur">{log.latencyMs} ms</span>
                            ) : log.status === "running" ? (
                              <span className="log-dur log-dur--live">running</span>
                            ) : null}
                          </div>
                          {log.meta ? <p className="log-meta">{log.meta}</p> : null}
                          <pre className="log-body">
                            {log.streamText || (log.status === "running" ? "…" : "(no output)")}
                          </pre>
                        </li>
                      ),
                    )}
                    <div ref={logsEndRef} />
                  </ul>
                )
              ) : sortedLogs.length > 0 ? (
                <span className="logs-collapsed-count">{sortedLogs.length}</span>
              ) : null}
            </section>
          </div>
        </div>
      </div>
      ) : null}

      <style jsx>{`
        .panel {
          flex-shrink: 0;
          border-left: 1px solid var(--app-border-strong);
          background: var(--app-surface);
          box-shadow: -4px 0 16px -4px rgba(10, 10, 10, 0.06);
          display: flex;
          flex-direction: column;
          height: 100%;
          max-height: 100%;
          min-height: 0;
          overflow: hidden;
        }
        .test-panel {
          position: relative;
        }
        .test-panel--collapsed {
          width: 2rem !important;
          min-width: 2rem !important;
          max-width: 2rem !important;
        }
        .test-panel--resizing {
          transition: none;
        }
        .test-panel-resize {
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 12px;
          transform: translateX(-50%);
          z-index: 3;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: col-resize;
        }
        .test-panel-resize-handle {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 1.25rem;
          height: 2rem;
          padding: 0;
          border: 1px solid var(--app-border);
          border-radius: var(--app-radius);
          background: var(--app-surface);
          color: var(--app-text-faint);
          cursor: col-resize;
          opacity: 0;
          box-shadow: 0 1px 4px rgba(0, 0, 0, 0.06);
          transition:
            opacity 0.15s ease,
            color 0.15s ease,
            border-color 0.15s ease;
        }
        .test-panel-resize:hover .test-panel-resize-handle,
        .test-panel-resize--active .test-panel-resize-handle {
          opacity: 1;
        }
        .test-panel-resize-handle:hover {
          color: var(--app-text);
          border-color: var(--app-border-strong);
        }
        .test-panel-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.375rem;
          padding: 0.5625rem 0.75rem;
          border-bottom: 1px solid var(--app-border-strong);
          background: var(--app-surface);
          box-shadow: var(--app-shadow-sm);
          flex-shrink: 0;
          z-index: 1;
        }
        .test-panel--collapsed .test-panel-head {
          flex: 1;
          flex-direction: column;
          justify-content: flex-start;
          padding: 0.625rem 0.125rem;
          border-bottom: none;
          gap: 0.5rem;
        }
        .test-panel-head-start {
          display: inline-flex;
          align-items: center;
          gap: 0.375rem;
          min-width: 0;
          flex: 1;
        }
        .test-panel-head-title {
          font-size: 0.8125rem;
          font-weight: 600;
          letter-spacing: var(--app-tracking-tight);
          color: var(--app-text);
          min-width: 0;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .test-panel-help {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 1.25rem;
          height: 1.25rem;
          padding: 0;
          border: none;
          border-radius: var(--app-radius-pill);
          background: transparent;
          color: var(--app-text-faint);
          cursor: help;
          flex-shrink: 0;
        }
        .test-panel-help:hover {
          color: var(--app-text-muted);
          background: var(--app-surface);
        }
        .test-panel-rail-label {
          font-size: 0.5625rem;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--app-text-faint);
          writing-mode: vertical-rl;
          transform: rotate(180deg);
          user-select: none;
        }
        .test-panel-toggle {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 1.5rem;
          height: 1.5rem;
          padding: 0;
          border: 1px solid var(--app-border-strong);
          border-radius: var(--app-radius);
          background: var(--app-bg);
          color: var(--app-text-muted);
          cursor: pointer;
          flex-shrink: 0;
        }
        .test-panel-toggle:hover {
          border-color: var(--app-text);
          color: var(--app-text);
          background: var(--app-surface-muted);
        }
        .test-panel-rail-live {
          width: 0.375rem;
          height: 0.375rem;
          border-radius: 50%;
          background: var(--app-text);
          flex-shrink: 0;
          animation: test-panel-pulse 1.2s ease-in-out infinite;
        }
        @keyframes test-panel-pulse {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.35;
          }
        }
        .body {
          flex: 1;
          overflow: hidden;
          padding: 0.75rem 1.25rem 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          min-height: 0;
          background: var(--app-surface);
        }
        .input-vars-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
          flex-shrink: 0;
        }
        .input-vars-edit {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          padding: 0.2rem 0.45rem;
          border: 1px solid var(--app-border-strong);
          border-radius: var(--app-radius);
          background: var(--app-surface);
          color: var(--app-text-muted);
          font-family: var(--app-font);
          font-size: 0.625rem;
          font-weight: 500;
          cursor: pointer;
          flex-shrink: 0;
        }
        .input-vars-edit:hover:not(:disabled) {
          color: var(--app-text);
          border-color: var(--app-text);
          background: var(--app-surface-muted);
        }
        .input-vars-edit:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .fields {
          display: flex;
          flex-direction: column;
          gap: 0.625rem;
          flex-shrink: 0;
        }
        .field {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          font-size: 0.6875rem;
          color: var(--app-text-muted);
          flex-shrink: 0;
        }
        .field textarea {
          font-size: 0.75rem;
          padding: 0.5rem;
          border: 1px solid var(--app-border);
          border-radius: var(--app-radius);
          background: var(--app-bg);
          color: var(--app-text);
          font-family: var(--app-font);
          resize: vertical;
        }
        .field textarea:focus {
          outline: none;
          border-color: var(--app-border-strong);
          box-shadow: var(--app-btn-focus-ring);
        }
        .field input {
          font-size: 0.75rem;
          padding: 0.4375rem 0.5rem;
          border: 1px solid var(--app-border);
          border-radius: var(--app-radius);
          background: var(--app-bg);
          color: var(--app-text);
          font-family: var(--app-font);
        }
        .field input:focus {
          outline: none;
          border-color: var(--app-border-strong);
          box-shadow: var(--app-btn-focus-ring);
        }
        .field select {
          font-size: 0.75rem;
          padding: 0.4375rem 0.5rem;
          border: 1px solid var(--app-border);
          border-radius: var(--app-radius);
          background: var(--app-bg);
          color: var(--app-text);
          font-family: var(--app-font);
        }
        .field select:focus {
          outline: none;
          border-color: var(--app-border-strong);
          box-shadow: var(--app-btn-focus-ring);
        }
        .run {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          width: 100%;
          padding: 0.5rem 0.75rem;
          font-size: 0.75rem;
          font-weight: 500;
          color: var(--app-bg);
          background: var(--app-text);
          border: none;
          border-radius: var(--app-radius);
          cursor: pointer;
          font-family: var(--app-font);
          flex-shrink: 0;
        }
        .run:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .results {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          min-height: 0;
          flex: 1;
        }
        .history-bar {
          display: flex;
          align-items: flex-end;
          gap: 0.375rem;
          flex-shrink: 0;
        }
        .history-field {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
        }
        .history-label {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          font-size: 0.5625rem;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--app-text-faint);
        }
        .history-select {
          width: 100%;
          font-size: 0.625rem;
          padding: 0.35rem 0.45rem;
          border: 1px solid var(--app-border);
          border-radius: var(--app-radius);
          background: var(--app-bg);
          color: var(--app-text);
          font-family: var(--app-font);
        }
        .history-select:focus {
          outline: none;
          border-color: var(--app-border-strong);
          box-shadow: var(--app-btn-focus-ring);
        }
        .history-refresh {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 1.75rem;
          height: 1.75rem;
          border: 1px solid var(--app-border);
          border-radius: var(--app-radius);
          background: var(--app-bg);
          color: var(--app-text-muted);
          cursor: pointer;
          flex-shrink: 0;
        }
        .history-refresh:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .history-note {
          margin: 0;
          font-size: 0.5625rem;
          color: var(--app-text-faint);
          font-style: italic;
          flex-shrink: 0;
        }
        .split {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.5rem;
          flex: 1;
          min-height: 0;
          overflow: hidden;
        }
        .split--logs-collapsed {
          grid-template-columns: 1fr 2rem;
          gap: 0.25rem;
        }
        .col {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          min-height: 0;
          min-width: 0;
          overflow-y: auto;
          overscroll-behavior: contain;
          padding: 0 0.375rem;
        }
        .col--out {
          overflow: hidden;
        }
        .col--logs-collapsed {
          overflow: hidden;
          padding: 0 0.125rem;
          align-items: center;
        }
        .logs-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.25rem;
          flex-shrink: 0;
          width: 100%;
        }
        .col--logs-collapsed .logs-toolbar {
          flex-direction: column;
          justify-content: flex-start;
          gap: 0.375rem;
          padding-top: 0.125rem;
        }
        .logs-toolbar-actions {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          flex-shrink: 0;
        }
        .col--logs-collapsed .logs-toolbar-actions {
          flex-direction: column;
        }
        .logs-copy-btn,
        .logs-collapse-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 1.5rem;
          height: 1.5rem;
          padding: 0;
          border: 1px solid var(--app-border);
          border-radius: var(--app-radius);
          background: var(--app-bg);
          color: var(--app-text-muted);
          cursor: pointer;
          flex-shrink: 0;
        }
        .logs-copy-btn:hover,
        .logs-collapse-btn:hover {
          border-color: var(--app-border-strong);
          color: var(--app-text);
          background: var(--app-surface-muted);
        }
        .logs-collapsed-label {
          font-size: 0.5625rem;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: var(--app-text-faint);
          writing-mode: vertical-rl;
          transform: rotate(180deg);
          user-select: none;
        }
        .logs-collapsed-count {
          font-size: 0.625rem;
          font-weight: 500;
          font-variant-numeric: tabular-nums;
          color: var(--app-text-muted);
          padding: 0.125rem 0;
        }
        .col-label {
          font-size: 0.625rem;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: var(--app-text-faint);
          flex-shrink: 0;
        }
        .col-empty {
          margin: 0;
          padding: 0.5rem;
          font-size: 0.625rem;
          color: var(--app-text-faint);
          background: var(--app-bg);
          border: 1px dashed var(--app-border);
          border-radius: var(--app-radius);
        }
        .log-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 0.375rem;
        }
        .log-list-item {
          list-style: none;
        }
        .log {
          border: 1px solid var(--app-border);
          border-radius: var(--app-radius);
          background: var(--app-bg);
          overflow: hidden;
        }
        .log--running {
          border-color: var(--app-border-strong);
        }
        .log--user_approval {
          border-color: #fdba74;
        }
        .log--user_approval.log--running {
          border-color: #ea580c;
          background: color-mix(in srgb, #ea580c 4%, var(--app-bg));
        }
        .log--user_approval .log-kind {
          border-color: #fdba74;
          color: #9a3412;
          background: color-mix(in srgb, #ea580c 10%, var(--app-surface));
        }
        .log--user_approval .log-head {
          background: color-mix(in srgb, #ea580c 6%, var(--app-surface-muted));
        }
        .log--swarm_tool {
          border-color: var(--app-border-strong);
        }
        .log--swarm_tool .log-kind {
          text-transform: none;
          letter-spacing: 0.02em;
        }
        .log-head {
          width: 100%;
          display: flex;
          align-items: center;
          gap: 0.375rem;
          padding: 0.25rem 0.5rem;
          background: var(--app-surface-muted);
          border-bottom: 1px solid var(--app-border);
          border-left: none;
          border-right: none;
          border-top: none;
          cursor: pointer;
          font-family: var(--app-font);
          text-align: left;
        }
        .log-head--static {
          cursor: default;
        }
        .log-step {
          font-size: 0.5625rem;
          font-weight: 600;
          font-variant-numeric: tabular-nums;
          color: var(--app-text-faint);
          min-width: 1rem;
        }
        .log-kind {
          font-size: 0.5rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          color: var(--app-text-faint);
          padding: 0.05rem 0.25rem;
          border: 1px solid var(--app-border);
          border-radius: var(--app-radius-pill);
          background: var(--app-surface);
        }
        .log-name {
          flex: 1;
          font-size: 0.6875rem;
          font-weight: 500;
          color: var(--app-text);
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .log-dur {
          font-size: 0.5625rem;
          color: var(--app-text-faint);
          font-variant-numeric: tabular-nums;
        }
        .log-dur--live {
          color: var(--app-text-muted);
          font-style: italic;
        }
        .log-meta {
          margin: 0;
          padding: 0.2rem 0.5rem 0;
          font-size: 0.5625rem;
          color: var(--app-text-faint);
        }
        .log-body {
          margin: 0;
          padding: 0.375rem 0.5rem;
          max-height: 6rem;
          overflow: auto;
          font-size: 0.5625rem;
          line-height: 1.45;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          color: #5a6478;
          white-space: pre-wrap;
          word-break: break-word;
        }
        .log--running .log-body {
          color: #3d4656;
        }
        .out-wrap {
          position: relative;
          flex: 1 1 6rem;
          min-height: 6rem;
          min-width: 0;
          display: flex;
          flex-direction: column;
        }
        .out-copy {
          position: absolute;
          top: 0.375rem;
          right: 0.375rem;
          z-index: 1;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 1.625rem;
          height: 1.625rem;
          padding: 0;
          border: 1px solid #3a4048;
          border-radius: var(--app-radius);
          background: rgba(15, 17, 20, 0.92);
          color: #c5cdd8;
          cursor: pointer;
        }
        .out-copy:hover {
          border-color: #5a6478;
          color: #e8edf4;
          background: #1a1d22;
        }
        .out {
          margin: 0;
          padding: 0.625rem;
          flex: 1;
          min-height: 6rem;
          overflow: auto;
          overscroll-behavior: contain;
          scrollbar-width: thin;
          scrollbar-color: #3a4048 transparent;
          font-size: 0.6875rem;
          line-height: 1.5;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          background: #0f1114;
          color: #e8edf4;
          border-radius: var(--app-radius);
          white-space: pre-wrap;
          word-break: break-word;
        }
        .out-wrap--copyable .out {
          padding-right: 2.25rem;
        }
        .out::-webkit-scrollbar {
          width: 6px;
        }
        .out::-webkit-scrollbar-thumb {
          background: #3a4048;
          border-radius: 999px;
        }
      `}</style>
    </aside>
  )
}
