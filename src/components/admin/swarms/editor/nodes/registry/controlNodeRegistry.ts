import { endNodeDefinition } from "../end/definition"
import { ifElseNodeDefinition } from "../ifelse/definition"
import { whileNodeDefinition } from "../while/definition"
import { scraperNodeDefinition } from "../scraper/definition"
import { researchPapersNodeDefinition } from "../researchPapers/definition"
import { swarmNodeDefinition } from "../swarm/definition"
import { startNodeDefinition } from "../start/definition"
import { userApprovalNodeDefinition } from "../userApproval/definition"
import type { ControlNodeDefinition, ControlNodePaletteItem } from "./types"

/** All control-flow node definitions. Add new nodes here. */
export const CONTROL_NODE_DEFINITIONS = [
  startNodeDefinition,
  ifElseNodeDefinition,
  whileNodeDefinition,
  scraperNodeDefinition,
  researchPapersNodeDefinition,
  swarmNodeDefinition,
  userApprovalNodeDefinition,
  endNodeDefinition,
] as const

export type ControlNodeDefinitionEntry = (typeof CONTROL_NODE_DEFINITIONS)[number]

export type ControlNodeKind = ControlNodeDefinitionEntry["kind"]

export const CONTROL_NODE_PALETTE: ControlNodePaletteItem[] = CONTROL_NODE_DEFINITIONS.map(
  (def) => ({
    kind: def.kind,
    type: def.flowType,
    label: def.label,
    description: def.description,
    icon: def.icon,
    buildData: def.buildDefaultData,
  }),
)

type AnyControlNodeDefinition = ControlNodeDefinition<Record<string, unknown>>

const byKind = new Map<string, AnyControlNodeDefinition>()
const byFlowType = new Map<string, AnyControlNodeDefinition>()
for (const def of CONTROL_NODE_DEFINITIONS) {
  byKind.set(def.kind, def as unknown as AnyControlNodeDefinition)
  byFlowType.set(def.flowType, def as unknown as AnyControlNodeDefinition)
}

export function getControlNodeDefinition(
  kind: ControlNodeKind,
): AnyControlNodeDefinition | undefined {
  return byKind.get(kind)
}

export function getControlNodeDefinitionByFlowType(
  flowType: string,
): AnyControlNodeDefinition | undefined {
  return byFlowType.get(flowType)
}

/** React Flow `nodeTypes` entries for control nodes only. */
export const CONTROL_FLOW_NODE_TYPES = Object.fromEntries(
  CONTROL_NODE_DEFINITIONS.map((def) => [def.flowType, def.CanvasNode]),
) as Record<string, ControlNodeDefinition["CanvasNode"]>
