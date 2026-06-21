"use client"

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"
import { TbFlag } from "react-icons/tb"
import NodeWrapper from "../shared/NodeWrapper"
import NodeRunVisual, { nodeRunSquareModifier, useNodeRunState } from "../shared/NodeRunVisual"
import { CANVAS_NODE_CIRCLE_RADIUS } from "../shared/canvasNodeShapeStyles"
import { NODE_RUN_SQUARE_STYLES } from "../shared/nodeRunSquareStyles"
import { useSwarmEditor } from "../../SwarmEditorContext"
import type { EndNodeData } from "./data"

export type EndNodeType = Node<EndNodeData, "end">

/** Terminal join node — merges upstream data into one JSON object. */
export default function EndCanvasNode({ id, selected }: NodeProps<EndNodeType>) {
  const { onSelectNode, onOpenNode } = useSwarmEditor()
  const runState = useNodeRunState(id)

  const openConfig = () => {
    onSelectNode(id)
    onOpenNode(id)
  }

  return (
    <NodeWrapper
      id={id}
      type="end"
      onConfigure={openConfig}
      configureAriaLabel="Configure end node"
    >
      <div className={`end-node${selected ? " end-node--on" : ""}`}>
        <Handle
          type="target"
          position={Position.Left}
          className="end-handle end-handle--target"
        />
        <div className={`square${nodeRunSquareModifier(runState)}`}>
          <NodeRunVisual nodeId={id} icon={<TbFlag size={28} aria-hidden />} />
        </div>
      </div>

      <style jsx>{`
        .end-node {
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
        .end-node:hover .square {
          border-color: var(--app-border-strong);
        }
        .end-node--on .square {
          border-color: var(--app-text);
          box-shadow: 0 0 0 2px color-mix(in srgb, var(--app-text) 18%, transparent);
          background: var(--app-surface);
          color: var(--app-text);
        }
        :global(.end-handle) {
          width: 7px;
          height: 7px;
          background: var(--app-border-strong);
          border: 1.5px solid var(--app-surface);
        }
        :global(.end-handle--target) {
          left: -5px;
        }
        .end-node:hover :global(.end-handle),
        .end-node--on :global(.end-handle) {
          background: var(--app-text);
        }
        ${NODE_RUN_SQUARE_STYLES}
      `}</style>
    </NodeWrapper>
  )
}
