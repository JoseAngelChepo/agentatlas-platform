"use client"

import { TbLoader2, TbPlus } from "react-icons/tb"
import AgentRobotIcon from "./icons/AgentRobotIcon"
import {
  CONTROL_NODE_PALETTE,
  SWARM_PALETTE_CONTROL_MIME,
  START_NODE_KIND,
  type ControlNodeKind,
} from "./nodes/registry"

/** Drag payload for the generic Agent node tile (not a persisted worker id). */
export const SWARM_PALETTE_AGENT_MIME = "application/agentatlas-palette-agent"

type Props = {
  /** Create a new AgentWorker blueprint and add it to the canvas. */
  onPlaceAgent: () => void
  /** Place a control-flow node (e.g. if/else) on the canvas. */
  onPlaceControl: (kind: ControlNodeKind) => void
  placingAgent?: boolean
}

/**
 * Crewy-style left rail with **base node types**, not every AgentWorker in the account.
 * Each placement creates a new worker (own prompt); entry/exit come from graph topology.
 */
export default function SwarmEditorSidebar({
  onPlaceAgent,
  onPlaceControl,
  placingAgent = false,
}: Props) {
  const handleDragStart = (event: React.DragEvent<HTMLDivElement>) => {
    event.dataTransfer.setData(SWARM_PALETTE_AGENT_MIME, "1")
    event.dataTransfer.effectAllowed = "copy"
  }

  const handleControlDragStart =
    (kind: ControlNodeKind) => (event: React.DragEvent<HTMLDivElement>) => {
      event.dataTransfer.setData(SWARM_PALETTE_CONTROL_MIME, kind)
      event.dataTransfer.effectAllowed = "copy"
    }

  const controlNodes = CONTROL_NODE_PALETTE.filter((n) => n.kind !== START_NODE_KIND)
  const startNode = CONTROL_NODE_PALETTE.find((n) => n.kind === START_NODE_KIND)
  const StartIcon = startNode?.icon

  return (
    <aside className="sidebar" aria-label="Node palette">
      <div className="head">
        <h3 className="title">Nodes</h3>
      </div>

      <ul className="list">
        {startNode && StartIcon ? (
          <li key={startNode.kind}>
            <div
              className="agent-card"
              draggable
              onDragStart={handleControlDragStart(startNode.kind as ControlNodeKind)}
              title={startNode.description}
            >
              <button
                type="button"
                className="agent-tile"
                onClick={() => onPlaceControl(startNode.kind as ControlNodeKind)}
                aria-label={`Add ${startNode.label} node to canvas`}
              >
                <span className="agent-icon agent-icon--robot" aria-hidden>
                  <StartIcon size={22} />
                </span>
                <span className="agent-icon agent-icon--plus" aria-hidden>
                  <TbPlus size={22} strokeWidth={2.25} />
                </span>
              </button>
              <span className="agent-name">{startNode.label}</span>
            </div>
          </li>
        ) : null}

        <li>
          <div
            className="agent-card"
            draggable={!placingAgent}
            onDragStart={handleDragStart}
            title="Add a new agent — each node has its own prompt"
          >
            <button
              type="button"
              className="agent-tile"
              onClick={onPlaceAgent}
              disabled={placingAgent}
              aria-label="Add agent to canvas"
            >
              {placingAgent ? (
                <TbLoader2 size={22} className="spin" aria-hidden />
              ) : (
                <>
                  <span className="agent-icon agent-icon--robot" aria-hidden>
                    <AgentRobotIcon size={22} />
                  </span>
                  <span className="agent-icon agent-icon--plus" aria-hidden>
                    <TbPlus size={22} strokeWidth={2.25} />
                  </span>
                </>
              )}
            </button>
            <span className="agent-name">Agent</span>
          </div>
        </li>

        {controlNodes.map((node) => {
          const Icon = node.icon
          return (
            <li key={node.kind}>
              <div
                className="agent-card"
                draggable
                onDragStart={handleControlDragStart(node.kind)}
                title={node.description}
              >
                <button
                  type="button"
                  className="agent-tile"
                  onClick={() => onPlaceControl(node.kind)}
                  aria-label={`Add ${node.label} node to canvas`}
                >
                  <span className="agent-icon agent-icon--robot" aria-hidden>
                    <Icon size={22} />
                  </span>
                  <span className="agent-icon agent-icon--plus" aria-hidden>
                    <TbPlus size={22} strokeWidth={2.25} />
                  </span>
                </button>
                <span className="agent-name">{node.label}</span>
              </div>
            </li>
          )
        })}
      </ul>

      <style jsx>{`
        .sidebar {
          --agent-tile-size: 3.25rem;
          width: 5.5rem;
          flex-shrink: 0;
          padding: 0.625rem 0.875rem 0.75rem;
          border-right: 1px solid var(--app-border);
          background: var(--app-surface);
          display: flex;
          flex-direction: column;
          align-items: stretch;
          gap: 0.5rem;
          min-height: 0;
          overflow: hidden;
          box-sizing: border-box;
        }
        .head {
          width: 100%;
          flex-shrink: 0;
        }
        .title {
          margin: 0;
          font-size: 0.625rem;
          font-weight: 500;
          color: var(--app-text-faint);
          letter-spacing: 0.06em;
          text-transform: uppercase;
        }
        .list {
          list-style: none;
          margin: 0;
          padding: 0.125rem 0 0;
          width: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.75rem;
          min-height: 0;
          overflow-y: auto;
        }
        .agent-card {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 0.3rem;
          width: 100%;
          cursor: grab;
          user-select: none;
        }
        .agent-card:active {
          cursor: grabbing;
        }
        .agent-tile {
          --agent-robot-eye-fill: var(--app-bg);
          position: relative;
          width: var(--agent-tile-size);
          height: var(--agent-tile-size);
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 0;
          border: 1px solid var(--app-border);
          border-radius: calc(var(--app-radius) + 2px);
          background: var(--app-bg);
          color: var(--app-text-muted);
          cursor: pointer;
          overflow: hidden;
          transition:
            border-color 0.18s ease,
            background 0.18s ease,
            color 0.18s ease,
            transform 0.18s ease,
            box-shadow 0.18s ease;
        }
        .agent-tile:disabled {
          opacity: 0.6;
          cursor: wait;
        }
        .agent-card:hover .agent-tile:not(:disabled) {
          --agent-robot-eye-fill: var(--app-surface-muted);
          border-color: var(--app-border-strong);
          background: var(--app-surface-muted);
          color: var(--app-text);
          transform: translateY(-1px);
          box-shadow: 0 2px 8px rgba(15, 17, 20, 0.06);
        }
        .agent-icon {
          position: absolute;
          inset: 0;
          display: flex;
          align-items: center;
          justify-content: center;
          transition:
            opacity 0.16s ease,
            transform 0.16s ease;
        }
        .agent-icon--robot {
          opacity: 1;
          transform: scale(1);
        }
        .agent-icon--plus {
          opacity: 0;
          transform: scale(0.82);
        }
        .agent-card:hover .agent-icon--robot {
          opacity: 0;
          transform: scale(0.82);
        }
        .agent-card:hover .agent-icon--plus {
          opacity: 1;
          transform: scale(1);
        }
        .agent-name {
          width: 100%;
          font-size: 0.625rem;
          font-weight: 500;
          line-height: 1.3;
          text-align: center;
          color: var(--app-text-muted);
          padding: 0 0.125rem;
        }
        .agent-card:hover .agent-name {
          color: var(--app-text);
        }
        :global(.spin) {
          animation: spin 0.9s linear infinite;
        }
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
      `}</style>
    </aside>
  )
}
