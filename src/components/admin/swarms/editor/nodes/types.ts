import type { AgentNodeType } from "./agent"
import type { EndNodeType } from "./end"
import type { IfElseNodeType } from "./ifelse"
import type { WhileNodeType } from "./while"
import type { ScraperNodeType } from "./scraper"
import type { ResearchPapersNodeType } from "./researchPapers"
import type { SwarmNodeType } from "./swarm"
import type { StartNodeType } from "./start"
import type { UserApprovalNodeType } from "./userApproval"

/** Union of every node shape on the swarm editor canvas. */
export type EditorNode =
  | AgentNodeType
  | StartNodeType
  | IfElseNodeType
  | WhileNodeType
  | ScraperNodeType
  | ResearchPapersNodeType
  | SwarmNodeType
  | UserApprovalNodeType
  | EndNodeType

export function isAgentNode(node: EditorNode): node is AgentNodeType {
  return node.type === "agent"
}

export function isControlFlowNode(
  node: EditorNode,
): node is StartNodeType | IfElseNodeType | WhileNodeType | ScraperNodeType | ResearchPapersNodeType | SwarmNodeType | UserApprovalNodeType | EndNodeType {
  return node.type !== "agent"
}
