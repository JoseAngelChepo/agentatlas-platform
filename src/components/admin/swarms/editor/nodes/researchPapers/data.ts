export type ResearchPapersQuerySource = "runInput" | "upstream" | "static"

export type ResearchPapersNodeData = {
  label?: string
  querySource: ResearchPapersQuerySource
  /** Key under `runInput` when `querySource` is `runInput`, or field path under `upstream.*`. */
  queryPath?: string
  /** Fixed query when `querySource` is `static`. */
  query?: string
  limit?: number
}

export const RESEARCH_PAPERS_SUCCESS_HANDLE = "success"
export const RESEARCH_PAPERS_FAILED_HANDLE = "failed"

export function buildResearchPapersNodeData(): ResearchPapersNodeData {
  return {
    querySource: "runInput",
    queryPath: "query",
    limit: 10,
  }
}
