# agentatlas

**Laboratorio open source para diseñar, probar y comparar arquitecturas multi-agente.** Editor de grafos, test runs con trazas en vivo y skill doc público. Corré todo en tu máquina — incluso inferencia local con Ollama, sin depender de APIs de pago.

---

## El problema

Los modelos de frontera son caros. Las empresas migran a sistemas multi-agente con modelos pequeños: mismo resultado útil, factura mucho menor.

Pero no hay una fuente de la verdad para consultar y validar arquitecturas de swarms. Cada equipo elige topología a ciegas — supervisor, pipeline, fan-out — sin catálogo compartido ni forma de probarla antes de producción.

---

## Cómo funciona

agentatlas cubre el ciclo completo — del intent al run verificado — en tres capas:

### 1. Catálogo de arquitecturas (`PATTERN LIBRARY · INTENT-FIRST`)

Más de 10 patrones documentados: ReAct, Supervisor/Router, Pipeline + Critic, fan-out paralelo, Debate/Judge, Human-in-the-loop, delegación por sub-swarm, híbridos y más.

Cada patrón incluye cuándo usarlo, cuándo no, perfil operativo (verificación, trazabilidad, latencia, costo) y notas de mapeo a LangGraph, AutoGen y agentatlas. Elegís estructura antes que framework.

### 2. Editor de grafos + test harness (`SWARM EDITOR · SSE TRACES`)

Canvas visual (React Flow) para armar el grafo:

- **Workers:** agentes reutilizables con modelos, prompts, schemas de I/O y herramientas.
- **Nodos de control:** Start/End, If/Else, While, scraper web, research papers, sub-swarm, aprobación de usuario.
- **Test runs:** ejecución contra proveedores reales con streaming SSE — logs por worker, uso de tokens y checkpoints de aprobación humana.

Duplicás swarms, ajustás prompts, comparás traces. La evidencia vive en el panel de test, no en un slide deck.

Cada worker elige proveedor de inferencia: cloud (OpenAI, Anthropic, OpenRouter, Gemini, Grok) u **Ollama en localhost** — modelos chicos en tu compu, costo cero por token.

### 3. Skill doc para agentes de código (`SKILL URL · SETUP COMMAND`)

Una URL pública (`/skill.md`) con topologías, contratos de API, herramientas y flujo de test runs. El comando de setup (`set up {APP_URL}/skill.md`) enseña a Cursor, Claude Code u otros agentes cómo diseñar y ejecutar swarms en la plataforma.

**Elegí arquitectura. Probala con un run. Exportá el patrón a tu runtime.**

---

## Stack técnico

**Open source (MIT).** [agentatlas-platform](https://github.com/JoseAngelChepo/agentatlas-platform) + [agentatlas-services](https://github.com/JoseAngelChepo/agentatlas-services). Clonás, corrés local, extendés.

| Capa | Tecnología |
|------|------------|
| **Licencia** | **MIT** — frontend y backend |
| **Frontend** | Next.js 16 (App Router), React 19, React Flow (`@xyflow/react`), styled-jsx |
| **Backend** | NestJS en `agentatlas-services` — `/api/v1`, orquestador, inferencia, tools |
| **Persistencia** | MongoDB (swarms, workers, runs) vía services |
| **Inferencia cloud** | OpenAI Direct, Anthropic, OpenRouter, Gemini, Grok |
| **Inferencia local** | **Ollama** — Llama, Mistral, etc. en tu máquina (`localhost:11434`) |
| **Tools** | Firecrawl (scrape/search/research), `run_swarm`, sub-swarms como funciones OpenAI |
| **Streaming** | SSE en `POST /swarms/:id/run/stream` |
| **i18n** | Inglés + español (`src/messages/`) |
| **Skill sync** | Catálogo de arquitecturas → `public/skill.md` vía `npm run sync:architectures` |

**Repos (carpetas hermanas, MIT):**

| Repo | Rol |
|------|-----|
| [`agentatlas-platform`](https://github.com/JoseAngelChepo/agentatlas-platform) | UI — landing, auth, editor, test panel, admin |
| [`agentatlas-services`](https://github.com/JoseAngelChepo/agentatlas-services) | API — swarms, inferencia, orquestación |

---

## Demo

Flujo típico en la plataforma:

1. Crear cuenta → `/dashboard/swarms`
2. Modelar topología en el canvas (workers + nodos de control)
3. Configurar inferencia y herramientas en un worker
4. **Test Swarm** → observar el stream SSE, aprobar pasos si hay gate humano
5. Iterar duplicando el swarm o cambiando arquitectura

Para correr localmente:

```bash
# Frontend (este repo)
cd agentatlas-platform
npm install
npm run dev
# → http://localhost:3000

# Backend (repo hermano, requerido para editor y runs)
cd ../agentatlas-services
# seguir README del services — API en http://localhost:3001/api/v1

# Inferencia local (opcional, sin costo de API)
ollama serve
ollama pull llama3.2
# en el editor: worker → provider "Ollama (local)"
```

Skill doc local: `http://localhost:3000/skill.md`

---

## Rutas clave

| Ruta | Qué es |
|------|--------|
| `/` | Landing + comando de setup del skill |
| `/skill.md` | Documentación pública para coding agents |
| `/dashboard/swarms` | Lista y editor de swarms del usuario |
| `/admin/swarms` | Swarms (admin) |
| `/admin/users` | Gestión de usuarios |

---

## Equipo

<!-- Completar con nombres y roles del equipo -->

| | |
|---|---|
| **Nombre** | Rol |
| **Nombre** | Rol |

---

## Docs en el repo

- `docs/SWARMS-EDITOR.md` — nodos de control y editor
- `docs/SWARMS-TOOLS.md` — herramientas de workers y sub-swarms
- `docs/LANDING.md` — landing y copy
- `.cursor/skills/agentatlas-swarms/SKILL.md` — skill para agentes en el IDE
