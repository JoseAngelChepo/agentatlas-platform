"use client"

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"
import { TbGitBranch } from "react-icons/tb"
import NodeWrapper from "../shared/NodeWrapper"
import { CANVAS_NODE_CIRCLE_RADIUS } from "../shared/canvasNodeShapeStyles"
import NodeRunVisual, { nodeRunSquareModifier, useNodeRunState } from "../shared/NodeRunVisual"
import { NODE_RUN_SQUARE_STYLES } from "../shared/nodeRunSquareStyles"
import { useSwarmEditor } from "../../SwarmEditorContext"
import {
  ELSE_HANDLE_ID,
  caseHandleId,
  ifElseCaseCanvasLabel,
  normalizeIfElseCases,
  type IfElseNodeData,
} from "./data"

export type IfElseNodeType = Node<IfElseNodeData, "ifelse">

function sourceHandleTop(index: number, total: number): string {
  if (total <= 1) return "50%"
  const step = 100 / (total + 1)
  return `${step * (index + 1)}%`
}

/** Compact If/else representation on the React Flow canvas. */
export default function IfElseCanvasNode({ id, data, selected }: NodeProps<IfElseNodeType>) {
  const { onSelectNode, onOpenNode } = useSwarmEditor()
  const runState = useNodeRunState(id)
  const cases = normalizeIfElseCases(data.cases)
  const outputCount = cases.length + 1

  const openConfig = () => {
    onSelectNode(id)
    onOpenNode(id)
  }

  return (
    <NodeWrapper
      id={id}
      type="if / else"
      onConfigure={openConfig}
      configureAriaLabel="Configure if / else node"
    >
      <div className={`ifelse-node${selected ? " ifelse-node--on" : ""}`}>
        <Handle
          type="target"
          position={Position.Left}
          className="ifelse-handle ifelse-handle--target"
        />
        <div
          className={`square${nodeRunSquareModifier(runState)}`}
          onDoubleClick={openConfig}
          role="presentation"
        >
          <NodeRunVisual nodeId={id} icon={<TbGitBranch size={28} aria-hidden />} />
        </div>
        {cases.map((c, index) => (
          <Handle
            key={c.id}
            type="source"
            position={Position.Right}
            id={caseHandleId(c.id)}
            className="ifelse-handle ifelse-handle--source"
            style={{ top: sourceHandleTop(index, outputCount) }}
          />
        ))}
        {cases.map((c, index) => (
          <span
            key={`label-${c.id}`}
            className={`branch-label${index === 0 ? " branch-label--if" : " branch-label--elseif"}`}
            style={{ top: sourceHandleTop(index, outputCount) }}
          >
            {ifElseCaseCanvasLabel(c, index)}
          </span>
        ))}
        <Handle
          type="source"
          position={Position.Right}
          id={ELSE_HANDLE_ID}
          className="ifelse-handle ifelse-handle--source"
          style={{ top: sourceHandleTop(cases.length, outputCount) }}
        />
        <span
          className="branch-label branch-label--else"
          style={{ top: sourceHandleTop(cases.length, outputCount) }}
        >
          Else
        </span>
      </div>

      <style jsx>{`
        .ifelse-node {
          position: relative;
          width: 4rem;
        }
        .square {
          display: flex;
          align-items: center;
          justify-content: center;
          aspect-ratio: 1;
          border: 1px solid var(--app-border);
          border-radius: ${CANVAS_NODE_CIRCLE_RADIUS};
          background: var(--app-text);
          color: var(--app-bg);
          transition:
            border-color 0.15s ease,
            box-shadow 0.15s ease,
            background 0.15s ease,
            color 0.15s ease;
        }
        .ifelse-node:hover .square {
          border-color: var(--app-border-strong);
        }
        .ifelse-node--on .square {
          border-color: var(--app-text);
          box-shadow: 0 0 0 2px color-mix(in srgb, var(--app-text) 18%, transparent);
          background: var(--app-surface);
          color: var(--app-text);
        }
        :global(.ifelse-handle) {
          width: 7px;
          height: 7px;
          background: var(--app-border-strong);
          border: 1.5px solid var(--app-surface);
        }
        :global(.ifelse-handle--target) {
          left: -5px;
        }
        :global(.ifelse-handle--source) {
          right: -5px;
        }
        .ifelse-node:hover :global(.ifelse-handle),
        .ifelse-node--on :global(.ifelse-handle) {
          background: var(--app-text);
        }
        .branch-label {
          position: absolute;
          left: calc(100% + 0.4rem);
          transform: translateY(-50%);
          font-size: 0.5rem;
          font-weight: 600;
          letter-spacing: 0.03em;
          white-space: nowrap;
          max-width: 5.5rem;
          overflow: hidden;
          text-overflow: ellipsis;
          pointer-events: none;
          user-select: none;
        }
        .branch-label--if {
          color: var(--app-text-muted);
        }
        .branch-label--elseif {
          color: var(--app-text-muted);
        }
        .branch-label--else {
          color: var(--app-text-faint);
        }
        ${NODE_RUN_SQUARE_STYLES}
      `}</style>
    </NodeWrapper>
  )
}
