# Swarm workspace — agent & sub-swarm tools (UI)

How **agentatlas-platform** configures OpenAI function tools on workers in the swarm editor (**Configure agent** panel). Backend contract: **`agentatlas-services/docs/TOOLS.md`**.

**Related:** [`SWARMS-WORKSPACE.md`](../../agentatlas-services/docs/SWARMS-WORKSPACE.md) (workspace API), [`INFERENCE.md`](../../agentatlas-services/docs/INFERENCE.md) (tool loop + prompt assembly).

---

## Where in the UI

| Location | Component |
|----------|-----------|
| Swarm editor → click worker node → **Configure agent** | `SwarmWorkerPanel.tsx` |
| **Tools** section (OpenAI Direct only) | `AgentToolsSection.tsx` |
| **Sub-swarms** nested list | `SwarmToolsSection.tsx` |

Requires worker **`model.provider: openai_direct`** (official OpenAI API). Grok workers use `GrokToolsSection` instead (`grokTools`).

---

## API fields

| UI | PATCH field | Source |
|----|-------------|--------|
| Web search toggle | `openaiTools.webSearch` | Hosted OpenAI Responses tool |
| Platform tools (Firecrawl scrape/search/research, `run_swarm`) | `agentTools: string[]` | `GET /inference/setup` → `agentTools.catalog` |
| Sub-swarm picker | `swarmTools: string[]` | Workspace `referencedSwarms` (MongoDB swarm ids) |

Save path: `PATCH /agent-workers/:id` via `SwarmWorkerPanel` → `onSave`.

---

## Helpers (`src/lib/`)

| File | Purpose |
|------|---------|
| `agent-tools.ts` | `AgentToolId`, `parseAgentToolIds`, `shouldExposeRunSwarmTool`, `agentToolsForSave` |
| `swarm-tool-utils.ts` | `parseSwarmToolIds`, `swarmToolFunctionName()` → `swarm_<objectId>` |
| `openai-worker-tools.ts` | Merge `openaiTools` payload with enabled agent tools |

### `shouldExposeRunSwarmTool(agentTools, swarmToolIds)`

Mirrors backend `src/tools/utils/split-registry-agent-tool-ids.ts`:

- Returns `true` only when `run_swarm` is in `agentTools` **and** `swarmTools` is empty.
- When `swarmTools` has ids, generic `run_swarm` is **not** sent to the model at inference time.

### `agentToolsForSave(agentTools, swarmToolIds)`

Strips redundant `run_swarm` from the PATCH body when sub-swarms are configured — keeps MongoDB aligned with runtime behavior.

---

## UX rules (implemented)

### 1. Sub-swarms always visible

The **Sub-swarms** section is shown for all OpenAI Direct workers. You do **not** need to enable `run_swarm` first to add the first child swarm.

### 2. Prefer `swarmTools` over `run_swarm`

| Config | Runtime |
|--------|---------|
| `swarmTools: ["<id>"]` | One function `swarm_<id>` with swarm name + description |
| `agentTools: ["run_swarm"]`, `swarmTools: []` | Generic `run_swarm` (model supplies `swarmId`) |
| Both | Only `swarm_<id>` functions — `run_swarm` omitted |

### 3. Redundant `run_swarm` feedback

If the worker still lists `run_swarm` in `agentTools` while `swarmTools` is non-empty:

- **Badge:** “Not used at runtime” on the `run_swarm` row (dashed border).
- **On add sub-swarm:** `run_swarm` is removed from the local draft immediately.
- **On save:** `agentToolsForSave()` removes it from the persisted payload.

### 4. Hints

`SwarmToolsSection` copy explains that each sub-swarm becomes `swarm_<id>` and that generic `run_swarm` is skipped when sub-swarms are listed.

---

## What the backend adds automatically

The platform does **not** edit Instructions to document tools manually. At run time the API appends a **Connected tools** block to the worker `systemPrompt` (visible in run debug → **Messages** → `[system]`).

See **`agentatlas-services/docs/TOOLS.md#connected-tools-prompt-block`**.

Do not confuse with **`{{runInput.toolsAvailable}}`** — that token is the platform **integration catalog** (Gmail, Slack, …), not agent/swarm function tools.

---

## Recommended worker config

**Delegate to a fixed child swarm:**

```json
{
  "agentTools": [],
  "swarmTools": ["6a2b994f609bebf67927c242"]
}
```

**Child swarm + Firecrawl tools:**

```json
{
  "agentTools": ["webpage_scrape", "web_search", "research_search_papers"],
  "swarmTools": ["6a2b994f609bebf67927c242"]
}
```

**Model picks any swarm by id** (no fixed list):

```json
{
  "agentTools": ["run_swarm"],
  "swarmTools": []
}
```

Ensure child swarms have `promptMessages` (e.g. `{ "role": "user", "content": "{{runInput.message}}" }`) so tool calls with `{}` still receive the user question (backend passthrough).

---

## Catalog loading

`SwarmWorkerPanel` loads `GET /inference/setup` for:

- Provider/model pickers
- `agentTools.catalog` (id, name, description, `configured`)

All known tool ids from `src/lib/agent-tools.ts` appear in the **+** menu (`mergeAgentToolsCatalog`). Tools with `configured: false` (e.g. Firecrawl tools without `FIRECRAWL_API_KEY`) show a **Not configured** badge but can still be added to the worker draft.

---

## Future enhancements

- [ ] Preview assembled Instructions + Connected tools block before run
- [ ] Warn when adding `run_swarm` while sub-swarms are already listed (toast instead of silent strip)
