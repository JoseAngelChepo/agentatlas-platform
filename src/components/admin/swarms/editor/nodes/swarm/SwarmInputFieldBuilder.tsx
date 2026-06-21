"use client"

import { useMemo } from "react"
import type { EndOutputFieldOption } from "@/lib/swarm-graph-vars"
import {
  createSwarmInputField,
  type SwarmInputField,
  type SwarmInputFieldSource,
} from "./data"

type Props = {
  fields: SwarmInputField[]
  onChange: (fields: SwarmInputField[]) => void
  childInputKeys: string[]
  variableOptions: EndOutputFieldOption[]
}

const AUTO_VALUE = ""
const STATIC_VALUE = "__static__"
const SHARED_VALUE = "__shared__"

function encodeMapping(field: SwarmInputField | undefined): string {
  if (!field) return AUTO_VALUE
  switch (field.source) {
    case "static":
      return STATIC_VALUE
    case "shared":
      return SHARED_VALUE
    case "runInput":
      return `runInput:${field.valuePath ?? ""}`
    case "upstream":
    case "field":
      return `upstream:${field.valuePath ?? ""}`
    default:
      return AUTO_VALUE
  }
}

function decodeMapping(
  encoded: string,
  childKey: string,
  existing?: SwarmInputField,
): SwarmInputField | null {
  if (!encoded || encoded === AUTO_VALUE) return null

  const id = existing?.id ?? createSwarmInputField({ key: childKey }).id

  if (encoded === STATIC_VALUE) {
    return {
      id,
      key: childKey,
      source: "static",
      staticValue: existing?.staticValue ?? "",
    }
  }

  if (encoded === SHARED_VALUE) {
    return {
      id,
      key: childKey,
      source: "shared",
      valuePath: existing?.valuePath ?? "",
    }
  }

  if (encoded.startsWith("runInput:")) {
    return {
      id,
      key: childKey,
      source: "runInput",
      valuePath: encoded.slice("runInput:".length),
    }
  }

  if (encoded.startsWith("upstream:")) {
    return {
      id,
      key: childKey,
      source: "upstream",
      valuePath: encoded.slice("upstream:".length),
    }
  }

  return null
}

function patchFieldDetail(
  fields: SwarmInputField[],
  childKey: string,
  partial: Partial<SwarmInputField>,
): SwarmInputField[] {
  const index = fields.findIndex((row) => row.key.trim() === childKey)
  if (index === -1) return fields
  const current = fields[index]
  if (!current) return fields
  const next = [...fields]
  next[index] = { ...current, ...partial }
  return next
}

