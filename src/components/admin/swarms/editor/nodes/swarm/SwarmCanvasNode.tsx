"use client"

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"
import { TbStack2 } from "react-icons/tb"
import NodeWrapper from "../shared/NodeWrapper"
import { CANVAS_NODE_CIRCLE_RADIUS } from "../shared/canvasNodeShapeStyles"
import NodeRunVisual, { nodeRunSquareModifier, useNodeRunState } from "../shared/NodeRunVisual"
import { NODE_RUN_SQUARE_STYLES } from "../shared/nodeRunSquareStyles"
import { useSwarmEditor } from "../../SwarmEditorContext"
import {
  SWARM_FAILED_HANDLE,
  SWARM_SUCCESS_HANDLE,
  type SwarmNodeData,
} from "./data"

export type SwarmNodeType = Node<SwarmNodeData, "swarm">

function sourceHandleTop(index: number, total: number): string {
  if (total <= 1) return "50%"
  const step = 100 / (total + 1)
  return `${step * (index + 1)}%`
}

/** Compact sub-swarm node on the React Flow canvas. */
export default function SwarmCanvasNode({ id, selected, data }: NodeProps<SwarmNodeType>) {
  const { onSelectNode, onOpenNode, pickerSwarms } = useSwarmEditor()
  const runState = useNodeRunState(id)
  const outputCount = 2
  const referenced = data.swarmId
    ? pickerSwarms.find((row) => row.id === data.swarmId)
    : undefined
  const configureLabel = referenced?.name ?? data.label?.trim() ?? "Sub-swarm"

  const openConfig = () => {
    onSelectNode(id)
    onOpenNode(id)
  }

  return (
    <NodeWrapper
      id={id}
      type="swarm"
      onConfigure={openConfig}
      configureAriaLabel={`Configure sub-swarm node${referenced ? `: ${referenced.name}` : ""}`}
    >
      <div className={`swarm-node${selected ? " swarm-node--on" : ""}`}>
        <Handle
          type="target"
          position={Position.Left}
          className="swarm-handle swarm-handle--target"
        />
        <div className={`square${nodeRunSquareModifier(runState)}`} title={configureLabel}>
          <NodeRunVisual nodeId={id} icon={<TbStack2 size={28} aria-hidden />} />
        </div>
        <Handle
          type="source"
          position={Position.Right}
          id={SWARM_SUCCESS_HANDLE}
          className="swarm-handle swarm-handle--source"
          style={{ top: sourceHandleTop(0, outputCount) }}
        />
        <span
          className="branch-label branch-label--success"
          style={{ top: sourceHandleTop(0, outputCount) }}
        >
          Success
        </span>
        <Handle
          type="source"
          position={Position.Right}
          id={SWARM_FAILED_HANDLE}
          className="swarm-handle swarm-handle--source"
          style={{ top: sourceHandleTop(1, outputCount) }}
        />
        <span
          className="branch-label branch-label--failed"
          style={{ top: sourceHandleTop(1, outputCount) }}
        >
          Failed
        </span>
      </div>

      <style jsx>{`
        .swarm-node {
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
        .swarm-node:hover .square {
          border-color: var(--app-border-strong);
        }
        .swarm-node--on .square {
          border-color: var(--app-text);
          box-shadow: 0 0 0 2px color-mix(in srgb, var(--app-text) 18%, transparent);
          background: var(--app-surface);
          color: var(--app-text);
        }
        :global(.swarm-handle) {
          width: 7px;
          height: 7px;
          background: var(--app-border-strong);
          border: 1.5px solid var(--app-surface);
        }
        :global(.swarm-handle--target) {
          left: -5px;
        }
        :global(.swarm-handle--source) {
          right: -5px;
        }
        .swarm-node:hover :global(.swarm-handle),
        .swarm-node--on :global(.swarm-handle) {
          background: var(--app-text);
        }
        .branch-label {
          position: absolute;
          left: calc(100% + 0.4rem);
          transform: translateY(-50%);
          font-size: 0.5rem;
          font-weight: 600;
          letter-spacing: 0.03em;
          color: var(--app-text-faint);
          white-space: nowrap;
          pointer-events: none;
          user-select: none;
        }
        .branch-label--success {
          color: var(--app-text-muted);
        }
        .branch-label--failed {
          color: var(--app-text-faint);
        }
        ${NODE_RUN_SQUARE_STYLES}
      `}</style>
    </NodeWrapper>
  )
}
