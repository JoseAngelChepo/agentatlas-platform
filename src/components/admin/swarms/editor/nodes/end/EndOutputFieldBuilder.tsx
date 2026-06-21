"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { TbPlus, TbTrash } from "react-icons/tb"
import InstructionsContextPicker, {
  type ContextMenuKind,
  type ContextPickerSection,
} from "@/components/admin/swarms/InstructionsContextPicker"
import {
  buildGlobalContextPickerSections,
  buildGlobalContextVariables,
} from "@/lib/swarm-global-context-vars"
import type { EndOutputFieldOption } from "@/lib/swarm-graph-vars"
import {
  createEndOutputField,
  fieldFromVariableOption,
  isEndFieldsPlaceholder,
  type EndOutputField,
} from "./data"

type Props = {
  fields: EndOutputField[]
  onChange: (fields: EndOutputField[]) => void
  variableOptions: EndOutputFieldOption[]
}

function patchField(
  fields: EndOutputField[],
  index: number,
  partial: Partial<EndOutputField>,
): EndOutputField[] {
  const next = [...fields]
  const current = next[index]
  if (!current) return next
  next[index] = {
    id: current.id,
    key: partial.key ?? current.key,
    valuePath: partial.valuePath ?? current.valuePath,
    source: partial.source ?? current.source,
    staticValue: partial.staticValue ?? current.staticValue,
  }
  return next
}

function buildEndLocalPickerSections(
  variableOptions: EndOutputFieldOption[],
  usedPaths: Set<string>,
): ContextPickerSection[] {
  const available = variableOptions.filter((option) => !usedPaths.has(option.value))
  const runInput = available.filter((option) => option.group === "runInput")
  const upstream = available.filter((option) => option.group === "upstream")
  const sections: ContextPickerSection[] = []

  if (runInput.length > 0) {
    sections.push({
      label: "Run input",
      items: runInput.map((option) => ({
        token: option.value,
        label: option.label,
      })),
    })
  }

  if (upstream.length > 0) {
    sections.push({
      label: "Upstream",
      items: upstream.map((option) => ({
        token: option.value,
        label: option.label,
      })),
    })
  }

  return sections
}

function labelForVariable(
  valuePath: string | undefined,
  variableOptions: EndOutputFieldOption[],
): string {
  if (!valuePath) return "—"
  const fromWorkflow = variableOptions.find((option) => option.value === valuePath)?.label
  if (fromWorkflow) return fromWorkflow
  const fromGlobal = buildGlobalContextVariables("bare").find(
    (variable) => variable.token === valuePath,
  )?.label
  return fromGlobal ?? valuePath
}

function mergeFieldsWithVariables(
  current: EndOutputField[],
  toAdd: EndOutputField[],
): EndOutputField[] {
  if (toAdd.length === 0) return current
  const base = isEndFieldsPlaceholder(current) ? [] : current
  const seen = new Set(base.map((row) => row.valuePath).filter(Boolean))
  const merged = [...base]
  for (const row of toAdd) {
    if (!row.valuePath || seen.has(row.valuePath)) continue
    seen.add(row.valuePath)
    merged.push(row)
  }
  return merged
}

