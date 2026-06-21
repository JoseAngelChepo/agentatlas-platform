"use client"

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"
import { TbRepeat } from "react-icons/tb"
import NodeWrapper from "../shared/NodeWrapper"
import { CANVAS_NODE_CIRCLE_RADIUS } from "../shared/canvasNodeShapeStyles"
import NodeRunVisual, { nodeRunSquareModifier, useNodeRunState } from "../shared/NodeRunVisual"
import { NODE_RUN_SQUARE_STYLES } from "../shared/nodeRunSquareStyles"
import { useSwarmEditor } from "../../SwarmEditorContext"
import {
  WHILE_DONE_HANDLE,
  WHILE_LOOP_HANDLE,
  type WhileNodeData,
} from "./data"

export type WhileNodeType = Node<WhileNodeData, "while">

function sourceHandleTop(index: number, total: number): string {
  if (total <= 1) return "50%"
  const step = 100 / (total + 1)
  return `${step * (index + 1)}%`
}

/** While loop — loop body and done branches on the canvas. */
export default function WhileCanvasNode({ id, selected }: NodeProps<WhileNodeType>) {
  const { onSelectNode, onOpenNode } = useSwarmEditor()
  const runState = useNodeRunState(id)
  const outputCount = 2

  const openConfig = () => {
    onSelectNode(id)
    onOpenNode(id)
  }

  return (
    <NodeWrapper
      id={id}
      type="while"
      onConfigure={openConfig}
      configureAriaLabel="Configure while node"
    >
      <div className={`while-node${selected ? " while-node--on" : ""}`}>
        <Handle
          type="target"
          position={Position.Left}
          className="while-handle while-handle--target"
        />
        <div
          className={`square${nodeRunSquareModifier(runState)}`}
          onDoubleClick={openConfig}
          role="presentation"
        >
          <NodeRunVisual nodeId={id} icon={<TbRepeat size={28} aria-hidden />} />
        </div>
        <Handle
          type="source"
          position={Position.Right}
          id={WHILE_LOOP_HANDLE}
          className="while-handle while-handle--source"
          style={{ top: sourceHandleTop(0, outputCount) }}
        />
        <span
          className="branch-label branch-label--loop"
          style={{ top: sourceHandleTop(0, outputCount) }}
        >
          Loop
        </span>
        <Handle
          type="source"
          position={Position.Right}
          id={WHILE_DONE_HANDLE}
          className="while-handle while-handle--source"
          style={{ top: sourceHandleTop(1, outputCount) }}
        />
        <span
          className="branch-label branch-label--done"
          style={{ top: sourceHandleTop(1, outputCount) }}
        >
          Done
        </span>
      </div>

      <style jsx>{`
        .while-node {
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
        .while-node:hover .square {
          border-color: var(--app-border-strong);
        }
        .while-node--on .square {
          border-color: var(--app-text);
          box-shadow: 0 0 0 2px color-mix(in srgb, var(--app-text) 18%, transparent);
          background: var(--app-surface);
          color: var(--app-text);
        }
        :global(.while-handle) {
          width: 7px;
          height: 7px;
          background: var(--app-border-strong);
          border: 1.5px solid var(--app-surface);
        }
        :global(.while-handle--target) {
          left: -5px;
        }
        :global(.while-handle--source) {
          right: -5px;
        }
        .while-node:hover :global(.while-handle),
        .while-node--on :global(.while-handle) {
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
          pointer-events: none;
          user-select: none;
        }
        .branch-label--loop {
          color: var(--app-text-muted);
        }
        .branch-label--done {
          color: var(--app-text-faint);
        }
        ${NODE_RUN_SQUARE_STYLES}
      `}</style>
    </NodeWrapper>
  )
}
