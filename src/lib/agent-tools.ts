/** Mirrors `agentatlas-services` `ToolId`. */
export const AGENT_TOOL_IDS = [
  "webpage_scrape",
  "web_search",
  "research_search_papers",
  "research_paper",
  "research_related_papers",
  "research_search_github",
  "run_swarm",
] as const

export type AgentToolId = (typeof AGENT_TOOL_IDS)[number]

export type AgentToolCatalogEntry = {
  id: AgentToolId
  name: string
  description: string
  configured: boolean
}

export type AgentToolMenuGroup = "web" | "research" | "orchestration"

const MENU_GROUP_BY_ID: Record<AgentToolId, AgentToolMenuGroup> = {
  webpage_scrape: "web",
  web_search: "web",
  research_search_papers: "research",
  research_paper: "research",
  research_related_papers: "research",
  research_search_github: "research",
  run_swarm: "orchestration",
}

export function agentToolMenuGroup(id: AgentToolId): AgentToolMenuGroup {
  return MENU_GROUP_BY_ID[id]
}

/** Fallback labels when `GET /inference/setup` is stale or unavailable. */
const AGENT_TOOL_DEFAULTS: Record<
  AgentToolId,
  Pick<AgentToolCatalogEntry, "name" | "description">
> = {
  webpage_scrape: {
    name: "Webpage scrape",
    description: "Fetch a public URL via Firecrawl and return markdown JSON.",
  },
  web_search: {
    name: "Web search",
    description: "Search the web and return results with markdown content.",
  },
  research_search_papers: {
    name: "Research papers",
    description: "Search academic papers by topic, author, or category.",
  },
  research_paper: {
    name: "Research paper (read)",
    description: "Inspect paper metadata or read passages for a question.",
  },
  research_related_papers: {
    name: "Research related papers",
    description: "Expand from a seed paper (similar, citers, references).",
  },
  research_search_github: {
    name: "Research — search GitHub",
    description: "Search GitHub issues, PRs, discussions, and READMEs.",
  },
  run_swarm: {
    name: "Run swarm",
    description: "Execute any accessible swarm by MongoDB id.",
  },
}

type BackendCatalogRow = {
  id: string
  name?: string
  description?: string
  configured?: boolean
}

const FIRECRAWL_TOOL_IDS = new Set<AgentToolId>([
  "webpage_scrape",
  "web_search",
  "research_search_papers",
  "research_paper",
  "research_related_papers",
  "research_search_github",
])

function isFirecrawlTool(id: AgentToolId): boolean {
  return FIRECRAWL_TOOL_IDS.has(id)
}

/**
 * Merge backend catalog rows with the static tool list so every known tool
 * appears in Configure agent even when setup is cached or partially deployed.
 */
export function mergeAgentToolsCatalog(backendCatalog: BackendCatalogRow[]): AgentToolCatalogEntry[] {
  const byId = new Map<AgentToolId, BackendCatalogRow>()
  for (const entry of backendCatalog) {
    if (isAgentToolId(entry.id)) {
      byId.set(entry.id, entry)
    }
  }

  const firecrawlConfigured = AGENT_TOOL_IDS.filter(isFirecrawlTool).some(
    (id) => byId.get(id)?.configured === true,
  )

  return AGENT_TOOL_IDS.map((id) => {
    const fromBackend = byId.get(id)
    const defaults = AGENT_TOOL_DEFAULTS[id]
    const configured =
      fromBackend?.configured ??
      (isFirecrawlTool(id) ? firecrawlConfigured : id === "run_swarm")

    return {
      id,
      name: fromBackend?.name?.trim() || defaults.name,
      description: fromBackend?.description?.trim() || defaults.description,
      configured,
    }
  })
}

export function parseAgentToolIds(raw?: unknown): AgentToolId[] {
  if (!Array.isArray(raw)) return []

  const allowed = new Set<string>(AGENT_TOOL_IDS)
  const ids: AgentToolId[] = []

  for (const item of raw) {
    if (typeof item === "string" && allowed.has(item)) {
      ids.push(item as AgentToolId)
    }
  }

  return ids
}

export function isAgentToolId(value: string): value is AgentToolId {
  return (AGENT_TOOL_IDS as readonly string[]).includes(value)
}

/**
 * Mirrors backend `shouldExposeRunSwarmTool` — generic `run_swarm` is omitted when
 * the worker lists dedicated sub-swarms in `swarmTools`.
 */
export function shouldExposeRunSwarmTool(
  agentTools: AgentToolId[],
  swarmToolIds: string[],
): boolean {
  return agentTools.includes("run_swarm") && swarmToolIds.length === 0
}

export function agentToolsForSave(
  agentTools: AgentToolId[],
  swarmToolIds: string[],
): AgentToolId[] {
  if (swarmToolIds.length === 0) return agentTools
  return agentTools.filter((id) => id !== "run_swarm")
}
