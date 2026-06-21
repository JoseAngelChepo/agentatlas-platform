"use client"

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { TbChevronRight, TbX } from "react-icons/tb"
import createServices, {
  type AdminAgentWorker,
  type AdminUpdateAgentWorkerPayload,
  type InferenceProviderSetup,
  type InferenceSetup,
} from "@/data/api/server"
import { ApiServices } from "@/data/api/server/config"
import { toast } from "@/lib/toast"
import { useResizableSidePanelWidth } from "@/lib/resizable-side-panel"
import AgentToolsSection from "./AgentToolsSection"
import ResizablePanelEdge from "./ResizablePanelEdge"
import GrokToolsSection from "./GrokToolsSection"
import InstructionsEditor from "./InstructionsEditor"
import PromptMessagesEditor, {
  promptMessagesFromWorker,
  promptMessagesToPayload,
  type PromptMessageDraft,
} from "./PromptMessagesEditor"
import OutputSchemaEditor from "./OutputSchemaEditor"
import {
  agentToolsForSave,
  mergeAgentToolsCatalog,
  parseAgentToolIds,
  type AgentToolCatalogEntry,
  type AgentToolId,
} from "@/lib/agent-tools"
import {
  grokToolsToPayload,
  parseGrokWorkerTools,
  type GrokWorkerToolsConfig,
} from "@/lib/grok-worker-tools"
import {
  openAiToolsToPayload,
  parseOpenAiWorkerTools,
  type OpenAiWorkerToolsConfig,
} from "@/lib/openai-worker-tools"
import { parseSwarmToolIds } from "@/lib/swarm-tool-utils"
import {
  buildInstructionsContextVariables,
  buildIfElseConditionFieldOptions,
  buildScalableShardPromptVariables,
  buildReferencedSwarmLookup,
  extractSchemaPropertyKeys,
  listDirectUpstreamPredecessorsForNode,
  rootFieldFromScalableArrayExpression,
  SCALABLE_AGENT_OUTPUT_KEY,
} from "@/lib/swarm-graph-vars"
import { isReservedPromptRoot } from "@/lib/swarm-output-vars"
import {
  mergeGlobalContextVariables,
  formatAgentsAvailablesText,
  formatDepartmentsText,
  formatToolsAvailablesText,
} from "@/lib/swarm-global-context-vars"
import { validateWorkerOutputSchemaUnique } from "@/lib/swarm-output-vars"
import type { SwarmGraph } from "@/data/api/server"
import WorkerModelFields from "./WorkerModelFields"
import { useSwarmEditorDepartments } from "./useSwarmEditorDepartments"
import { useSwarmEditorHiredAgents } from "./useSwarmEditorHiredAgents"
import { useSwarmEditorTools } from "./useSwarmEditorTools"
import { useSwarmEditor } from "./editor/SwarmEditorContext"
import type { SwarmEditorNodeApi } from "./editor/SwarmEditorContext"
import type { AgentNodeData } from "./editor/nodes/agent/AgentCanvasNode"
import {
  CUSTOM_OPTION,
  buildProviderOptions,
  normalizeProviderId,
  readPersistedWorkerModelName,
  readPersistedWorkerProvider,
  resolveWorkerModelForSave,
  resolveWorkerModelSelection,
  warnIfMongooseModelShape,
} from "@/lib/inference-models"

type Props = {
  worker: AdminAgentWorker
  /** Canvas node id — upstream tokens are keyed by node, not worker name. */
  canvasNodeId: string
  graph: SwarmGraph | null
  workerById: Record<string, AdminAgentWorker>
  saving: boolean
  onClose: () => void
  onSave: (patch: AdminUpdateAgentWorkerPayload) => Promise<AdminAgentWorker | null>
  nodeApi?: SwarmEditorNodeApi | null
}

/** Keeps text inputs controlled when API fields are missing. */
function asInputString(value: string | undefined | null): string {
  return value ?? ""
}

function asNumberInputString(value: number | undefined | null): string {
  return value != null && Number.isFinite(value) ? String(value) : ""
}

function readParamNumber(params: Record<string, unknown> | undefined, key: string): string {
  const value = params?.[key]
  return typeof value === "number" && Number.isFinite(value) ? String(Math.floor(value)) : ""
}

function schemaToText(schema?: Record<string, unknown>): string {
  if (!schema || Object.keys(schema).length === 0) return ""
  return JSON.stringify(schema, null, 2)
}

function parseSchemaKeysQuiet(text: string): string[] {
  const trimmed = text.trim()
  if (!trimmed) return []
  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      return extractSchemaPropertyKeys(parsed as Record<string, unknown>)
    }
  } catch {
    /* ignore invalid draft JSON */
  }
  return []
}

function textToSchema(text: string): Record<string, unknown> | null {
  const trimmed = text.trim()
  if (!trimmed) return {}
  try {
    const parsed: unknown = JSON.parse(trimmed)
    if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    toast.error("Schema must be a JSON object")
    return null
  } catch {
    toast.error("Invalid JSON in schema field")
    return null
  }
}

