"use client"

import type { ReactNode } from "react"
import { TbClockPause } from "react-icons/tb"
import LogoLoader from "@/components/ui/LogoLoader"
import { useSwarmEditor, type SwarmNodeRunState } from "../../SwarmEditorContext"

type Props = {
  nodeId: string
  icon: ReactNode
  /** Spinner size for worker/agent tiles (default icon size is 28). */
  loaderSize?: "default" | "large"
}

export function useNodeRunState(nodeId: string): SwarmNodeRunState {
  const { nodeRunStates } = useSwarmEditor()
  return nodeRunStates[nodeId] ?? "idle"
}

/** Swaps the node icon for a loader (or waiting glyph) during live swarm runs. */
export default function NodeRunVisual({ nodeId, icon, loaderSize = "default" }: Props) {
  const runState = useNodeRunState(nodeId)

  if (runState === "running") {
    return (
      <span className="node-run-loader">
        <LogoLoader
          variant="circles"
          tone="soft"
          size={loaderSize === "large" ? 36 : 30}
          className="node-run-logo-loader"
        />
        <style jsx>{`
          .node-run-loader {
            display: inline-flex;
            align-items: center;
            justify-content: center;
          }
          .node-run-loader :global(.node-run-logo-loader) {
            color: currentColor;
          }
        `}</style>
      </span>
    )
  }

  if (runState === "waiting") {
    return <TbClockPause size={loaderSize === "large" ? 32 : 28} aria-hidden />
  }

  return <>{icon}</>
}

export function nodeRunSquareModifier(runState: SwarmNodeRunState): string {
  return runState === "idle" ? "" : ` square--run-${runState}`
}
