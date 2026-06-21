"use client"

import { useMemo } from "react"
import type { AdminAgentWorker, SwarmGraph } from "@/data/api/server"
import { buildReferencedSwarmLookup, buildScraperUrlContextOptions } from "@/lib/swarm-graph-vars"
import { useSwarmEditor } from "../../SwarmEditorContext"
import type { ResearchPapersNodeData } from "./data"

type Props = {
  data: ResearchPapersNodeData
  onChange: (data: ResearchPapersNodeData) => void
  nodeId: string
  graph: SwarmGraph | null
  workerById: Record<string, AdminAgentWorker>
}

const STATIC_VALUE = "static"

function contextOptionValue(querySource: "runInput" | "upstream", queryPath: string) {
  return `${querySource}:${queryPath}`
}

function selectionValue(data: ResearchPapersNodeData): string {
  if (data.querySource === "static") return STATIC_VALUE
  return contextOptionValue(data.querySource, data.queryPath ?? "query")
}

function parseSelection(value: string): Partial<ResearchPapersNodeData> {
  if (value === STATIC_VALUE) return { querySource: "static" }
  const colon = value.indexOf(":")
  if (colon === -1) return { querySource: "runInput", queryPath: value }
  const querySource = value.slice(0, colon) === "upstream" ? "upstream" : "runInput"
  return { querySource, queryPath: value.slice(colon + 1) }
}

export default function ResearchPapersConfigForm({
  data,
  onChange,
  nodeId,
  graph,
  workerById,
}: Props) {
  const { pickerSwarms } = useSwarmEditor()
  const referencedSwarmById = useMemo(
    () => buildReferencedSwarmLookup(pickerSwarms),
    [pickerSwarms],
  )
  const contextOptions = useMemo(
    () => buildScraperUrlContextOptions(nodeId, graph, workerById, referencedSwarmById),
    [nodeId, graph, workerById, referencedSwarmById],
  )
  const runInputOptions = contextOptions.filter((option) => option.group === "runInput")
  const upstreamOptions = contextOptions.filter((option) => option.group === "upstream")
  const selectedValue = selectionValue(data)
  const hasContextOptions = contextOptions.length > 0
  const valueInList =
    data.querySource === "static" ||
    contextOptions.some(
      (option) =>
        option.urlSource === data.querySource && option.urlPath === (data.queryPath ?? "query"),
    )

  const patch = (partial: Partial<ResearchPapersNodeData>) => {
    onChange({ ...data, ...partial })
  }

  return (
    <div className="form">
      <label className="field">
        <span className="field-label">Label</span>
        <input
          className="field-control"
          type="text"
          placeholder="Optional"
          value={data.label ?? ""}
          onChange={(e) => patch({ label: e.target.value })}
        />
      </label>

      <label className="field field--stack">
        <span className="field-label">Query source</span>
        <select
          className="field-control field-control--mono"
          value={selectedValue}
          onChange={(e) => patch(parseSelection(e.target.value))}
        >
          {!valueInList && data.querySource !== "static" ? (
            <option value={selectedValue}>{selectedValue.replace(":", ".")}</option>
          ) : null}
          {runInputOptions.length > 0 ? (
            <optgroup label="Start input">
              {runInputOptions.map((option) => (
                <option
                  key={contextOptionValue(option.urlSource, option.urlPath)}
                  value={contextOptionValue(option.urlSource, option.urlPath)}
                >
                  {option.token}
                </option>
              ))}
            </optgroup>
          ) : null}
          {upstreamOptions.length > 0 ? (
            <optgroup label="Upstream">
              {upstreamOptions.map((option) => (
                <option
                  key={contextOptionValue(option.urlSource, option.urlPath)}
                  value={contextOptionValue(option.urlSource, option.urlPath)}
                >
                  {option.token}
                </option>
              ))}
            </optgroup>
          ) : null}
          <option value={STATIC_VALUE}>Fixed query</option>
        </select>
        {!hasContextOptions && data.querySource !== "static" ? (
          <span className="field-hint">
            Add input variables on Start or wire an upstream node to populate this list.
          </span>
        ) : null}
      </label>

      {data.querySource === "static" ? (
        <label className="field field--stack">
          <span className="field-label">Query</span>
          <input
            className="field-control"
            type="text"
            placeholder="diffusion image synthesis"
            value={data.query ?? ""}
            onChange={(e) => patch({ query: e.target.value })}
          />
        </label>
      ) : null}

      <label className="field field--stack">
        <span className="field-label">Max papers</span>
        <input
          className="field-control"
          type="number"
          min={1}
          max={50}
          value={data.limit ?? 10}
          onChange={(e) => patch({ limit: Number(e.target.value) || 10 })}
        />
      </label>

      <section className="outputs">
        <h3 className="section-title">Downstream output</h3>
        <p className="field-hint">
          Agents on the success branch receive <code>papers</code>, <code>query</code>,{" "}
          <code>paperCount</code>, and <code>status</code>. Use{" "}
          <code>{`{{papers}}`}</code> or <code>{`{{query}}`}</code> in prompts.
        </p>
      </section>

      <style jsx>{`
        .form {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .field {
          display: grid;
          grid-template-columns: 5.5rem 1fr;
          align-items: start;
          gap: 0.5rem;
          font-size: 0.75rem;
        }
        .field--stack {
          grid-template-columns: 1fr;
          gap: 0.35rem;
        }
        .field-label {
          color: var(--app-text-muted);
          padding-top: 0.35rem;
        }
        .field--stack .field-label {
          padding-top: 0;
        }
        .field-control {
          width: 100%;
          box-sizing: border-box;
          font-size: 0.75rem;
          padding: 0.4375rem 0.5rem;
          border: 1px solid var(--app-border);
          border-radius: var(--app-radius);
          background: var(--app-bg);
          color: var(--app-text);
          font-family: var(--app-font);
        }
        .field-control--mono {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 0.6875rem;
        }
        .field-control:focus {
          outline: none;
          border-color: var(--app-border-strong);
          box-shadow: var(--app-btn-focus-ring);
        }
        .field-hint {
          font-size: 0.625rem;
          color: var(--app-text-faint);
          line-height: 1.4;
        }
        .field-hint code {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 0.5625rem;
        }
        .outputs {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
          padding-top: 0.5rem;
          border-top: 1px solid var(--app-border);
        }
        .section-title {
          margin: 0;
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--app-text);
        }
      `}</style>
    </div>
  )
}
