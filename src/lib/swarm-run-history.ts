import type { AdminAgentWorker } from "@/data/api/server"
import type {
  AgentRun,
  InferenceRequestPayload,
  SwarmRun,
  WorkerInferenceMessage,
} from "@/data/api/server/swarms"
import {
  formatSubSwarmToolLogBody,
  isAgentToolSubSwarmRun,
  subSwarmToolLogMeta,
} from "@/lib/swarm-tool-invocations"

export type HistoricalSwarmLog = {
  logId: string
  kind: "start" | "scraper" | "research_papers" | "swarm" | "swarm_tool" | "ifelse" | "while" | "user_approval" | "end" | "worker"
  name: string
  step: number
  status: "running" | "done"
  streamText: string
  meta?: string
  model?: string
  latencyMs?: number
  inference?: AgentRun["inference"]
  messages?: AgentRun["messages"]
  contextInput?: InferenceRequestPayload
}

function formatJson(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function formatWorkerOutput(output: Record<string, unknown> | null): string {
  if (output == null) return "(no output)"
  if (typeof output.result === "string") return output.result
  return formatJson(output)
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

export function formatEndLogBody(output: Record<string, unknown>): string {
  const payload =
    output.output && typeof output.output === "object" && !Array.isArray(output.output)
      ? (output.output as Record<string, unknown>)
      : output
  return formatJson(payload)
}

function readWorkerMeta(
  inference: AgentRun["inference"] | undefined,
  worker?: AdminAgentWorker,
): { model?: string; meta?: string } {
  const response = inference?.response
  const provider =
    response && typeof response.provider === "string" ? response.provider : undefined
  const model =
    (response && typeof response.model === "string" ? response.model : undefined) ??
    worker?.model?.name
  if (!provider && !model) return { model }
  return {
    model,
    meta: [provider, model].filter(Boolean).join(" · "),
  }
}

export function formatSwarmRunHistoryLabel(run: SwarmRun): string {
  const when = run.createdAt ? new Date(run.createdAt).toLocaleString() : "Unknown time"
  const duration =
    run.durationMs != null ? `${(run.durationMs / 1000).toFixed(1)}s` : "—"
  const inputPreview = summarizeRunInput(run.input)
  return `${when} · ${run.status} · ${duration}${inputPreview ? ` · ${inputPreview}` : ""}`
}

export function summarizeRunInput(input: Record<string, unknown>): string {
  const parts = Object.entries(input)
    .map(([key, value]) => {
      if (value == null) return ""
      const text = typeof value === "string" ? value : formatJson(value)
      const flat = text.replace(/\s+/g, " ").trim()
      if (!flat) return ""
      const preview = flat.length > 36 ? `${flat.slice(0, 36)}…` : flat
      return `${key}: ${preview}`
    })
    .filter(Boolean)
  return parts.slice(0, 2).join(", ")
}

export function runInputToFormValues(
  input: Record<string, unknown>,
  inputKeys: string[],
): Record<string, string> {
  const next: Record<string, string> = {}
  for (const key of inputKeys) {
    const value = input[key]
    if (value == null) {
      next[key] = ""
      continue
    }
    next[key] = typeof value === "string" ? value : formatJson(value)
  }
  return next
}

export function buildHistoricalSwarmLogs(
  swarmRun: SwarmRun,
  agentRuns: AgentRun[],
  workerById: Record<string, AdminAgentWorker>,
  options?: {
    childSubSwarmRuns?: SwarmRun[]
    swarmNameById?: Record<string, string>
  },
): HistoricalSwarmLog[] {
  const logs: HistoricalSwarmLog[] = []
  let step = 0

  step += 1
  logs.push({
    logId: "start",
    kind: "start",
    name: "Start",
    step,
    status: "done",
    latencyMs: 0,
    streamText: formatJson(swarmRun.input),
  })

  const seenScrapers = new Set<string>()
  const seenResearchPapers = new Set<string>()
  for (const agentRun of agentRuns) {
    const upstream = agentRun.input?.upstream
    if (!Array.isArray(upstream)) continue

    const upstreamMeta = Array.isArray(agentRun.input?.upstreamMeta)
      ? (agentRun.input.upstreamMeta as Array<Record<string, unknown>>)
      : []

    for (const item of upstream) {
      if (!item || typeof item !== "object") continue
      const scraper = item as Record<string, unknown>
      if (scraper.kind !== "scraper") continue

      const key = String(scraper.scrapeRequestId ?? scraper.url ?? logs.length)
      if (seenScrapers.has(key)) continue
      seenScrapers.add(key)

      const metaEntry = upstreamMeta.find((entry) => entry.kind === "scraper")
      const scraperName =
        typeof metaEntry?.workerName === "string" && metaEntry.workerName.trim()
          ? metaEntry.workerName.trim()
          : "Scraper"

      step += 1
      logs.push({
        logId: `scraper-${key}`,
        kind: "scraper",
        name: scraperName,
        step,
        status: "done",
        latencyMs: typeof scraper.latencyMs === "number" ? scraper.latencyMs : undefined,
        streamText: formatScraperLogBody(scraper),
        meta:
          typeof scraper.status === "string"
            ? `branch · ${String(scraper.branchHandle ?? "—")}`
            : undefined,
      })
    }

    for (const item of upstream) {
      if (!item || typeof item !== "object") continue
      const research = item as Record<string, unknown>
      if (research.kind !== "research_papers") continue

      const key = String(research.query ?? logs.length)
      if (seenResearchPapers.has(key)) continue
      seenResearchPapers.add(key)

      const metaEntry = upstreamMeta.find((entry) => entry.kind === "research_papers")
      const nodeName =
        typeof metaEntry?.workerName === "string" && metaEntry.workerName.trim()
          ? metaEntry.workerName.trim()
          : "Research papers"

      step += 1
      logs.push({
        logId: `research_papers-${key}`,
        kind: "research_papers",
        name: nodeName,
        step,
        status: "done",
        latencyMs: typeof research.latencyMs === "number" ? research.latencyMs : undefined,
        streamText: formatResearchPapersLogBody(research),
        meta:
          typeof research.status === "string"
            ? `branch · ${String(research.branchHandle ?? "—")}`
            : undefined,
      })
    }
  }

  for (const agentRun of agentRuns) {
    const worker = workerById[agentRun.workerId]
    const { model, meta } = readWorkerMeta(agentRun.inference, worker)
    step += 1
    logs.push({
      logId: agentRun.id,
      kind: "worker",
      name: worker?.name ?? agentRun.workerId.slice(-6),
      step,
      status: "done",
      streamText: formatWorkerOutput(agentRun.output),
      latencyMs: agentRun.durationMs,
      inference: agentRun.inference,
      messages: agentRun.messages,
      contextInput: agentRun.input as InferenceRequestPayload,
      model,
      meta,
    })
  }

  for (const childRun of options?.childSubSwarmRuns ?? []) {
    if (!isAgentToolSubSwarmRun(childRun)) continue

    const swarmLabel =
      options?.swarmNameById?.[childRun.swarmId] ??
      `Sub-swarm · ${childRun.swarmId.slice(-6)}`

    step += 1
    logs.push({
      logId: `swarm-tool-${childRun.id}`,
      kind: "swarm_tool",
      name: swarmLabel,
      step,
      status: childRun.status === "running" ? "running" : "done",
      streamText: formatSubSwarmToolLogBody(childRun),
      latencyMs: childRun.durationMs ?? undefined,
      meta: subSwarmToolLogMeta(childRun),
    })
  }

  return logs
}

/** Appends agent-tool sub-swarm steps to an in-flight log list (live SSE). */
export function appendSubSwarmToolLogs(
  logs: HistoricalSwarmLog[],
  childRuns: SwarmRun[],
  swarmNameById?: Record<string, string>,
): HistoricalSwarmLog[] {
  const existing = new Set(logs.map((log) => log.logId))
  let step = logs.reduce((max, log) => Math.max(max, log.step), 0)
  const next = [...logs]

  for (const childRun of childRuns) {
    if (!isAgentToolSubSwarmRun(childRun)) continue

    const logId = `swarm-tool-${childRun.id}`
    if (existing.has(logId)) continue

    const swarmLabel =
      swarmNameById?.[childRun.swarmId] ??
      `Sub-swarm · ${childRun.swarmId.slice(-6)}`

    step += 1
    next.push({
      logId,
      kind: "swarm_tool",
      name: swarmLabel,
      step,
      status: childRun.status === "running" ? "running" : "done",
      streamText: formatSubSwarmToolLogBody(childRun),
      latencyMs: childRun.durationMs ?? undefined,
      meta: subSwarmToolLogMeta(childRun),
    })
    existing.add(logId)
  }

  return next
}

export function formatHistoricalOutput(output: SwarmRun["output"]): string {
  if (output == null) return ""
  if (typeof output === "string") return output
  if (typeof output.result === "string") return output.result
  return formatJson(output)
}

function formatMessagesForCopy(messages?: WorkerInferenceMessage[]): string | null {
  if (!messages?.length) return null
  return messages.map((message) => `[${message.role}]\n${message.content}`).join("\n\n")
}

function formatWorkerLogForCopy(log: HistoricalSwarmLog): string {
  let heading = `## Step ${log.step} · ${log.name}`
  if (log.latencyMs != null) {
    heading += ` (${log.latencyMs} ms)`
  }

  const lines = [heading]
  if (log.meta?.trim()) {
    lines.push(log.meta.trim())
  }

  lines.push("", "### Output", log.streamText.trim() || "(no output)")

  const messages = formatMessagesForCopy(log.messages)
  if (messages) {
    lines.push("", "### Messages", messages)
  }

  if (log.contextInput) {
    const context = { ...log.contextInput }
    if (
      Array.isArray(context.connectedAgentTools) &&
      context.connectedAgentTools.length === 0
    ) {
      lines.push(
        "",
        "### Tools",
        "No platform tools were connected for this run (`connectedAgentTools: []`). Enable tools under Configure agent → Tools and model → Save changes — Instructions text alone does not wire tools.",
      )
    }
    lines.push("", "### Context", formatJson(context))
  }

  return lines.join("\n")
}

function formatSwarmToolLogForCopy(log: HistoricalSwarmLog): string {
  let heading = `## Step ${log.step} · ${log.name} (sub-swarm tool)`
  if (log.latencyMs != null) {
    heading += ` (${log.latencyMs} ms)`
  }

  const lines = [heading]
  if (log.meta?.trim()) {
    lines.push(log.meta.trim())
  }

  lines.push("", "### Result", log.streamText.trim() || "(no output)")
  return lines.join("\n")
}

function formatLogForCopy(log: HistoricalSwarmLog): string {
  if (log.kind === "swarm_tool") return formatSwarmToolLogForCopy(log)
  return formatWorkerLogForCopy(log)
}

/** Plain-text export of worker + sub-swarm tool steps in a swarm run (clipboard). */
export function formatSwarmWorkerLogsForCopy(logs: HistoricalSwarmLog[]): string {
  return [...logs]
    .filter((log) => log.kind === "worker" || log.kind === "swarm_tool")
    .sort((a, b) => a.step - b.step)
    .map(formatLogForCopy)
    .join("\n\n")
}