type OutputFormat = "text" | "structured"

type ConfigTab = "instructions" | "tools"

function schemaHasOutputFields(schema?: Record<string, unknown>): boolean {
  if (!schema) return false
  const props = schema.properties
  return props != null && typeof props === "object" && Object.keys(props).length > 0
}

function detectOutputFormat(schema?: Record<string, unknown>): OutputFormat {
  return schemaHasOutputFields(schema) ? "structured" : "text"
}

function buildModelParams(input: {
  existingParams: Record<string, unknown> | undefined
  jsonMode: boolean
  maxTokens: string
  modelChanged: boolean
}): Record<string, unknown> {
  const params = { ...(input.existingParams ?? {}) }

  if (input.modelChanged) {
    delete params.model
  }

  if (input.jsonMode) params.jsonMode = true
  else delete params.jsonMode

  const parsedMaxTokens = Number.parseInt(input.maxTokens.trim(), 10)
  if (Number.isFinite(parsedMaxTokens) && parsedMaxTokens >= 1) {
    params.maxTokens = parsedMaxTokens
  } else {
    delete params.maxTokens
  }

  return params
}

function sortedIds<T extends string>(ids: T[]): T[] {
  return [...ids].sort()
}

function isToolsConfigDirty(
  worker: AdminAgentWorker,
  agentTools: AgentToolId[],
  openaiTools: OpenAiWorkerToolsConfig,
  swarmTools: string[],
): boolean {
  const savedAgentTools = parseAgentToolIds(worker.agentTools)
  const savedSwarmTools = parseSwarmToolIds(worker.swarmTools)

  if (
    JSON.stringify(sortedIds(agentTools)) !== JSON.stringify(sortedIds(savedAgentTools)) ||
    JSON.stringify(sortedIds(swarmTools)) !== JSON.stringify(sortedIds(savedSwarmTools))
  ) {
    return true
  }

  const draftOpenAi = openAiToolsToPayload(openaiTools, agentTools)
  const savedOpenAi = openAiToolsToPayload(
    parseOpenAiWorkerTools(worker.openaiTools as Record<string, unknown> | undefined),
    savedAgentTools,
  )

  return JSON.stringify(draftOpenAi) !== JSON.stringify(savedOpenAi)
}

/**
 * Backend setup (`GET /inference/setup`). Refetched when the worker panel opens
 * so new agent tools appear without a full page reload.
 */
