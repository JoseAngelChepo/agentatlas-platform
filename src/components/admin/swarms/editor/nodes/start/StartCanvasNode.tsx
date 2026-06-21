"use client"

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"
import { TbPlayerPlay } from "react-icons/tb"
import NodeWrapper from "../shared/NodeWrapper"
import NodeRunVisual, { nodeRunSquareModifier, useNodeRunState } from "../shared/NodeRunVisual"
import { CANVAS_NODE_CIRCLE_RADIUS } from "../shared/canvasNodeShapeStyles"
import { NODE_RUN_SQUARE_STYLES } from "../shared/nodeRunSquareStyles"
import { useSwarmEditor } from "../../SwarmEditorContext"
import { START_OUTPUT_HANDLE_ID, type StartNodeData } from "./data"

export type StartNodeType = Node<StartNodeData, "start">

/** Workflow entry — compact square tile on the canvas. */
export default function StartCanvasNode({ id, selected }: NodeProps<StartNodeType>) {
  const { onSelectNode, onOpenNode } = useSwarmEditor()
  const runState = useNodeRunState(id)

  const openConfig = () => {
    onSelectNode(id)
    onOpenNode(id)
  }

  return (
    <NodeWrapper
      id={id}
      type="start"
      onConfigure={openConfig}
      configureAriaLabel="Configure start node"
    >
      <div className={`start-node${selected ? " start-node--on" : ""}`}>
        <div className={`square${nodeRunSquareModifier(runState)}`}>
          <NodeRunVisual nodeId={id} icon={<TbPlayerPlay size={28} aria-hidden />} />
        </div>
        <Handle
          type="source"
          position={Position.Right}
          id={START_OUTPUT_HANDLE_ID}
          className="start-handle"
        />
      </div>

      <style jsx>{`
        .start-node {
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
        .start-node:hover .square {
          border-color: var(--app-border-strong);
        }
        .start-node--on .square {
          border-color: var(--app-text);
          box-shadow: 0 0 0 2px color-mix(in srgb, var(--app-text) 18%, transparent);
          background: var(--app-surface);
          color: var(--app-text);
        }
        :global(.start-handle) {
          width: 7px;
          height: 7px;
          right: -5px;
          background: var(--app-border-strong);
          border: 1.5px solid var(--app-surface);
        }
        .start-node:hover :global(.start-handle),
        .start-node--on :global(.start-handle) {
          background: var(--app-text);
        }
        ${NODE_RUN_SQUARE_STYLES}
      `}</style>
    </NodeWrapper>
  )
}
