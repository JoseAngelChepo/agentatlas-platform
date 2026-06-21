# agentatlas-platform

Next.js frontend for **agentatlas** — create, test, and compare multi-agent swarm architectures.

Public landing, auth, swarm editor, test panel, and admin (users + swarms).

Expects the sibling API **`agentatlas-services`** at `http://localhost:3001/api/v1`.

**License:** MIT — see [LICENSE](./LICENSE). Backend: [agentatlas-services](https://github.com/JoseAngelChepo/agentatlas-services) (MIT).

## Develop

```bash
npm install
npm run dev
```

Open `http://localhost:3000`. Swarms live at `/dashboard/swarms`.

## Docs

- `docs/SWARMS-EDITOR.md` — editor UI
- `docs/SWARMS-TOOLS.md` — worker tools panel
- Backend contracts: `../agentatlas-services/docs/SWARMS-WORKSPACE.md`
