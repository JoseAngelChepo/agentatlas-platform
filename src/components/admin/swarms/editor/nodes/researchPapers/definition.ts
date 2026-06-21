import type { NodeProps } from "@xyflow/react"
import type { ComponentType } from "react"
import { TbBook2 } from "react-icons/tb"
import type { ControlNodeDefinition } from "../registry/types"
import { buildResearchPapersNodeData, type ResearchPapersNodeData } from "./data"
import ResearchPapersCanvasNode from "./ResearchPapersCanvasNode"
import ResearchPapersConfigPanel from "./ResearchPapersConfigPanel"

export const RESEARCH_PAPERS_NODE_KIND = "research_papers" as const
export const RESEARCH_PAPERS_FLOW_TYPE = "research_papers" as const

export const RESEARCH_PAPERS_NODE_META = {
  label: "Research papers",
  description: "Search academic papers and branch on success or failure",
} as const

export const researchPapersNodeDefinition: ControlNodeDefinition<ResearchPapersNodeData> = {
  kind: RESEARCH_PAPERS_NODE_KIND,
  flowType: RESEARCH_PAPERS_FLOW_TYPE,
  icon: TbBook2,
  ...RESEARCH_PAPERS_NODE_META,
  buildDefaultData: buildResearchPapersNodeData,
  CanvasNode: ResearchPapersCanvasNode as ComponentType<NodeProps>,
  ConfigPanel: ResearchPapersConfigPanel,
}