/** One row per child start input — pick a value source or leave on Auto (passthrough). */
export default function SwarmInputFieldBuilder({
  fields,
  onChange,
  childInputKeys,
  variableOptions,
}: Props) {
  const childKeys = useMemo(
    () => (childInputKeys.length > 0 ? childInputKeys : ["message"]),
    [childInputKeys],
  )

  const fieldByKey = useMemo(() => {
    const map = new Map<string, SwarmInputField>()
    for (const row of fields) {
      const key = row.key.trim()
      if (key) map.set(key, row)
    }
    return map
  }, [fields])

  const upstreamOptions = useMemo(
    () => variableOptions.filter((option) => option.group === "upstream"),
    [variableOptions],
  )

  const runInputOptions = useMemo(
    () => variableOptions.filter((option) => option.group === "runInput"),
    [variableOptions],
  )

  const hasVariableOptions = upstreamOptions.length > 0 || runInputOptions.length > 0

  const updateMapping = (childKey: string, encoded: string) => {
    const existing = fieldByKey.get(childKey)
    const decoded = decodeMapping(encoded, childKey, existing)
    const without = fields.filter((row) => row.key.trim() !== childKey)
    if (!decoded) {
      onChange(without)
      return
    }
    onChange([...without, decoded])
  }

  const updateFieldDetail = (childKey: string, partial: Partial<SwarmInputField>) => {
    onChange(patchFieldDetail(fields, childKey, partial))
  }

  return (
    <div className="builder">
      <div className="builder-head">
        <h3 className="section-title">Child swarm inputs</h3>
        <p className="field-hint">
          Each row is one start input on the child swarm. Leave <strong>Auto</strong> to pass the
          full upstream payload, or pick where each field comes from.
        </p>
      </div>

      {!hasVariableOptions ? (
        <p className="warn">
          Connect an upstream node to the sub-swarm to see workflow variables.
        </p>
      ) : null}

      <ul className="rows">
        {childKeys.map((childKey) => {
          const field = fieldByKey.get(childKey)
          const selection = encodeMapping(field)
          const showStatic = selection === STATIC_VALUE
          const showShared = selection === SHARED_VALUE

          return (
            <li key={childKey} className="row">
              <span className="child-key" title={`Child input: ${childKey}`}>
                {childKey}
              </span>

              <label className="value-pick">
                <span className="sr-only">Value for {childKey}</span>
                <select
                  className="value-select"
                  value={selection}
                  onChange={(e) => updateMapping(childKey, e.target.value)}
                >
                  <option value={AUTO_VALUE}>Auto — passthrough upstream</option>
                  {upstreamOptions.length > 0 ? (
                    <optgroup label="Upstream">
                      {upstreamOptions.map((option) => (
                        <option key={option.id} value={`upstream:${option.value}`}>
                          {option.label}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                  {runInputOptions.length > 0 ? (
                    <optgroup label="Run input">
                      {runInputOptions.map((option) => (
                        <option
                          key={option.id}
                          value={`runInput:${option.value.replace(/^runInput\./, "")}`}
                        >
                          {option.label}
                        </option>
                      ))}
                    </optgroup>
                  ) : null}
                  <option value={SHARED_VALUE}>Shared state…</option>
                  <option value={STATIC_VALUE}>Static value…</option>
                </select>
              </label>

              {showShared ? (
                <input
                  className="detail-input"
                  placeholder="shared key, e.g. draft"
                  value={field?.valuePath ?? ""}
                  onChange={(e) =>
                    updateFieldDetail(childKey, {
                      source: "shared" as SwarmInputFieldSource,
                      valuePath: e.target.value,
                    })
                  }
                  aria-label={`Shared key for ${childKey}`}
                />
              ) : null}

              {showStatic ? (
                <input
                  className="detail-input detail-input--mono"
                  placeholder="text or JSON"
                  value={field?.staticValue ?? ""}
                  onChange={(e) =>
                    updateFieldDetail(childKey, {
                      source: "static" as SwarmInputFieldSource,
                      staticValue: e.target.value,
                    })
                  }
                  aria-label={`Static value for ${childKey}`}
                />
              ) : null}
            </li>
          )
        })}
      </ul>

      <style jsx>{`
        .builder {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
        }
        .builder-head {
          display: flex;
          flex-direction: column;
          gap: 0.25rem;
        }
        .section-title {
          margin: 0;
          font-size: 0.75rem;
          font-weight: 600;
          color: var(--app-text);
        }
        .field-hint {
          margin: 0;
          font-size: 0.625rem;
          color: var(--app-text-faint);
          line-height: 1.45;
        }
        .field-hint :global(strong) {
          font-weight: 600;
          color: var(--app-text-muted);
        }
        .warn {
          margin: 0;
          font-size: 0.625rem;
          color: color-mix(in srgb, var(--app-text) 70%, orange);
          line-height: 1.4;
        }
        .rows {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .row {
          display: grid;
          grid-template-columns: minmax(4rem, 0.55fr) 1fr;
          gap: 0.5rem;
          align-items: center;
          padding: 0.5rem 0.625rem;
          border: 1px solid var(--app-border);
          border-radius: var(--app-radius);
          background: var(--app-surface-muted);
        }
        .row:has(.detail-input) {
          grid-template-columns: minmax(4rem, 0.55fr) 1fr;
          grid-template-rows: auto auto;
        }
        .detail-input {
          grid-column: 1 / -1;
        }
        .child-key {
          font-size: 0.6875rem;
          font-weight: 600;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          color: var(--app-text);
          word-break: break-word;
        }
        .value-pick {
          min-width: 0;
        }
        .value-select {
          width: 100%;
          box-sizing: border-box;
          font-size: 0.6875rem;
          padding: 0.375rem 0.4375rem;
          border: 1px solid var(--app-border);
          border-radius: var(--app-radius);
          background: var(--app-bg);
          color: var(--app-text);
          font-family: var(--app-font);
        }
        .value-select:focus {
          outline: none;
          border-color: var(--app-border-strong);
          box-shadow: var(--app-btn-focus-ring);
        }
        .detail-input {
          width: 100%;
          box-sizing: border-box;
          font-size: 0.6875rem;
          padding: 0.375rem 0.4375rem;
          border: 1px solid var(--app-border);
          border-radius: var(--app-radius);
          background: var(--app-bg);
          color: var(--app-text);
          font-family: var(--app-font);
        }
        .detail-input--mono {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
        }
        .detail-input:focus {
          outline: none;
          border-color: var(--app-border-strong);
          box-shadow: var(--app-btn-focus-ring);
        }
        .sr-only {
          position: absolute;
          width: 1px;
          height: 1px;
          padding: 0;
          margin: -1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          border: 0;
        }
      `}</style>
    </div>
  )
}
