# agentatlas

**Laboratorio open source para diseñar, probar y comparar arquitecturas multi-agente.**

Los modelos de frontera son caros. Las empresas migran a sistemas multi-agente con modelos pequeños: mismo resultado útil, factura mucho menor. Pero no hay una fuente de la verdad para consultar y validar arquitecturas de swarms — cada equipo elige topología a ciegas.

## Qué hace

1. **Catálogo de arquitecturas** — ReAct, Supervisor/Router, Pipeline + Critic, fan-out, Debate/Judge, Human-in-the-loop, sub-swarms y más. Cuándo usar cada patrón, trade-offs y mapeo a LangGraph, AutoGen y agentatlas.

2. **Editor de grafos + test harness** — Canvas visual (React Flow) con workers, nodos de control (If/Else, While, scraper, research, sub-swarm, aprobación humana) y test runs con streaming SSE: logs por worker, tokens y checkpoints.

3. **Skill doc para coding agents** — URL pública (`/skill.md`) con topologías, contratos de API y flujo de test runs. Comando: `set up https://agentatlas.network/skill.md`.

## Stack

- **Frontend:** Next.js — https://agentatlas.network/
- **Backend:** NestJS — https://agentatlas-services.onrender.com/api/v1
- **Repos:** [agentatlas-platform](https://github.com/JoseAngelChepo/agentatlas-platform) + [agentatlas-services](https://github.com/JoseAngelChepo/agentatlas-services) (MIT)

## Equipo 19

- Luisa Fernanda Guerra
- José Ángel López
- Gerson Estrada López
