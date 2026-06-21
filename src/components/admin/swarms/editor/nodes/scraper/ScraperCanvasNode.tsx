"use client"

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"
import { TbWorldWww } from "react-icons/tb"
import NodeWrapper from "../shared/NodeWrapper"
import { CANVAS_NODE_CIRCLE_RADIUS } from "../shared/canvasNodeShapeStyles"
import NodeRunVisual, { nodeRunSquareModifier, useNodeRunState } from "../shared/NodeRunVisual"
import { NODE_RUN_SQUARE_STYLES } from "../shared/nodeRunSquareStyles"
import { useSwarmEditor } from "../../SwarmEditorContext"
import {
  SCRAPER_FAILED_HANDLE,
  SCRAPER_SUCCESS_HANDLE,
  type ScraperNodeData,
} from "./data"

export type ScraperNodeType = Node<ScraperNodeData, "scraper">

function sourceHandleTop(index: number, total: number): string {
  if (total <= 1) return "50%"
  const step = 100 / (total + 1)
  return `${step * (index + 1)}%`
}

/** Compact scraper node on the React Flow canvas. */
export default function ScraperCanvasNode({ id, selected }: NodeProps<ScraperNodeType>) {
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
      type="scraper"
      onConfigure={openConfig}
      configureAriaLabel="Configure web scrape node"
    >
      <div className={`scraper-node${selected ? " scraper-node--on" : ""}`}>
        <Handle
          type="target"
          position={Position.Left}
          className="scraper-handle scraper-handle--target"
        />
        <div className={`square${nodeRunSquareModifier(runState)}`}>
          <NodeRunVisual nodeId={id} icon={<TbWorldWww size={28} aria-hidden />} />
        </div>
        <Handle
          type="source"
          position={Position.Right}
          id={SCRAPER_SUCCESS_HANDLE}
          className="scraper-handle scraper-handle--source"
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
          id={SCRAPER_FAILED_HANDLE}
          className="scraper-handle scraper-handle--source"
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
        .scraper-node {
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
        .scraper-node:hover .square {
          border-color: var(--app-border-strong);
        }
        .scraper-node--on .square {
          border-color: var(--app-text);
          box-shadow: 0 0 0 2px color-mix(in srgb, var(--app-text) 18%, transparent);
          background: var(--app-surface);
          color: var(--app-text);
        }
        :global(.scraper-handle) {
          width: 7px;
          height: 7px;
          background: var(--app-border-strong);
          border: 1.5px solid var(--app-surface);
        }
        :global(.scraper-handle--target) {
          left: -5px;
        }
        :global(.scraper-handle--source) {
          right: -5px;
        }
        .scraper-node:hover :global(.scraper-handle),
        .scraper-node--on :global(.scraper-handle) {
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
