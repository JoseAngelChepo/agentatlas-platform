---
name: agentatlas-swarms
description: >-
  Design, edit, run, and debug multi-agent swarms on agentatlas. Use when the
  user mentions swarms, swarm graphs, agent workers, topology, test runs, SSE
  traces, sub-swarms, control nodes, or agentatlas platform/API contracts.
---

# agentatlas — Swarm skill

Platform to **design, test, and compare multi-agent swarm architectures** — not a framework wrapper. Pick a topology, wire workers on a graph, run with real models, inspect traces.

**Public skill URL:** `{APP_URL}/skill.md`

**Repos (sibling folders):**

| Repo | Role |
|------|------|
| `agentatlas-platform` | Next.js UI — landing, auth, swarm editor, test panel, admin |
| `agentatlas-services` | NestJS API — `/api/v1`, orchestrator, inference, tools |

---

## Core concepts

| Term | Meaning |
|------|---------|
| **Swarm** | Named task: `goal`, `topology` metadata, worker refs |
| **AgentWorker** | Reusable agent blueprint: model, prompts, I/O schemas — **no graph edges** |
| **SwarmGraph** | Directed graph: worker nodes + control nodes + edges |
| **SwarmRun** | One execution (user input → final output) |
| **AgentRun** | One worker invocation inside a run |
| **SwarmContext** | In-memory run state: `goal`, `runInput`, `shared`, per-worker outputs |

**Rule:** specialized workers connected by the graph beat one monolithic prompt.

---

<!-- architecture-catalog:start -->

## Architecture patterns (catalogue)

Map intent to graph shape before picking LangGraph, AutoGen, CrewAI, or a custom runtime. Start with topology — then add cooperation and verification patterns inside workers.

### Supervisor / Router (Popular)

**Category:** Orchestration · **Layer:** topology

One coordinator routes work to specialists and merges results.

A hub worker classifies or decomposes incoming work, delegates to specialist workers, and synthesizes their outputs. Edges fan out from the supervisor and converge on a merge or final responder.

**Problem:** Monolithic prompts hide routing logic and make it hard to swap specialists without rewriting the whole system.

**When to use:**
- Tasks decompose into distinct specialist roles (research, code, review).
- You need a single owner for routing, retries, and final packaging.
- Specialists can run with different models or tool sets.

**When not to use:**
- Every step must run in strict order with no branching.
- Routing is trivial enough for one worker with tools.
- Latency-sensitive paths where parallel fan-out is mandatory from the start.

**Forces:**
- Clear ownership at the hub
- Low coupling between specialists
- Easy to add or replace a specialist node

| Verification | Traceability | Latency | Cost |
|---|---|---|---|
| 3 | 4 | 3 | 3 |

**Agents:** 1 supervisor + 2–4 specialists (typical 3–8)

**Graph:** Nodes: supervisor, specialist_a, specialist_b, merge. Edges: supervisor → specialist_a; supervisor → specialist_b; specialist_a → merge; specialist_b → merge.

**Framework notes:**
- **LangGraph:** Supervisor node with conditional edges to worker subgraphs; merge via reduce or final LLM node.
- **AutoGen:** Group chat with a manager agent delegating to nested chats or registered agents.
- **LangChain τ-bench:** Maps to the supervisor / swarm routing benchmark topology.


**Evidence:** Common default in LangGraph tutorials and τ-bench swarm comparisons.


