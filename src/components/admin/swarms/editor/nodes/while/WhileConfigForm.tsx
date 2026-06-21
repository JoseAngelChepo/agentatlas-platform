"use client"

import { useMemo } from "react"
import InstructionsEditor from "@/components/admin/swarms/InstructionsEditor"
import type { AdminAgentWorker, SwarmGraph } from "@/data/api/server"
import {
  buildIfElseCodeContextVariables,
  buildIfElseConditionFieldOptions,
  buildReferencedSwarmLookup,
} from "@/lib/swarm-graph-vars"
import { useSwarmEditor } from "../../SwarmEditorContext"
import {
  buildIfElseCondition,
  parseIfElseCondition,
  shouldUseCodeIfElseCondition,
  type IfElseConditionOp,
} from "../ifelse/data"
import {
  DEFAULT_WHILE_MAX_ITERATIONS,
  type WhileNodeData,
} from "./data"

type Props = {
  data: WhileNodeData
  onChange: (data: WhileNodeData) => void
  nodeId: string
  graph: SwarmGraph | null
  workerById: Record<string, AdminAgentWorker>
}

const OP_LABELS: Record<IfElseConditionOp, string> = {
  truthy: "has a value",
  eq: "equals",
  neq: "does not equal",
}

function isWhileCodeMode(data: WhileNodeData): boolean {
  if (data.useCode === true) return true
  if (data.useCode === false) return false
  return shouldUseCodeIfElseCondition(data.condition)
}