/** End output mapping — pick variables, edit keys, bulk-add from workflow. */
export default function EndOutputFieldBuilder({ fields, onChange, variableOptions }: Props) {
  const [pickerValue, setPickerValue] = useState("")
  const [openMenu, setOpenMenu] = useState<ContextMenuKind | null>(null)
  const pickerRef = useRef<HTMLDivElement>(null)
  const hasOptions = variableOptions.length > 0

  const usedPaths = useMemo(
    () =>
      new Set(
        fields
          .map((row) => row.valuePath)
          .filter((valuePath): valuePath is string => Boolean(valuePath)),
      ),
    [fields],
  )

  const pickerOptions = useMemo(
    () => variableOptions.filter((opt) => !usedPaths.has(opt.value)),
    [variableOptions, usedPaths],
  )

  const localFlatSections = useMemo(
    () => buildEndLocalPickerSections(variableOptions, usedPaths),
    [variableOptions, usedPaths],
  )

  const globalFlatSections = useMemo(
    () => buildGlobalContextPickerSections("bare", usedPaths),
    [usedPaths],
  )

  const upstreamOptions = pickerOptions.filter((o) => o.group === "upstream")
  const runInputOptions = pickerOptions.filter((o) => o.group === "runInput")

  useEffect(() => {
    if (!openMenu) return
    const onPointerDown = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setOpenMenu(null)
      }
    }
    document.addEventListener("mousedown", onPointerDown)
    return () => document.removeEventListener("mousedown", onPointerDown)
  }, [openMenu])

  const addVariable = (valuePath: string) => {
    if (!valuePath) return
    onChange(mergeFieldsWithVariables(fields, [fieldFromVariableOption(valuePath)]))
    setPickerValue("")
    setOpenMenu(null)
  }

  const addAllVariables = () => {
    const toAdd = variableOptions
      .filter((opt) => !usedPaths.has(opt.value))
      .map((opt) => fieldFromVariableOption(opt.value))
    onChange(mergeFieldsWithVariables(fields, toAdd))
    setPickerValue("")
  }

  const removeField = (index: number) => {
    onChange(fields.filter((_, i) => i !== index))
  }

  const toggleMenu = (kind: ContextMenuKind) => {
    setOpenMenu((current) => (current === kind ? null : kind))
  }

  return (
    <div className="builder">
      <div className="toolbar">
        <select
          className="picker"
          value={pickerValue}
          disabled={!hasOptions || pickerOptions.length === 0}
          onChange={(e) => {
            const value = e.target.value
            if (value) addVariable(value)
            else setPickerValue("")
          }}
        >
          <option value="">
            {pickerOptions.length === 0 && hasOptions
              ? "All variables added"
              : "Select a variable…"}
          </option>
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

        <div className="context-picker" ref={pickerRef}>
          <InstructionsContextPicker
            layout="toolbar"
            openMenu={openMenu}
            onToggleMenu={toggleMenu}
            showLocalContext={localFlatSections.length > 0}
            showGlobalContext={globalFlatSections.length > 0}
            localFlatSections={localFlatSections}
            localUpstreamSections={[]}
            globalFlatSections={globalFlatSections}
            localMenuHint="Workflow variables — added as output field mappings."
            globalMenuHint="Company and department runInput paths — caller must pass matching keys."
            localEmptyMessage="Connect upstream nodes into End to populate workflow variables."
            onInsert={addVariable}
          />
        </div>

        <button
          type="button"
          className="add-all-btn"
          disabled={!hasOptions || pickerOptions.length === 0}
          onClick={addAllVariables}
        >
          <TbPlus size={14} aria-hidden />
          Agregar todas las variables del workflow
        </button>
      </div>

      {fields.length === 0 ? (
        <p className="empty">No output fields yet — pick a variable above.</p>
      ) : (
        <ul className="field-list">
          {fields.map((field, index) => (
            <li key={field.id} className="field-row">
              <input
                className="key-input"
                placeholder="json_key"
                value={field.key}
                onChange={(e) =>
                  onChange(patchField(fields, index, { key: e.target.value }))
                }
                aria-label="Output JSON key"
              />
              <span className="var-label" title={field.valuePath ?? undefined}>
                {labelForVariable(field.valuePath, variableOptions)}
              </span>
              <button
                type="button"
                className="remove-btn"
                aria-label="Remove field"
                onClick={() => removeField(index)}
              >
                <TbTrash size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <style jsx>{`
        .builder {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .toolbar {
          display: flex;
          flex-direction: column;
          gap: 0.375rem;
        }
        .context-picker {
          position: relative;
          z-index: 20;
        }
        .picker {
          width: 100%;
          box-sizing: border-box;
          font-size: 0.6875rem;
          padding: 0.4rem 0.45rem;
          border: 1px solid var(--app-border);
          border-radius: var(--app-radius);
          background: var(--app-bg);
          color: var(--app-text);
          font-family: var(--app-font);
          cursor: pointer;
        }
        .picker:disabled {
          opacity: 0.55;
          cursor: not-allowed;
        }
        .add-all-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.35rem;
          align-self: flex-start;
          padding: 0.35rem 0.55rem;
          font-size: 0.625rem;
          font-weight: 500;
          font-family: var(--app-font);
          color: var(--app-text);
          background: var(--app-surface);
          border: 1px solid var(--app-border);
          border-radius: var(--app-radius);
          cursor: pointer;
        }
        .add-all-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .add-all-btn:hover:not(:disabled) {
          border-color: var(--app-border-strong);
          background: var(--app-surface-muted);
        }
        .empty {
          margin: 0;
          font-size: 0.6875rem;
          color: var(--app-text-faint);
        }
        .field-list {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }
        .field-row {
          display: grid;
          grid-template-columns: minmax(4.5rem, 0.85fr) 1fr auto;
          gap: 0.35rem;
          align-items: center;
        }
        .key-input {
          font-size: 0.6875rem;
          padding: 0.35rem 0.4rem;
          border: 1px solid var(--app-border);
          border-radius: var(--app-radius);
          background: var(--app-surface);
          color: var(--app-text);
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          min-width: 0;
        }
        .var-label {
          font-size: 0.625rem;
          color: var(--app-text-muted);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          min-width: 0;
        }
        .remove-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 1.5rem;
          height: 1.5rem;
          border: 1px solid var(--app-border);
          border-radius: var(--app-radius);
          background: var(--app-surface);
          color: var(--app-text-muted);
          cursor: pointer;
        }
        .remove-btn:hover {
          color: #b91c1c;
          border-color: color-mix(in srgb, #b91c1c 35%, var(--app-border));
        }
      `}</style>
    </div>
  )
}
