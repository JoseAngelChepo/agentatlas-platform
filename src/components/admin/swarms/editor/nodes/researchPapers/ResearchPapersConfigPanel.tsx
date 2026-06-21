"use client"

import NodeConfigPanelShell from "../shared/NodeConfigPanelShell"
import type { ControlNodeConfigPanelProps } from "../registry/types"
import type { ResearchPapersNodeData } from "./data"
import ResearchPapersConfigForm from "./ResearchPapersConfigForm"
import { RESEARCH_PAPERS_NODE_META } from "./definition"

export default function ResearchPapersConfigPanel({
  nodeId,
  data,
  onChange,
  onClose,
  onDeleteNode,
  graph,
  workerById,
}: ControlNodeConfigPanelProps<ResearchPapersNodeData>) {
  return (
    <NodeConfigPanelShell
      title={RESEARCH_PAPERS_NODE_META.label}
      description={RESEARCH_PAPERS_NODE_META.description}
      onClose={onClose}
      onDeleteNode={onDeleteNode}
    >
      <ResearchPapersConfigForm
        data={data}
        onChange={onChange}
        nodeId={nodeId}
        graph={graph}
        workerById={workerById}
      />
    </NodeConfigPanelShell>
  )
}