**References:** [LangGraph multi-agent supervisor](https://langchain-ai.github.io/langgraph/); [τ-bench agent architectures](https://arxiv.org/abs/2406.08625)

---

### Pipeline + Critic

**Category:** Quality · **Layer:** topology

Plan, execute, then verify — each stage owns a narrow job.

Workers run in series: plan or spec, execute the main task, then a critic or verifier gates output before release. Control flow is mostly linear with an optional loop back on failure.

**Problem:** Single-pass generation skips explicit quality gates and makes regressions hard to catch before users see output.

**When to use:**
- High traceability — each stage has a named artifact.
- Outputs must pass checks (policy, tests, rubric) before shipping.
- Errors should loop back to an earlier stage with structured feedback.

**When not to use:**
- Subtasks are fully independent and can run in parallel.
- Verification is cheap enough to embed in one worker prompt.
- End-to-end latency dominates and serial stages are too slow.

**Forces:**
- Strong stage boundaries and audit trail
- Explicit verify / retry loop
- Higher latency than parallel fan-out

| Verification | Traceability | Latency | Cost |
|---|---|---|---|
| 5 | 5 | 2 | 4 |

**Agents:** planner + executor + critic (typical 3–6)

**Graph:** Nodes: plan, execute, critic, output. Edges: plan → execute; execute → critic; critic → output (pass); critic → execute (revise).

**Framework notes:**
- **LangGraph:** Linear StateGraph with conditional edge from critic back to execute.
- **AutoGen:** Sequential chat or nested critic agent after primary completion.
- **CrewAI:** Task chain with explicit review task and output guardrails.


**Evidence:** Aligns with plan–execute–verify loops in production coding agents.


**References:** [CSIRO agentic workflow patterns (2405.10467)](https://arxiv.org/abs/2405.10467)

---

### Parallel fan-out

**Category:** Throughput · **Layer:** topology

Fan work out to parallel workers, then merge downstream.

A router or splitter sends independent subtasks to parallel workers. A synthesizer or reducer merges partial results into one response. Maximizes throughput when subtasks do not depend on each other mid-flight.

**Problem:** Serial pipelines waste wall-clock time when subtasks could run concurrently with separate context windows.

**When to use:**
- Subtasks are independent (multi-source research, parallel tool calls).
- Wall-clock latency matters more than minimum token spend.
- Merge logic is well defined (concat, vote, LLM synthesize).

**When not to use:**
- Later steps need intermediate results from earlier parallel branches in real time.
- Merge quality is fragile and needs heavy sequential refinement.
- Cost budget is tight — parallel LLM calls multiply spend.

**Forces:**
- Best wall-clock latency for divisible work
- Higher aggregate cost than a single worker
- Merge step is a common failure point

| Verification | Traceability | Latency | Cost |
|---|---|---|---|
| 3 | 3 | 5 | 4 |

**Agents:** router + 2–5 workers + merge (typical 3–10)

**Graph:** Nodes: router, worker_a, worker_b, worker_c, merge. Edges: router → worker_a; router → worker_b; router → worker_c; worker_a → merge; worker_b → merge; worker_c → merge.

**Framework notes:**
- **LangGraph:** Send API or parallel branches from a fan-out node into a reduce node.
- **AutoGen:** Concurrent agent replies collected by a synthesizer.
- **CrewAI:** Parallel task execution with a final aggregation task.


**Evidence:** Standard pattern for map-reduce style agent workflows.


**References:** [Map-reduce agents (LangGraph)](https://langchain-ai.github.io/langgraph/)


---

## Extended patterns (skill catalogue)

Additional topologies documented for agents — not shown on the landing grid yet.

### Series (pipeline)

**Category:** Refinement · **Layer:** topology

Sequential refinement — each worker passes output to the next (`A → B → C → D`).

Workers run in a strict chain with no parallel branches. Each stage transforms or enriches the artifact from the previous step. Simpler than Pipeline + Critic when you do not need an explicit verify loop.

**Problem:** One-shot generation cannot iteratively refine context — later steps lack structured handoffs from earlier specialists.

**When to use:**
- Work naturally decomposes into ordered phases (draft → expand → polish).
- Each stage needs the full prior artifact, not partial parallel results.
- Branching and merge logic would add complexity without benefit.

**When not to use:**
- Subtasks are independent and could run concurrently.
- You need explicit quality gates or revision loops between stages.
- A single worker with tools can cover the whole chain cheaply.

**Forces:**
- Maximum traceability per stage
- Wall-clock time sums across stages
- Easy to reason about and debug

| Verification | Traceability | Latency | Cost |
|---|---|---|---|
| 3 | 4 | 2 | 3 |

**Agents:** 3–4 chained specialists (typical 2–6)

**Graph:** Nodes: a, b, c, d. Edges: a → b; b → c; c → d.

**Framework notes:**
- **LangGraph:** Linear StateGraph — each node reads prior state and writes the next field.
- **AutoGen:** Sequential chat or chained agent handoffs.
- **CrewAI:** Tasks with explicit `context` from prior task outputs.


**Evidence:** Baseline pattern in CSIRO sequential workflow catalogue.


**References:** [CSIRO agentic workflow patterns (2405.10467)](https://arxiv.org/abs/2405.10467)

---

### Parallel + synthesizer

**Category:** Analysis · **Layer:** topology

Independent analyses in parallel, then one synthesizer merges perspectives.

A router fans out to parallel analyst workers (research, code review, risk, etc.). A dedicated synthesizer worker merges divergent outputs into one coherent answer — stronger emphasis on merge quality than raw throughput fan-out.

**Problem:** Single-perspective analysis misses contradictions; concatenating parallel outputs produces incoherent bundles.

**When to use:**
- You need multiple independent lenses on the same input.
- Merge quality matters — synthesis is a first-class step, not an afterthought.
- Analysts can disagree; the synthesizer resolves or ranks findings.

**When not to use:**
- Parallel branches produce identical artifact types that only need concatenation.
- Synthesis is trivial enough for the router to handle inline.
- Cost of N analysts plus a synthesizer exceeds budget.

**Forces:**
- Richer coverage than one monolithic analyst
- Synthesizer is the quality bottleneck
- Higher cost than parallel fan-out without dedicated merge

| Verification | Traceability | Latency | Cost |
|---|---|---|---|
| 4 | 4 | 4 | 5 |

**Agents:** router + 2–4 analysts + synthesizer (typical 4–10)

**Graph:** Nodes: router, analyst_a, analyst_b, analyst_c, synthesizer. Edges: router → analyst_a; router → analyst_b; router → analyst_c; analyst_a → synthesizer; analyst_b → synthesizer; analyst_c → synthesizer.

**Framework notes:**
- **LangGraph:** Map-reduce with a dedicated reduce/s synthesizer node and structured analyst outputs.
- **AutoGen:** Parallel nested chats feeding a summarizer agent.
- **CrewAI:** Parallel tasks converging on a final aggregation task with rubric.


**Evidence:** Common in multi-source research and due-diligence agent demos.


---

### Hybrid

**Category:** Complex workflows · **Layer:** topology

Mixed control flow — parallel branches, conditionals, and sequential stages in one graph.

Combines routing, parallel fan-out, if/else control nodes, and serial refinement in a single swarm. Use when real tasks need different shapes in different phases — not one pure topology end to end.

**Problem:** Forcing a pure supervisor, pipeline, or fan-out pattern onto heterogeneous workflows creates awkward workarounds and hidden state.

**When to use:**
- Phases differ: e.g. parallel research → sequential draft → conditional deploy path.
- Control nodes (if/else, while) belong between worker stages.
- You have test traces proving which branches fire in production.

**When not to use:**
- A simpler topology covers 90% of runs — start there first.
- Team cannot maintain or debug multi-shape graphs yet.
- No observability — hybrid flows fail silently in unexpected branches.

**Forces:**
- Highest expressiveness for real-world tasks
- Hardest to test and document
- Requires strong trace inspection in agentatlas test panel

| Verification | Traceability | Latency | Cost |
|---|---|---|---|
| 4 | 4 | 3 | 4 |

**Agents:** router + parallel block + serial tail + controls (typical 5–12)

**Graph:** Nodes: router, parallel_block, ifelse, serial_tail, output. Edges: router → parallel_block; parallel_block → ifelse; ifelse → serial_tail (pass); ifelse → router (retry); serial_tail → output.

**Framework notes:**
- **LangGraph:** Compose subgraphs — parallel Send blocks, conditional edges, nested StateGraphs.
- **AutoGen:** Mix group chat routing with nested sequential teams.
- **agentatlas:** Use control nodes (if/else, while) between worker nodes; validate `sourceHandle` on branch edges.


**Evidence:** Production swarms often evolve into hybrid graphs after v1 linear or supervisor designs.


**References:** [AutoGen conversation patterns](https://microsoft.github.io/autogen/docs/tutorial/conversation-patterns)


Sweet spot: **3–7 workers**. Avoid filler agents (format-only steps → use functions, not workers).

<!-- architecture-catalog:end -->

---

## Platform routes (UI)

| Route | Purpose |
|-------|---------|
| `/dashboard/swarms` | User swarm list + editor |
| `/admin/swarms` | Admin swarms |
| `/admin/users` | User management |

**Editor layout:** canvas (React Flow) + inspector (node config) + test panel (right, streaming runs).

---

## Control nodes (graph palette)

Branch edges **must** use `sourceHandle` (validated on save).

| Palette | `kind` | Handles |
|---------|--------|---------|
| Start | `start` | target → downstream |
| If / else | `ifelse` | target; sources `case-<id>`, `else` |
| While | `while` | target; sources `loop`, `done` |
| Web scrape | `scraper` | target; sources `success`, `failed` |
| Sub-swarm | `swarm` | target; sources `success`, `failed` |
| User approval | `user_approval` | target; sources `approve`, `reject` |
| End | `end` | target only |

Platform editor code: `agentatlas-platform/src/components/admin/swarms/editor/`.

---

## API essentials

**Base:** `{API_URL}/api/v1` · **Auth:** `Authorization: Bearer <access_token>`

| Action | Method | Endpoint |
|--------|--------|----------|
| Load editor | GET | `/swarms/:id/workspace` |
| Save graph | PUT | `/swarms/:id/graph` |
| Save worker | PATCH | `/agent-workers/:workerId` |
| Test one worker | POST | `/agent-workers/:workerId/run` |
| Run swarm (sync) | POST | `/swarms/:id/run` |
| Run swarm (SSE) | POST | `/swarms/:id/run/stream` |
| Run steps | GET | `/swarm-runs/:runId/agent-runs` |
| Inference catalog | GET | `/inference/setup` |

Prefer **`GET /swarms/:id/workspace`** for one-round-trip bootstrap (`swarm`, `graph`, `workers`, `referencedSwarms`).

---

## Worker tools (OpenAI Direct)

Configured in **Configure agent** panel (`AgentToolsSection`, `SwarmToolsSection`).

| UI | PATCH field | Notes |
|----|-------------|-------|
| Web search | `openaiTools.webSearch` | Hosted OpenAI Responses tool |
| Platform tools | `agentTools: string[]` | e.g. `webpage_scrape`, `web_search`, `research_*`, `run_swarm` |
| Sub-swarms | `swarmTools: string[]` | Exposes `swarm_<objectId>` per child |

**Prefer `swarmTools` over generic `run_swarm`** when child swarms are known. Generic `run_swarm` is omitted at runtime when `swarmTools` is non-empty.

Requires worker `model.provider: openai_direct` for standard agent tools panel.

---

## Inference

`INFERENCE_MODE`: `auto` (default) | `llm` | `stub`.

Worker `model.provider` routes to OpenAI, Anthropic, OpenRouter, Gemini, Grok, Ollama, etc. See `agentatlas-services/docs/INFERENCE.md`.

Test panel streams SSE events: worker logs, token usage, approval checkpoints.

---

## Prompt / context tokens

Available in Instructions via `AgentWorkerRunInput`:

- `{{goal}}` — swarm objective
- `{{runInput.*}}` — caller payload
- `{{shared.*}}` — cross-worker run state
- Upstream worker outputs via graph edges (default: isolated upstream)

Avoid infinite loops: While nodes use `maxIterations`; orchestrator has `maxNodeVisits`.

---

## Workflow for agents helping users

1. **Clarify intent** — verification needs, risk, latency, human gates.
2. **Pick pattern** — supervisor, pipeline, fan-out, or hybrid.
3. **Model graph** — Start → workers/control nodes → End; wire `sourceHandle` on branches.
4. **Configure workers** — model provider, prompts, I/O schemas, tools/sub-swarms.
5. **Test** — `POST …/run/stream`; inspect agent runs and traces.
6. **Iterate** — duplicate swarm, tweak prompts, compare traces as evidence.

---

## Deep reference (read when implementing)

| Doc | Location |
|-----|----------|
| Data model + orchestrator | `agentatlas-services/docs/SWARMS.md` |
| Editor API contract | `agentatlas-services/docs/SWARMS-WORKSPACE.md` |
| HTTP reference | `agentatlas-services/docs/SWARMS-API.md` |
| Agent I/O contracts | `agentatlas-services/docs/SWARMS-AGENT-IO.md` |
| Tools runtime | `agentatlas-services/docs/TOOLS.md` |
| Inference | `agentatlas-services/docs/INFERENCE.md` |
| Editor control nodes | `agentatlas-platform/docs/SWARMS-EDITOR.md` |
| Tools UI | `agentatlas-platform/docs/SWARMS-TOOLS.md` |

---

## Agent behavior on this codebase

- Product scope is swarms only — graph editor, test harness, and agent skill documentation.
- Verify HTTP DTOs in **agentatlas-services** before changing the client.
- API client: `agentatlas-platform/src/data/api/server/index.ts` (`createServices()`).
- Minimize scope; match existing editor patterns under `src/components/admin/swarms/`.
