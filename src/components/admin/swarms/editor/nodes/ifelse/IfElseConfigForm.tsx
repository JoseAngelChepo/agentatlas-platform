"use client"

import { useMemo } from "react"
import { TbPlus, TbTrash } from "react-icons/tb"
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
  createIfElseCase,
  isIfElseCaseCodeMode,
  normalizeIfElseCases,
  parseIfElseCondition,
  type IfElseCase,
  type IfElseConditionOp,
  type IfElseNodeData,
} from "./data"

type Props = {
  data: IfElseNodeData
  onChange: (data: IfElseNodeData) => void
  onRemoveCase?: (caseId: string) => void
  nodeId: string
  graph: SwarmGraph | null
  workerById: Record<string, AdminAgentWorker>
}

const OP_LABELS: Record<IfElseConditionOp, string> = {
  truthy: "has a value",
  eq: "equals",
  neq: "does not equal",
}

/** If/else fields only — mount inside {@link IfElseConfigPanel}. */
export default function IfElseConfigForm({
  data,
  onChange,
  onRemoveCase,
  nodeId,
  graph,
  workerById,
}: Props) {
  const cases = normalizeIfElseCases(data.cases)
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

  const patchCase = (caseId: string, patch: Partial<IfElseCase>) => {
    onChange({
      cases: cases.map((c) => (c.id === caseId ? { ...c, ...patch, useCustom: undefined } : c)),
    })
  }

  const updateSimpleCondition = (
    caseRow: IfElseCase,
    patch: Partial<ReturnType<typeof parseIfElseCondition>>,
  ) => {
    const next = { ...parseIfElseCondition(caseRow.condition), ...patch }
    patchCase(caseRow.id, {
      useCode: false,
      condition: buildIfElseCondition(next),
    })
  }

  const addCase = () => {
    onChange({ cases: [...cases, createIfElseCase()] })
  }

  const removeCase = (caseId: string) => {
    if (cases.length <= 1) return
    onRemoveCase?.(caseId)
    onChange({ cases: cases.filter((c) => c.id !== caseId) })
  }

  return (
    <div className="form">
      {cases.map((c, index) => {
        const codeMode = isIfElseCaseCodeMode(c)
        const parts = parseIfElseCondition(c.condition)
        const compareValue = parts.op === "eq" || parts.op === "neq"

        return (
          <section className="case" key={c.id}>
            <div className="case-head">
              <h3 className="case-title">{index === 0 ? "If" : "Else if"}</h3>
              {cases.length > 1 ? (
                <button
                  type="button"
                  className="case-remove"
                  onClick={() => removeCase(c.id)}
                  aria-label="Remove condition"
                >
                  <TbTrash size={14} />
                </button>
              ) : null}
            </div>

            <div className="mode-toggle" role="group" aria-label="Condition mode">
              <button
                type="button"
                className={`mode-btn${!codeMode ? " mode-btn--on" : ""}`}
                onClick={() => patchCase(c.id, { useCode: false })}
              >
                Simple
              </button>
              <button
                type="button"
                className={`mode-btn${codeMode ? " mode-btn--on" : ""}`}
                onClick={() => patchCase(c.id, { useCode: true })}
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
                value={c.condition}
                onChange={(condition) => patchCase(c.id, { useCode: true, condition })}
                placeholder={'e.g. summary == "yes" or runInput.companyMemory.stage == "growth"'}
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
                  <span className="field-label">Branch label</span>
                  <input
                    className="field-control"
                    type="text"
                    placeholder={index === 0 ? "If (default)" : "Else if (default)"}
                    value={c.name}
                    onChange={(e) => patchCase(c.id, { name: e.target.value })}
                  />
                </label>

                <label className="field">
                  <span className="field-label">Variable</span>
                  <select
                    className="field-control"
                    value={parts.field}
                    onChange={(e) => updateSimpleCondition(c, { field: e.target.value })}
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
                  <span className="field-label">When</span>
                  <select
                    className="field-control"
                    value={parts.op}
                    onChange={(e) =>
                      updateSimpleCondition(c, { op: e.target.value as IfElseConditionOp })
                    }
                    disabled={!parts.field}
                  >
                    {(
                      Object.entries(OP_LABELS) as [IfElseConditionOp, string][]
                    ).map(([op, label]) => (
                      <option key={op} value={op}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span className="field-label">Compare to</span>
                  <input
                    className="field-control"
                    type="text"
                    placeholder={compareValue ? "e.g. yes" : "Only used for equals / not equals"}
                    value={parts.value}
                    onChange={(e) => updateSimpleCondition(c, { value: e.target.value })}
                    disabled={!parts.field || !compareValue}
                  />
                </label>
              </>
            )}
          </section>
        )
      })}

      <button type="button" className="add" onClick={addCase}>
        <TbPlus size={14} aria-hidden />
        <span>Add else if</span>
      </button>

      <section className="else-block">
        <h3 className="case-title">Else</h3>
        <p className="else-hint">
          Runs when no condition above matches. Connect the bottom output on the node.
        </p>
      </section>

      <style jsx>{`
        .form {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }
        .case {
          display: flex;
          flex-direction: column;
          gap: 0.625rem;
          padding-bottom: 1rem;
          border-bottom: 1px solid var(--app-border);
        }
        .case-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
        }
        .case-title {
          margin: 0;
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--app-text);
        }
        .case-remove {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0.25rem;
          background: transparent;
          border: none;
          color: var(--app-text-faint);
          cursor: pointer;
          border-radius: var(--app-radius);
          transition:
            color 0.15s ease,
            background 0.15s ease;
        }
        .case-remove:hover {
          color: #b91c1c;
          background: color-mix(in srgb, #b91c1c 8%, transparent);
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
        .hint,
        .else-hint {
          margin: 0;
          font-size: 0.6875rem;
          color: var(--app-text-muted);
          line-height: 1.45;
        }
        .add {
          align-self: flex-start;
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.35rem 0.65rem;
          font-size: 0.75rem;
          font-weight: 500;
          font-family: var(--app-font);
          color: var(--app-text);
          background: var(--app-surface);
          border: 1px solid var(--app-border);
          border-radius: var(--app-radius-pill);
          cursor: pointer;
          transition:
            background 0.15s ease,
            border-color 0.15s ease;
        }
        .add:hover {
          background: var(--app-surface-muted);
          border-color: var(--app-border-strong);
        }
        .else-block {
          display: flex;
          flex-direction: column;
          gap: 0.35rem;
        }
      `}</style>
    </div>
  )
}
