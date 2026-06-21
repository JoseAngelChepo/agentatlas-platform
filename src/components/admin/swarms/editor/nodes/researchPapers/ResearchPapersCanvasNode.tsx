"use client"

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react"
import { TbBook2 } from "react-icons/tb"
import NodeWrapper from "../shared/NodeWrapper"
import { CANVAS_NODE_CIRCLE_RADIUS } from "../shared/canvasNodeShapeStyles"
import NodeRunVisual, { nodeRunSquareModifier, useNodeRunState } from "../shared/NodeRunVisual"
import { NODE_RUN_SQUARE_STYLES } from "../shared/nodeRunSquareStyles"
import { useSwarmEditor } from "../../SwarmEditorContext"
import {
  RESEARCH_PAPERS_FAILED_HANDLE,
  RESEARCH_PAPERS_SUCCESS_HANDLE,
  type ResearchPapersNodeData,
} from "./data"

export type ResearchPapersNodeType = Node<ResearchPapersNodeData, "research_papers">

function sourceHandleTop(index: number, total: number): string {
  if (total <= 1) return "50%"
  const step = 100 / (total + 1)
  return `${step * (index + 1)}%`
}

export default function ResearchPapersCanvasNode({ id, selected }: NodeProps<ResearchPapersNodeType>) {
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
      type="research_papers"
      onConfigure={openConfig}
      configureAriaLabel="Configure research papers node"
    >
      <div className={`research-papers-node${selected ? " research-papers-node--on" : ""}`}>
        <Handle
          type="target"
          position={Position.Left}
          className="research-papers-handle research-papers-handle--target"
        />
        <div className={`square${nodeRunSquareModifier(runState)}`}>
          <NodeRunVisual nodeId={id} icon={<TbBook2 size={28} aria-hidden />} />
        </div>
        <Handle
          type="source"
          position={Position.Right}
          id={RESEARCH_PAPERS_SUCCESS_HANDLE}
          className="research-papers-handle research-papers-handle--source"
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
          id={RESEARCH_PAPERS_FAILED_HANDLE}
          className="research-papers-handle research-papers-handle--source"
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
        .research-papers-node {
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
        .research-papers-node:hover .square {
          border-color: var(--app-border-strong);
        }
        .research-papers-node--on .square {
          border-color: var(--app-text);
          box-shadow: 0 0 0 2px color-mix(in srgb, var(--app-text) 18%, transparent);
          background: var(--app-surface);
          color: var(--app-text);
        }
        :global(.research-papers-handle) {
          width: 7px;
          height: 7px;
          background: var(--app-border-strong);
          border: 1.5px solid var(--app-surface);
        }
        :global(.research-papers-handle--target) {
          left: -5px;
        }
        :global(.research-papers-handle--source) {
          right: -5px;
        }
        .research-papers-node:hover :global(.research-papers-handle),
        .research-papers-node--on :global(.research-papers-handle) {
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