function useInferenceSetup(active: boolean, refreshKey: unknown = 0): {
  providers: InferenceProviderSetup[] | null
  agentToolsCatalog: AgentToolCatalogEntry[]
  loading: boolean
} {
  const [setup, setSetup] = useState<InferenceSetup | null>(null)
  const [loading, setLoading] = useState(active)

  useEffect(() => {
    if (!active) return

    let cancelled = false
    const services = createServices(ApiServices)
    setLoading(true)

    services
      .getInferenceSetup()
      .then((next) => {
        if (!cancelled) setSetup(next)
      })
      .catch(() => {
        if (!cancelled) setSetup(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [active, refreshKey])

  const agentToolsCatalog = mergeAgentToolsCatalog(setup?.agentTools?.catalog ?? [])

  return {
    providers: setup?.providers ?? null,
    agentToolsCatalog,
    loading,
  }
}

export default function SwarmWorkerPanel({
  worker,
  canvasNodeId,
  graph,
  workerById,
  saving,
  onClose,
  onSave,
  nodeApi,
}: Props) {
  const [configTab, setConfigTab] = useState<ConfigTab>("instructions")
  const [outputFormat, setOutputFormat] = useState<OutputFormat>(() =>
    detectOutputFormat(worker.outputSchema),
  )
  const [name, setName] = useState(() => asInputString(worker.name))

  useEffect(() => {
    setName(asInputString(worker.name))
  }, [worker.id, worker.name, worker.updatedAt])

  useEffect(() => {
    setConfigTab("instructions")
  }, [worker.id])
  /** `null` = show the worker saved on the server; non-null = user edit in this session. */
  const [providerDraft, setProviderDraft] = useState<string | null>(null)
  const [modelDraft, setModelDraft] = useState<string | null>(null)
  const [systemPrompt, setSystemPrompt] = useState(() => asInputString(worker.systemPrompt))
  const [promptMessages, setPromptMessages] = useState<PromptMessageDraft[]>(() =>
    promptMessagesFromWorker(worker.promptMessages),
  )
  const [outputSchemaText, setOutputSchemaText] = useState(() => schemaToText(worker.outputSchema))
  const [jsonMode, setJsonMode] = useState(Boolean(worker.model?.params?.jsonMode))
  const [maxTokens, setMaxTokens] = useState(() =>
    readParamNumber(worker.model?.params, "maxTokens"),
  )
  const [maxRetries, setMaxRetries] = useState(() => asNumberInputString(worker.maxRetries))
  const [timeoutMs, setTimeoutMs] = useState(() => asNumberInputString(worker.timeoutMs))
  const agentNodeData = nodeApi?.getNodeData<AgentNodeData>(canvasNodeId)
  const [scalable, setScalable] = useState(() => Boolean(agentNodeData?.scalable))
  const [inputArrayExpression, setInputArrayExpression] = useState(
    () =>
      agentNodeData?.inputArrayExpression?.trim() ||
      agentNodeData?.inputArrayPath?.trim() ||
      "",
  )
  const [outputArrayKey, setOutputArrayKey] = useState(
    () => agentNodeData?.outputArrayKey?.trim() || SCALABLE_AGENT_OUTPUT_KEY,
  )

  useEffect(() => {
    const data = nodeApi?.getNodeData<AgentNodeData>(canvasNodeId)
    setScalable(Boolean(data?.scalable))
    setInputArrayExpression(
      data?.inputArrayExpression?.trim() || data?.inputArrayPath?.trim() || "",
    )
    setOutputArrayKey(data?.outputArrayKey?.trim() || SCALABLE_AGENT_OUTPUT_KEY)
  }, [canvasNodeId, nodeApi, graph?.updatedAt])

  const persistAgentNodeData = useCallback(
    (patch: Partial<AgentNodeData>) => {
      if (!nodeApi) return
      const current = nodeApi.getNodeData<AgentNodeData>(canvasNodeId)
      if (!current) return
      nodeApi.setNodeData(canvasNodeId, { ...current, ...patch })
    },
    [canvasNodeId, nodeApi],
  )
  const [openaiTools, setOpenaiTools] = useState<OpenAiWorkerToolsConfig>(() =>
    parseOpenAiWorkerTools(worker.openaiTools as Record<string, unknown> | undefined),
  )
  const [grokTools, setGrokTools] = useState<GrokWorkerToolsConfig>(() =>
    parseGrokWorkerTools(worker.grokTools as Record<string, unknown> | undefined),
  )
  const [agentTools, setAgentTools] = useState<AgentToolId[]>(() =>
    parseAgentToolIds(worker.agentTools),
  )
  const [swarmTools, setSwarmTools] = useState<string[]>(() =>
    parseSwarmToolIds(worker.swarmTools),
  )

  const { panelStyle, resizeActive, startResize } = useResizableSidePanelWidth()
  const { pickerSwarms, currentSwarmId } = useSwarmEditor()
  const referencedSwarmById = useMemo(
    () => buildReferencedSwarmLookup(pickerSwarms),
    [pickerSwarms],
  )

  const contextVariables = useMemo(() => {
    const base = buildInstructionsContextVariables(
      canvasNodeId,
      graph,
      workerById,
      referencedSwarmById,
    )
    if (!scalable) return base
    const predecessors = listDirectUpstreamPredecessorsForNode(
      canvasNodeId,
      graph,
      workerById,
      referencedSwarmById,
    )
    return [
      ...base,
      ...buildScalableShardPromptVariables(inputArrayExpression, predecessors),
    ]
  }, [
    canvasNodeId,
    graph,
    workerById,
    referencedSwarmById,
    scalable,
    inputArrayExpression,
  ])

  const arrayContextOptions = useMemo(
    () =>
      buildIfElseConditionFieldOptions(
        canvasNodeId,
        graph,
        workerById,
        referencedSwarmById,
      ),
    [canvasNodeId, graph, workerById, referencedSwarmById],
  )

  const upstreamArrayOptions = useMemo(
    () => arrayContextOptions.filter((option) => option.group === "upstream"),
    [arrayContextOptions],
  )

  const runInputArrayOptions = useMemo(
    () => arrayContextOptions.filter((option) => option.group === "runInput"),
    [arrayContextOptions],
  )

  const scalableItemHint = useMemo(() => {
    if (!scalable) return "{{runInput.item}}"
    const root = rootFieldFromScalableArrayExpression(inputArrayExpression)
    return root ? `{{${root}.item}}` : "{{runInput.item}}"
  }, [scalable, inputArrayExpression])

  const outputArrayKeyError = useMemo(() => {
    const key = outputArrayKey.trim()
    if (!scalable || !key) return null
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
      return "Use letters, numbers, and underscores; start with a letter or _."
    }
    if (isReservedPromptRoot(key) && key !== SCALABLE_AGENT_OUTPUT_KEY) {
      return `"${key}" is reserved. Pick another name.`
    }
    return null
  }, [scalable, outputArrayKey])

  const arrayExpressionInList = useMemo(
    () =>
      !inputArrayExpression ||
      arrayContextOptions.some((option) => option.value === inputArrayExpression),
    [arrayContextOptions, inputArrayExpression],
  )

  const { departments } = useSwarmEditorDepartments()
  const { hiredAgents } = useSwarmEditorHiredAgents()
  const { toolsAvailable } = useSwarmEditorTools()

  const globalVariables = useMemo(() => mergeGlobalContextVariables(), [])

  const globalReferencePreviewSections = useMemo(() => {
    const sections: Array<{ label: string; body: string }> = []
    if (departments.length > 0) {
      sections.push({
        label: "Departments list (text)",
        body: formatDepartmentsText(departments),
      })
    }
    sections.push({
      label: "Hired agents catalog (JSON text)",
      body: hiredAgents.length > 0 ? formatAgentsAvailablesText(hiredAgents) : "[]",
    })
    sections.push({
      label: "Connected tools catalog (JSON text)",
      body: formatToolsAvailablesText(toolsAvailable),
    })
    return sections
  }, [departments, hiredAgents, toolsAvailable])

  const globalMenuHint = useMemo(() => {
    return "When you run the swarm with a companyId, the API fills company memory, department lists, hired agents, and connected tools automatically. Pick a token to insert it into your instructions."
  }, [])

  const structuredVariables = useMemo(() => {
    if (outputFormat !== "structured") return []
    const keys = parseSchemaKeysQuiet(outputSchemaText)
    if (scalable) {
      return keys.map((key) => ({
        token: `{{${key}}}`,
        label: `Per-shard field · ${key} (inside outputs[])`,
      }))
    }
    return keys.map((key) => ({
      token: `{{${key}}}`,
      label: key,
    }))
  }, [outputFormat, outputSchemaText, scalable])

  const { providers: backendProviders, agentToolsCatalog, loading: providersLoading } =
    useInferenceSetup(true, configTab)

  const providerOptions = useMemo(
    () => buildProviderOptions(backendProviders),
    [backendProviders],
  )

  const persistedModelName = readPersistedWorkerModelName(worker.model)
  const persistedProvider =
    readPersistedWorkerProvider(worker.model) ||
    providerOptions[0]?.id ||
    "openai_direct"

  useEffect(() => {
    warnIfMongooseModelShape(worker.id, worker.model)
  }, [worker.id, worker.model])
  const provider = providerDraft ?? persistedProvider
  const modelName = modelDraft ?? persistedModelName

  const modelSelection = useMemo(
    () =>
      resolveWorkerModelSelection({
        provider,
        localModelName: modelName,
        persistedModelName,
        providerOptions,
      }),
    [provider, modelName, persistedModelName, providerOptions],
  )

  const { canonicalProvider, modelSelectValue, modelOptions } = modelSelection

  const savedAgentTools = useMemo(
    () => parseAgentToolIds(worker.agentTools),
    [worker.agentTools, worker.updatedAt],
  )

  const toolsConfigDirty = useMemo(
    () => isToolsConfigDirty(worker, agentTools, openaiTools, swarmTools),
    [worker, agentTools, openaiTools, swarmTools],
  )

  const serverModelKey = `${readPersistedWorkerProvider(worker.model)}:${persistedModelName}:${worker.updatedAt ?? ""}`

  useEffect(() => {
    setProviderDraft(null)
    setModelDraft(null)
  }, [serverModelKey, worker.id])

  useEffect(() => {
    setPromptMessages(promptMessagesFromWorker(worker.promptMessages))
  }, [worker.id, worker.updatedAt, worker.promptMessages])

  useEffect(() => {
    setAgentTools(parseAgentToolIds(worker.agentTools))
    setSwarmTools(parseSwarmToolIds(worker.swarmTools))
    setOpenaiTools(parseOpenAiWorkerTools(worker.openaiTools as Record<string, unknown> | undefined))
    setGrokTools(parseGrokWorkerTools(worker.grokTools as Record<string, unknown> | undefined))
  }, [worker.id, worker.updatedAt, worker.agentTools, worker.swarmTools, worker.openaiTools, worker.grokTools])

  const handleOutputFormatChange = (next: OutputFormat) => {
    setOutputFormat(next)
    if (next === "text") setOutputSchemaText("")
  }

  const handleSave = async () => {
    const { effectiveModelName } = modelSelection
    const resolvedModel = resolveWorkerModelForSave({
      provider,
      modelName:
        modelSelectValue !== CUSTOM_OPTION ? modelSelectValue : effectiveModelName,
      modelSelectValue,
      modelOptions,
      fallback: {
        provider: readPersistedWorkerProvider(worker.model),
        name: persistedModelName,
      },
    })

    if (!resolvedModel) {
      toast.error("Enter a model name")
      return
    }

    const outputSchema =
      outputFormat === "text" ? {} : textToSchema(outputSchemaText)
    if (outputSchema === null) return

    if (outputFormat === "structured") {
      const conflict = validateWorkerOutputSchemaUnique(
        worker.id,
        outputSchema,
        graph,
        workerById,
      )
      if (conflict) {
        toast.error(conflict)
        return
      }
    }

    const parsedMaxRetries = Number.parseInt(maxRetries, 10)
    const parsedTimeoutMs = Number.parseInt(timeoutMs, 10)
    if (!Number.isFinite(parsedMaxRetries) || parsedMaxRetries < 0) {
      toast.error("Enter a valid max retries value")
      return
    }
    if (!Number.isFinite(parsedTimeoutMs) || parsedTimeoutMs < 1) {
      toast.error("Enter a valid timeout")
      return
    }

    const modelChanged =
      normalizeProviderId(resolvedModel.provider) !==
        normalizeProviderId(readPersistedWorkerProvider(worker.model)) ||
      resolvedModel.name !== persistedModelName

    const params = buildModelParams({
      existingParams: worker.model?.params,
      jsonMode,
      maxTokens,
      modelChanged,
    })

    const updated = await onSave({
      name: name.trim(),
      model: { ...resolvedModel, params },
      systemPrompt,
      promptMessages: promptMessagesToPayload(promptMessages),
      outputSchema,
      maxRetries: parsedMaxRetries,
      timeoutMs: parsedTimeoutMs,
      openaiTools: openAiToolsToPayload(openaiTools, agentTools),
      grokTools: grokToolsToPayload(grokTools),
      agentTools: agentToolsForSave(agentTools, swarmTools),
      swarmTools,
    })

    if (!updated) return

    setProviderDraft(null)
    setModelDraft(null)
  }

  return (
    <aside
      className={`panel${resizeActive ? " panel--resizing" : ""}`}
      style={panelStyle}
      aria-label="Agent worker configuration"
    >
      <ResizablePanelEdge
        active={resizeActive}
        onMouseDown={startResize}
        ariaLabel="Resize configure agent panel"
      />

      <header className="head">
        <div className="head-text">
          <h2 className="title">Configure agent</h2>
          <input
            className="name-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Agent name"
            placeholder="Agent name"
          />
        </div>
        <button type="button" className="close" onClick={onClose} aria-label="Close panel">
          <TbX size={16} />
        </button>
      </header>

      <div
        className="config-tabs"
        role="tablist"
        aria-label="Configure agent sections"
      >
        <button
          type="button"
          role="tab"
          className={`config-tab${configTab === "instructions" ? " config-tab--active" : ""}`}
          aria-selected={configTab === "instructions"}
          onClick={() => setConfigTab("instructions")}
        >
          Instructions
        </button>
        <button
          type="button"
          role="tab"
          className={`config-tab${configTab === "tools" ? " config-tab--active" : ""}`}
          aria-selected={configTab === "tools"}
          onClick={() => setConfigTab("tools")}
        >
          Tools and model
        </button>
      </div>

      <div className="fields">
        {configTab === "instructions" ? (
          <>
            <section className="scale-section">
              <label className="check">
                <input
                  type="checkbox"
                  checked={scalable}
                  onChange={(e) => {
                    const next = e.target.checked
                    setScalable(next)
                    persistAgentNodeData({ scalable: next })
                  }}
                />
                <span>Scalable agent (map over array)</span>
              </label>
              <p className="hint">
                Runs this agent once per array element in parallel. Downstream nodes receive{" "}
                <code>{`${outputArrayKey.trim() || SCALABLE_AGENT_OUTPUT_KEY}: [ {…}, … ]`}</code>{" "}
                — one object per shard matching your output schema. Use{" "}
                <code>{scalableItemHint}</code> in instructions for the current element.
              </p>
              {scalable ? (
                <>
                  <label className="field">
                    <span>Output array name</span>
                    <input
                      className="field-control field-control--mono"
                      type="text"
                      placeholder={SCALABLE_AGENT_OUTPUT_KEY}
                      value={outputArrayKey}
                      onChange={(e) => {
                        const next = e.target.value
                        setOutputArrayKey(next)
                        const trimmed = next.trim()
                        persistAgentNodeData({
                          outputArrayKey:
                            trimmed && trimmed !== SCALABLE_AGENT_OUTPUT_KEY
                              ? trimmed
                              : undefined,
                        })
                      }}
                    />
                    {outputArrayKeyError ? (
                      <span className="hint hint--error">{outputArrayKeyError}</span>
                    ) : (
                      <span className="hint">
                        Name the array downstream nodes read (e.g.{" "}
                        <code>arquitecturas</code>, <code>summaries</code>). Default:{" "}
                        <code>{SCALABLE_AGENT_OUTPUT_KEY}</code>.
                      </span>
                    )}
                  </label>
                  <label className="field">
                    <span>Input array</span>
                    <select
                      className="field-control field-control--mono"
                      value={arrayExpressionInList ? inputArrayExpression : "__custom__"}
                      onChange={(e) => {
                        const next = e.target.value
                        if (next === "__custom__") {
                          setInputArrayExpression("")
                          persistAgentNodeData({
                            inputArrayExpression: undefined,
                            inputArrayPath: undefined,
                          })
                          return
                        }
                        setInputArrayExpression(next)
                        persistAgentNodeData({
                          inputArrayExpression: next || undefined,
                          inputArrayPath: undefined,
                        })
                      }}
                    >
                      <option value="">Select from context…</option>
                      {!arrayExpressionInList && inputArrayExpression ? (
                        <option value="__custom__">{inputArrayExpression}</option>
                      ) : null}
                      {upstreamArrayOptions.length > 0 ? (
                        <optgroup label="Upstream">
                          {upstreamArrayOptions.map((option) => (
                            <option key={option.id} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </optgroup>
                      ) : null}
                      {runInputArrayOptions.length > 0 ? (
                        <optgroup label="Run input">
                          {runInputArrayOptions.map((option) => (
                            <option key={option.id} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </optgroup>
                      ) : null}
                      <option value="__custom__">Custom expression…</option>
                    </select>
                  </label>
                  {!arrayExpressionInList || inputArrayExpression === "" ? (
                    <label className="field">
                      <span>Custom expression</span>
                      <input
                        className="field-control field-control--mono"
                        type="text"
                        placeholder="items or upstream.splitter.items"
                        value={inputArrayExpression}
                        onChange={(e) => {
                          const next = e.target.value
                          setInputArrayExpression(next)
                          persistAgentNodeData({
                            inputArrayExpression: next.trim() || undefined,
                            inputArrayPath: undefined,
                          })
                        }}
                      />
                      <span className="hint">
                        Same tokens as If/else context — pick an upstream output field that is an
                        array.
                      </span>
                    </label>
                  ) : null}
                  {upstreamArrayOptions.length === 0 && runInputArrayOptions.length === 0 ? (
                    <p className="hint">
                      Wire an upstream node first; its output schema fields will appear here.
                    </p>
                  ) : null}
                </>
              ) : null}
            </section>

            <InstructionsEditor
              variables={contextVariables}
              globalVariables={globalVariables}
              globalMenuHint={globalMenuHint}
              globalReferencePreviewSections={globalReferencePreviewSections}
              structuredVariables={structuredVariables}
              outputSchema={
                outputFormat === "structured"
                  ? {
                      editorKey: worker.id,
                      value: outputSchemaText,
                      onChange: setOutputSchemaText,
                      workerName: name,
                      openAiStructured: canonicalProvider === "openai_direct",
                      nonOpenAiHint:
                        canonicalProvider !== "openai_direct"
                          ? "Enable JSON mode under Advanced for non-OpenAI providers."
                          : undefined,
                    }
                  : undefined
              }
              value={systemPrompt}
              onChange={setSystemPrompt}
            />

            {canonicalProvider === "openai_direct" && agentTools.length === 0 ? (
              <p className="instructions-tools-hint">
                Platform tools (Research papers, web scrape, …) are enabled under{" "}
                <button
                  type="button"
                  className="instructions-tools-link"
                  onClick={() => setConfigTab("tools")}
                >
                  Tools and model
                </button>
                , not in Instructions. Mentioning a tool here does not connect it.
              </p>
            ) : null}

            <PromptMessagesEditor
              messages={promptMessages}
              onChange={setPromptMessages}
              variables={contextVariables}
              globalVariables={globalVariables}
              globalMenuHint={globalMenuHint}
              globalReferencePreviewSections={globalReferencePreviewSections}
              structuredVariables={structuredVariables}
            />

            <label className="setting">
              <span className="setting-label">Output format</span>
              <select
                className="setting-control"
                value={outputFormat}
                onChange={(e) => handleOutputFormatChange(e.target.value as OutputFormat)}
              >
                <option value="text">Text</option>
                <option value="structured">Structured (JSON)</option>
              </select>
            </label>

            {outputFormat === "structured" ? (
              <div className="structured-block">
                <OutputSchemaEditor
                  key={worker.id}
                  value={outputSchemaText}
                  onChange={setOutputSchemaText}
                  workerName={name}
                  openAiStructured={canonicalProvider === "openai_direct"}
                />
                {canonicalProvider !== "openai_direct" ? (
                  <p className="hint">Enable JSON mode under Advanced for non-OpenAI providers.</p>
                ) : null}
                {scalable ? (
                  <p className="hint">
                    Each shard returns one object from this schema. The node output is{" "}
                    <code>{`outputs: [ { your fields }, … ]`}</code>.
                  </p>
                ) : null}
              </div>
            ) : scalable ? (
              <p className="hint">
                Each shard returns <code>{`{ result: "…" }`}</code>; downstream receives{" "}
                <code>{`outputs: [ … ]`}</code>.
              </p>
            ) : null}
          </>
        ) : (
          <>
            <WorkerModelFields
              provider={provider}
              modelName={modelName}
              persistedModelName={persistedModelName}
              providerOptions={providerOptions}
              providersLoading={providersLoading}
              onProviderChange={setProviderDraft}
              onModelNameChange={setModelDraft}
            />

            {canonicalProvider === "openai_direct" ? (
              <AgentToolsSection
                openaiTools={openaiTools}
                agentTools={agentTools}
                savedAgentTools={savedAgentTools}
                catalog={agentToolsCatalog}
                toolsConfigDirty={toolsConfigDirty}
                onOpenaiToolsChange={setOpenaiTools}
                onAgentToolsChange={setAgentTools}
                swarmTools={swarmTools}
                pickerSwarms={pickerSwarms}
                currentSwarmId={currentSwarmId}
                onSwarmToolsChange={setSwarmTools}
                openAiDirect
              />
            ) : null}

            {canonicalProvider === "grok_direct" ? (
              <GrokToolsSection
                grokTools={grokTools}
                onGrokToolsChange={setGrokTools}
                grokDirect
              />
            ) : null}

            {canonicalProvider !== "openai_direct" &&
            canonicalProvider !== "grok_direct" ? (
              <p className="tools-provider-hint">
                Tools are available when the provider is OpenAI Direct or xAI Grok.
              </p>
            ) : null}

            <details className="more">
              <summary className="more-summary">
                <TbChevronRight className="more-summary-icon" size={13} aria-hidden />
                <span>Advanced</span>
              </summary>
              <div className="more-body">
                <label className="field">
                  <span>Max output tokens</span>
                  <input
                    type="number"
                    min={1}
                    placeholder="No limit"
                    value={maxTokens}
                    onChange={(e) => setMaxTokens(e.target.value)}
                  />
                  <span className="hint">Leave empty to omit from the API request (no cap).</span>
                </label>

                <label className="check">
                  <input
                    type="checkbox"
                    checked={jsonMode}
                    onChange={(e) => setJsonMode(e.target.checked)}
                  />
                  <span>JSON mode (non-OpenAI structured responses)</span>
                </label>

                <div className="row">
                  <label className="field">
                    <span>Max retries</span>
                    <input
                      type="number"
                      min={0}
                      value={maxRetries}
                      onChange={(e) => setMaxRetries(e.target.value)}
                    />
                  </label>
                  <label className="field">
                    <span>Timeout (ms)</span>
                    <input
                      type="number"
                      min={1}
                      value={timeoutMs}
                      onChange={(e) => setTimeoutMs(e.target.value)}
                    />
                  </label>
                </div>
              </div>
            </details>
          </>
        )}
      </div>

      <footer className="foot">
        {toolsConfigDirty ? (
          <p className="foot-hint">Unsaved tool changes — click Save before running the swarm.</p>
        ) : null}
        <button type="button" className="save" disabled={saving} onClick={() => void handleSave()}>
          {saving ? "Saving…" : "Save changes"}
        </button>
      </footer>

      <style jsx>{`
        .panel {
          position: relative;
          flex-shrink: 0;
          border-left: 1px solid var(--app-border);
          background: var(--app-surface);
          display: flex;
          flex-direction: column;
          height: 100%;
          max-height: 100%;
          min-height: 0;
          overflow: hidden;
        }
        .panel--resizing {
          transition: none;
        }
        .head {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 0.75rem;
          padding: 1rem 1rem 0.75rem;
          border-bottom: 1px solid var(--app-border);
          flex-shrink: 0;
        }
        .head-text {
          min-width: 0;
          flex: 1;
        }
        .title {
          margin: 0;
          font-size: 0.875rem;
          font-weight: 500;
          color: var(--app-text);
        }
        .name-input {
          display: block;
          width: 100%;
          margin: 0.25rem 0 0;
          padding: 0.2rem 0.35rem;
          margin-left: -0.35rem;
          font-size: 0.6875rem;
          font-family: var(--app-font);
          color: var(--app-text-muted);
          background: transparent;
          border: 1px solid transparent;
          border-radius: calc(var(--app-radius) - 2px);
        }
        .name-input:hover {
          color: var(--app-text);
        }
        .name-input:focus {
          outline: none;
          color: var(--app-text);
          background: var(--app-bg);
          border-color: var(--app-border);
          box-shadow: var(--app-btn-focus-ring);
        }
        .name-input::placeholder {
          color: var(--app-text-faint);
        }
        .close {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 1.75rem;
          height: 1.75rem;
          border: 1px solid var(--app-border);
          border-radius: var(--app-radius);
          background: var(--app-surface);
          color: var(--app-text-muted);
          cursor: pointer;
        }
        .close:hover {
          color: var(--app-text);
          border-color: var(--app-border-strong);
        }
        .config-tabs {
          display: flex;
          gap: 0.125rem;
          padding: 0.5rem 1rem 0;
          flex-shrink: 0;
        }
        .config-tab {
          flex: 1;
          padding: 0.375rem 0.5rem;
          font-size: 0.6875rem;
          font-weight: 500;
          font-family: var(--app-font);
          border: 1px solid var(--app-border);
          border-radius: var(--app-radius);
          background: var(--app-surface-muted);
          color: var(--app-text-muted);
          cursor: pointer;
        }
        .config-tab--active {
          background: var(--app-bg);
          color: var(--app-text);
          border-color: var(--app-border-strong);
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.04);
        }
        .fields {
          flex: 1;
          overflow-y: auto;
          padding: 0.75rem 1rem;
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          min-height: 0;
        }
        .setting {
          display: grid;
          grid-template-columns: 5.5rem 1fr;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.75rem;
        }
        .setting--indent {
          grid-template-columns: 5.5rem 1fr;
          padding-left: 0;
        }
        .setting-label {
          display: inline-flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 0.25rem;
          color: var(--app-text-muted);
          font-size: 0.75rem;
        }
        .setting-control {
          width: 100%;
          font-size: 0.75rem;
          padding: 0.4375rem 0.5rem;
          border: 1px solid var(--app-border);
          border-radius: var(--app-radius);
          background: var(--app-bg);
          color: var(--app-text);
          font-family: var(--app-font);
        }
        .setting-control:focus {
          outline: none;
          border-color: var(--app-border-strong);
          box-shadow: var(--app-btn-focus-ring);
        }
        .setting select.setting-control {
          appearance: none;
          background-image: linear-gradient(
              45deg,
              transparent 50%,
              var(--app-text-muted) 50%
            ),
            linear-gradient(135deg, var(--app-text-muted) 50%, transparent 50%);
          background-position:
            calc(100% - 14px) 50%,
            calc(100% - 9px) 50%;
          background-size:
            5px 5px,
            5px 5px;
          background-repeat: no-repeat;
          padding-right: 1.75rem;
          cursor: pointer;
        }
        .instructions-tools-hint {
          margin: 0;
          padding: 0.55rem 0.65rem;
          font-size: 0.6875rem;
          line-height: 1.45;
          color: var(--app-text-muted);
          border: 1px dashed var(--app-border);
          border-radius: var(--app-radius);
          background: var(--app-surface-muted);
        }
        .instructions-tools-link {
          padding: 0;
          border: none;
          background: none;
          color: var(--app-text);
          font: inherit;
          font-weight: 600;
          text-decoration: underline;
          cursor: pointer;
        }
        .structured-block {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }
        .tools-provider-hint {
          margin: 0;
          font-size: 0.625rem;
          color: var(--app-text-faint);
          line-height: 1.4;
        }
        .more {
          border-top: 1px solid var(--app-border);
          padding-top: 0.5rem;
        }
        .more-summary {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 0.75rem;
          font-weight: 500;
          color: var(--app-text-muted);
          cursor: pointer;
          list-style: none;
          user-select: none;
        }
        .more-summary::-webkit-details-marker {
          display: none;
        }
        .more-summary-icon {
          flex-shrink: 0;
          transition: transform 0.12s ease;
        }
        .more[open] .more-summary {
          color: var(--app-text);
          margin-bottom: 0.625rem;
        }
        .more[open] .more-summary-icon {
          transform: rotate(90deg);
        }
        .more-body {
          display: flex;
          flex-direction: column;
          gap: 0.625rem;
        }
        .row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.5rem;
        }
        .field {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
          font-size: 0.6875rem;
          color: var(--app-text-muted);
        }
        .field > span {
          display: inline-flex;
          align-items: center;
          gap: 0.375rem;
        }
        .field--full {
          grid-column: 1 / -1;
        }
        .field input,
        .field textarea,
        .field select {
          font-size: 0.75rem;
          padding: 0.4375rem 0.5rem;
          border: 1px solid var(--app-border);
          border-radius: var(--app-radius);
          background: var(--app-bg);
          color: var(--app-text);
          font-family: var(--app-font);
        }
        .field select {
          appearance: none;
          background-image: linear-gradient(
              45deg,
              transparent 50%,
              var(--app-text-muted) 50%
            ),
            linear-gradient(135deg, var(--app-text-muted) 50%, transparent 50%);
          background-position:
            calc(100% - 14px) 50%,
            calc(100% - 9px) 50%;
          background-size:
            5px 5px,
            5px 5px;
          background-repeat: no-repeat;
          padding-right: 1.75rem;
          cursor: pointer;
        }
        .field .custom-input {
          margin-top: 0.25rem;
        }
        .field textarea {
          resize: vertical;
          min-height: 6rem;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 0.6875rem;
          line-height: 1.45;
        }
        .field textarea.schema {
          min-height: 4rem;
        }
        .field .hint,
        .hint {
          font-size: 0.625rem;
          color: var(--app-text-faint);
          line-height: 1.4;
        }
        .field input:focus,
        .field textarea:focus,
        .field select:focus {
          outline: none;
          border-color: var(--app-border-strong);
          box-shadow: var(--app-btn-focus-ring);
        }
        .scale-section {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          padding: 0.75rem;
          border: 1px solid var(--app-border);
          border-radius: 0.5rem;
          background: color-mix(in srgb, var(--app-text) 2%, var(--app-surface));
        }
        .scale-section .hint {
          margin: 0;
          font-size: 0.6875rem;
          line-height: 1.45;
          color: var(--app-text-faint);
        }
        .scale-section .hint--error {
          color: var(--app-danger, #c0392b);
        }
        .scale-section code {
          font-size: 0.625rem;
        }
        .check {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.75rem;
          color: var(--app-text-muted);
          cursor: pointer;
        }
        .foot {
          padding: 0.75rem 1rem 1rem;
          border-top: 1px solid var(--app-border);
          flex-shrink: 0;
        }
        .foot-hint {
          margin: 0 0 0.5rem;
          font-size: 0.6875rem;
          line-height: 1.4;
          color: var(--app-text-muted);
        }
        .save {
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
        }
        .save:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
      `}</style>
    </aside>
  )
}
