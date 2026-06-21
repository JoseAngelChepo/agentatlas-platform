"use client"

import AgentRobotIcon from "../../icons/AgentRobotIcon"
import LogoLoader from "@/components/ui/LogoLoader"
import { CANVAS_NODE_CIRCLE_RADIUS } from "../shared/canvasNodeShapeStyles"
import { NODE_RUN_SQUARE_STYLES } from "../shared/nodeRunSquareStyles"
import type { ScaleVisualState, SwarmNodeRunState } from "../../SwarmEditorContext"

type Props = {
  count: number
  phase: ScaleVisualState["phase"]
  shardStates: SwarmNodeRunState[]
  selected: boolean
}

/** Tile outer size (4rem square + 0.25rem padding each side). */
const TILE_SIZE_REM = 4.5
const TILE_GAP_REM = 0.35
const TILE_STEP_REM = TILE_SIZE_REM + TILE_GAP_REM

function shardSquareModifier(state: SwarmNodeRunState): string {
  return state === "idle" ? "" : ` square--run-${state}`
}

function shardCenterOffsetRem(count: number, index: number): number {
  const center = (count - 1) / 2
  return (index - center) * TILE_STEP_REM
}

function ShardVisual({ state }: { state: SwarmNodeRunState }) {
  if (state === "running") {
    return (
      <LogoLoader variant="circles" tone="soft" size={36} className="scale-shard-loader" />
    )
  }
  return <AgentRobotIcon size={35} blinkOnHover={state === "idle"} />
}

/**
 * Fan-out tiles absolutely positioned around the anchor node.
 * Container keeps collapsed size so React Flow handles / edges stay aligned.
 */
export default function ScalableAgentVisual({ count, phase, shardStates, selected }: Props) {
  const visibleCount = Math.max(count, 1)
  const collapsing = phase === "collapsing"

  return (
    <div className={`scale-visual${selected ? " scale-visual--on" : ""}`}>
      {Array.from({ length: visibleCount }, (_, index) => {
        const offsetRem = shardCenterOffsetRem(visibleCount, index)
        const state = shardStates[index] ?? "running"
        const zIndex = Math.max(1, 50 - Math.round(Math.abs(offsetRem * 10)))

        return (
          <div
            key={index}
            className={`scale-visual__shell${collapsing ? " scale-visual__shell--collapsing" : ""}`}
            style={{
              zIndex,
              transform: collapsing
                ? "translate(-50%, -50%) scale(0.72)"
                : `translate(-50%, calc(-50% + ${offsetRem}rem))`,
              animationDelay: collapsing ? undefined : `${index * 45}ms`,
            }}
          >
            <div className={`scale-visual__shard square${shardSquareModifier(state)}`}>
              <ShardVisual state={state} />
            </div>
          </div>
        )
      })}

      <style jsx>{`
        .scale-visual {
          position: relative;
          width: ${TILE_SIZE_REM}rem;
          height: ${TILE_SIZE_REM}rem;
          flex: 0 0 auto;
          overflow: visible;
        }
        .scale-visual__shell {
          position: absolute;
          left: 50%;
          top: 50%;
          display: flex;
          padding: 0.25rem;
          background: #c5bdcd;
          border-radius: ${CANVAS_NODE_CIRCLE_RADIUS};
          opacity: 1;
          animation: scale-shard-in 0.34s cubic-bezier(0.22, 1, 0.36, 1) both;
          transition:
            opacity 0.32s ease,
            transform 0.38s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .scale-visual__shell--collapsing {
          opacity: 0;
        }
        .scale-visual__shard {
          --agent-robot-eye-fill: var(--app-text);
          display: flex;
          align-items: center;
          justify-content: center;
          width: 4rem;
          height: 4rem;
          flex-shrink: 0;
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
        .scale-visual--on .scale-visual__shard {
          --agent-robot-eye-fill: var(--app-surface);
          border-color: var(--app-text);
          box-shadow: 0 0 0 2px color-mix(in srgb, var(--app-text) 18%, transparent);
          background: var(--app-surface);
          color: var(--app-text);
        }
        .scale-visual__shard :global(.scale-shard-loader) {
          color: currentColor;
        }
        @keyframes scale-shard-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
        @media (prefers-reduced-motion: reduce) {
          .scale-visual__shell {
            animation: none;
            transition: none;
          }
        }
        ${NODE_RUN_SQUARE_STYLES}
      `}</style>
    </div>
  )
}