/** While loop fields — mount inside {@link WhileConfigPanel}. */
export default function WhileConfigForm({
  data,
  onChange,
  nodeId,
  graph,
  workerById,
}: Props) {
  const codeMode = isWhileCodeMode(data)
  const parts = parseIfElseCondition(data.condition)
  const compareValue = parts.op === "eq" || parts.op === "neq"

  const { pickerSwarms } = useSwarmEditor()
  const referencedSwarmById = useMemo(
    () => buildReferencedSwarmLookup(pickerSwarms),
    [pickerSwarms],
  )
  const fieldOptions = useMemo(
    () => buildIfElseConditionFieldOptions(nodeId, graph, workerById, referencedSwarmById),
    [nodeId, graph, workerById, referencedSwarmById],
  )
  const codeContextVariables = useMemo(
    () => buildIfElseCodeContextVariables(nodeId, graph, workerById, referencedSwarmById),
    [nodeId, graph, workerById, referencedSwarmById],
  )

  const upstreamOptions = fieldOptions.filter((o) => o.group === "upstream")
  const runInputOptions = fieldOptions.filter((o) => o.group === "runInput")

  const patch = (next: Partial<WhileNodeData>) => {
    onChange({ ...data, ...next })
  }

  const updateSimpleCondition = (patchFields: Partial<ReturnType<typeof parseIfElseCondition>>) => {
    const next = { ...parseIfElseCondition(data.condition), ...patchFields }
    patch({
      useCode: false,
      condition: buildIfElseCondition(next),
    })
  }

  const maxIterations =
    typeof data.maxIterations === "number" && Number.isFinite(data.maxIterations)
      ? data.maxIterations
      : DEFAULT_WHILE_MAX_ITERATIONS

  return (
    <div className="form">
      <section className="section">
        <h3 className="section-title">Condition</h3>
        <p className="hint">
          Evaluated before each iteration. Connect the Loop port to the branch that should repeat;
          connect Done when the condition is false.
        </p>

        <div className="mode-toggle" role="group" aria-label="Condition mode">
          <button
            type="button"
            className={`mode-btn${!codeMode ? " mode-btn--on" : ""}`}
            onClick={() => patch({ useCode: false })}
          >
            Simple
          </button>
          <button
            type="button"
            className={`mode-btn${codeMode ? " mode-btn--on" : ""}`}
            onClick={() => patch({ useCode: true })}
          >
            Code
          </button>
        </div>

        {codeMode ? (
          <InstructionsEditor
            hideLabel
            mono
            rows={5}
            globalTokenFormat="bare"
            variables={codeContextVariables}
            value={data.condition}
            onChange={(condition) => patch({ useCode: true, condition })}
            placeholder={'e.g. attempts < 3 or runInput.companyMemory.stage == "growth"'}
            menuHint="Choose a field — inserts the variable name into your expression"
            globalMenuHint="Company and department fields — bare runInput paths for expressions."
          />
        ) : fieldOptions.length === 0 ? (
          <p className="hint">
            Connect an agent (or scraper) into this node to pick upstream fields, or switch to
            Code.
          </p>
        ) : (
          <>
            <label className="field">
              <span className="field-label">Variable</span>
              <select
                className="field-control"
                value={parts.field}
                onChange={(e) => updateSimpleCondition({ field: e.target.value })}
              >
                <option value="">Select…</option>
                {upstreamOptions.length > 0 ? (
                  <optgroup label="Upstream">
                    {upstreamOptions.map((option) => (
                      <option key={option.id} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
                {runInputOptions.length > 0 ? (
                  <optgroup label="Run input">
                    {runInputOptions.map((option) => (
                      <option key={option.id} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </select>
            </label>

            <label className="field">
              <span className="field-label">While</span>
              <select
                className="field-control"
                value={parts.op}
                onChange={(e) =>
                  updateSimpleCondition({ op: e.target.value as IfElseConditionOp })
                }
                disabled={!parts.field}
              >
                {(Object.entries(OP_LABELS) as [IfElseConditionOp, string][]).map(
                  ([op, label]) => (
                    <option key={op} value={op}>
                      {label}
                    </option>
                  ),
                )}
              </select>
            </label>

            <label className="field">
              <span className="field-label">Compare to</span>
              <input
                className="field-control"
                type="text"
                placeholder={compareValue ? "e.g. yes" : "Only used for equals / not equals"}
                value={parts.value}
                onChange={(e) => updateSimpleCondition({ value: e.target.value })}
                disabled={!parts.field || !compareValue}
              />
            </label>
          </>
        )}
      </section>

      <section className="section">
        <h3 className="section-title">Safety limit</h3>
        <label className="field">
          <span className="field-label">Max iterations</span>
          <input
            className="field-control"
            type="number"
            min={1}
            max={500}
            step={1}
            value={maxIterations}
            onChange={(e) => {
              const parsed = Number.parseInt(e.target.value, 10)
              patch({
                maxIterations: Number.isFinite(parsed) && parsed > 0 ? parsed : undefined,
              })
            }}
          />
        </label>
        <p className="hint">Stops the loop if the condition never becomes false.</p>
      </section>

      <style jsx>{`
        .form {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .section {
          display: flex;
          flex-direction: column;
          gap: 0.625rem;
          padding-bottom: 1rem;
          border-bottom: 1px solid var(--app-border);
        }
        .section:last-child {
          border-bottom: none;
          padding-bottom: 0;
        }
        .section-title {
          margin: 0;
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--app-text);
        }
        .mode-toggle {
          display: inline-flex;
          align-self: flex-start;
          padding: 0.125rem;
          border: 1px solid var(--app-border);
          border-radius: var(--app-radius-pill);
          background: var(--app-bg);
        }
        .mode-btn {
          border: none;
          background: transparent;
          color: var(--app-text-muted);
          font-size: 0.625rem;
          font-weight: 600;
          font-family: var(--app-font);
          padding: 0.25rem 0.55rem;
          border-radius: var(--app-radius-pill);
          cursor: pointer;
        }
        .mode-btn--on {
          background: var(--app-text);
          color: var(--app-bg);
        }
        .field {
          display: flex;
          flex-direction: column;
          gap: 0.3rem;
          font-size: 0.75rem;
        }
        .field-label {
          color: var(--app-text-muted);
          font-size: 0.6875rem;
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
        .field-control:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .field-control:focus {
          outline: none;
          border-color: var(--app-border-strong);
          box-shadow: var(--app-btn-focus-ring);
        }
        .hint {
          margin: 0;
          font-size: 0.6875rem;
          color: var(--app-text-muted);
          line-height: 1.45;
        }
      `}</style>
    </div>
  )
}
