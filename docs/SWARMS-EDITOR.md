# Swarm editor — control nodes

Platform implementation: `src/components/admin/swarms/editor/`. Runtime contracts: **`agentatlas-services/docs/SWARMS.md`** and **`SWARMS-WORKSPACE.md`**.

## Adding a control node

1. Create `src/components/admin/swarms/editor/nodes/<kind>/` (`data.ts`, `definition.ts`, canvas, config panel).
2. Register in `nodes/registry/controlNodeRegistry.ts`.
3. Wire serialize/deserialize in `SwarmEditorCanvas.tsx` and `src/lib/swarm-graph-api.ts`.
4. Extend API types in `src/data/api/server/swarms.ts`.

Palette entries come from `CONTROL_NODE_DEFINITIONS` automatically.

## Control nodes (palette)

| Palette | `kind` | Flow type | Handles |
|---------|--------|-----------|---------|
| Start | `start` | `start` | target → downstream |
| If / else | `ifelse` | `ifelse` | target; sources `case-<id>`, `else` |
| **While** | `while` | `while` | target; sources `loop`, `done` |
| Web scrape | `scraper` | `scraper` | target; sources `success`, `failed` |
| Research papers | `research_papers` | `research_papers` | target; sources `success`, `failed` |
| Sub-swarm | `swarm` | `swarm` | target; sources `success`, `failed` |
| User approval | `user_approval` | `user_approval` | target; sources `approve`, `reject` |
| End | `end` | `end` | target only |

Branch edges **must** use `sourceHandle` (validated on save). Connecting from the node body shows a toast error.

---

## While node

**Code:** `src/components/admin/swarms/editor/nodes/while/`

**Purpose:** Repeat a subgraph while `data.condition` is truthy. Exit via the **Done** port when the condition becomes false.

### Canvas

- Icon: repeat (`TbRepeat`)
- **Loop** (top right): wire to the first node of the body
- **Done** (bottom right): wire to the path after the loop
- Last node in the body must reconnect to the While **target** (back-edge)

### Config panel

| Field | `data` key | Notes |
|-------|------------|-------|
| Condition | `condition` | Simple builder or Code (`InstructionsEditor`) |
| Code mode | `useCode` | Editor only; backend reads `condition` |
| Max iterations | `maxIterations` | Default 50; orchestrator safety cap |

Condition helpers are shared with if/else (`parseIfElseCondition`, `buildIfElseConditionFieldOptions` in `src/lib/swarm-graph-vars.ts`).

### Persisted graph shape

```json
{
  "id": "while-retry",
  "kind": "while",
  "position": { "x": 320, "y": 160 },
  "data": {
    "condition": "runInput.attempts < 3",
    "maxIterations": 50
  }
}
```

### Minimal test graph

```text
Start → Agent A → While ──loop──→ Agent B ──┐
                      └──done──→ End         │
                      ↑______________________|
```

1. Place **While** from the palette after **Agent A**.
2. Set condition (Code example: `shared.attempts < 3` if **Agent B** increments `shared.attempts`).
3. **Loop** → **Agent B**; **Agent B** → While target; **Done** → **End**.
4. **Test Swarm** — expect multiple `node_done` events for the While node with increasing `output.iteration`.

### End-to-end example (retry loop)

Use **Agent B’s output** as the loop counter (re-evaluated on each While visit):

| Node | Config |
|------|--------|
| **Agent A** | Optional setup; wire into While target |
| **While** | Code condition: `count < 3` (flat upstream field from **Agent B** after the first iteration) |
| **Agent B** | JSON output schema with `count` (number). Instructions: output `{ "count": <previous + 1> }` using upstream/context; first pass can start at `1` |
| **End** | Wire from While **Done** |

**Wiring:** `Agent A → While → (loop) Agent B → back-edge to While → (done) End`.

**What to verify in Test Swarm logs:**

- While `node_done` with `output.iteration` 1, 2, 3 → `branchHandle: "loop"`; then iteration 4 → `"done"`
- Agent B runs 3 times (body reset between iterations)
- End runs once after **Done**

**Simpler smoke test:** condition `true` with `maxIterations: 2` — expect 2 loop iterations then failure (`While node … exceeded max iterations`). Useful to confirm the safety cap without tuning worker output.

Full runtime semantics: sibling repo `agentatlas-services/docs/SWARMS.md` — section **While control nodes**.
