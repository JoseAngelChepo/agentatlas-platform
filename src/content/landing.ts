/**
 * Landing page copy for agentatlas.
 * Wire to i18n (`src/messages/*.json`) when you need multiple locales.
 */

import { architectureCatalogSection } from "@/content/architectures"

export type { ArchitectureCardModel, ArchitectureTopology } from "@/content/architectures"

export type LandingNavItem = { label: string; href: string }

export type LandingBullet = { title: string; description: string }

export type LandingStep = { step: string; title: string; description: string }

export type LandingFaqItem = { question: string; answer: string }

export type LandingDirectoryListing = {
  name: string
  category: string
  rating: string
  stat: string
  price: string
  badge?: string
}

export const landingContent = {
  brand: {
    name: "agentatlas",
  },
  header: {
    nav: [] as LandingNavItem[],
    loginLabel: "Log in",
    signupLabel: "Sign up",
    dashboardLabel: "Dashboard",
  },
  hero: {
    badge: "Agent documentation",
    title: "Teach your agents how to build swarms and sub-agents.",
    lede:
      "One skill URL with graph topologies, workers, nested swarms, tools, and test runs — so coding agents know how to design and run multi-agent systems.",
    skill: {
      hint: "Copy the setup command into your agent.",
      footerHint: "Your agent fetches the skill doc and learns the swarm workflow.",
    },
  },
  architectures: {
    id: architectureCatalogSection.id,
    eyebrow: architectureCatalogSection.eyebrow,
    intro: architectureCatalogSection.intro,
    extendedEyebrow: "Extended patterns",
  },
  network: {
    id: "network",
    eyebrow: "Architecture patterns",
    title: "Catalogue swarm topologies by use case",
    lede:
      "From single agent + tools to supervisor, pipeline, debate, and human-in-the-loop — map intent to structure before you commit to a framework.",
    directory: {
      title: "Pattern library",
      status: "Growing",
      listings: [
        {
          name: "Supervisor / Router",
          category: "Orchestration",
          rating: "4.9",
          stat: "Low coupling · clear ownership",
          price: "Verifiable",
          badge: "Popular",
        },
        {
          name: "Pipeline + Critic",
          category: "Quality",
          rating: "4.8",
          stat: "Plan → execute → verify",
          price: "High traceability",
        },
        {
          name: "Parallel fan-out",
          category: "Throughput",
          rating: "4.7",
          stat: "Fan-out + merge",
          price: "Latency trade-off",
        },
      ] satisfies LandingDirectoryListing[],
    },
    pillars: [
      {
        title: "Intent-first",
        description: "Start from the job to be done, not from LangGraph vs AutoGen.",
      },
      {
        title: "Real traces",
        description: "Evaluate architectures with run logs, not slide decks.",
      },
      {
        title: "Composable graphs",
        description: "Nest sub-swarms, branch on conditions, pause for human input.",
      },
    ],
  },
  solution: {
    id: "operating-layer",
    eyebrow: "The platform",
    title: "A lab for swarm design — not another framework wrapper",
    lede:
      "agentatlas gives you a visual editor, a test harness, and inference plumbing so you can iterate on architecture before production.",
    highlights: [
      "Visual graph editor with agents, if/else, while loops, scrapers, and sub-swarms",
      "Streaming test runs with worker logs, token usage, and approval checkpoints",
      "Tool registry: Firecrawl scrape/search/research, run_swarm, and connected platform integrations",
    ],
  },
  howItWorks: {
    id: "lifecycle",
    eyebrow: "Workflow",
    title: "From idea to verified run",
    steps: [
      {
        step: "01",
        title: "Model the topology",
        description:
          "Place workers on the canvas, wire control flow, define inputs/outputs on Start and End nodes.",
      },
      {
        step: "02",
        title: "Run against real models",
        description:
          "Execute test runs with your inference providers. Watch SSE streams, inspect agent runs, approve risky steps.",
      },
      {
        step: "03",
        title: "Compare and iterate",
        description:
          "Duplicate swarms, tweak prompts, swap architectures — keep traces as evidence of what worked.",
      },
    ] satisfies LandingStep[],
  },
  features: {
    id: "features",
    eyebrow: "Capabilities",
    title: "Everything you need to prototype swarms",
    items: [
      {
        title: "Graph editor",
        description: "React Flow canvas with agent workers, control nodes, and nested swarms.",
      },
      {
        title: "Inference setup",
        description: "OpenAI, Anthropic, OpenRouter, Gemini, Grok, Ollama — configure once, run everywhere.",
      },
      {
        title: "Human-in-the-loop",
        description: "User input and approval nodes pause runs until a human decides.",
      },
      {
        title: "Sub-swarms as tools",
        description: "Expose child swarms as callable functions from parent agents.",
      },
    ] satisfies LandingBullet[],
  },
  socialProof: {
    eyebrow: "Design principle",
    title: "Choose architecture before framework",
    stats: [
      { value: "10+", label: "Core patterns in the atlas taxonomy" },
      { value: "SSE", label: "Live run streaming in the test panel" },
      { value: "1", label: "Graph — many architectures" },
    ],
    quote: {
      text: "Agents need an operational catalogue of architectures, not just another SDK. Pick the pattern that matches verification and risk — then implement.",
      attribution: "agentatlas thesis",
    },
  },
  faq: {
    id: "faq",
    eyebrow: "FAQ",
    title: "Common questions",
    items: [
      {
        question: "Is agentatlas a framework?",
        answer:
          "No. It is a platform to design and test swarm graphs. You can implement the same pattern in LangGraph, AutoGen, CrewAI, or your own runtime — agentatlas helps you decide and prototype.",
      },
      {
        question: "What can I run today?",
        answer:
          "Full swarm editor, test runs with streaming, worker tools, sub-swarms, scrapers, conditional branches, while loops, and approval gates.",
      },
      {
        question: "Who is this for?",
        answer:
          "Developers and teams building multi-agent systems — use the skill doc so coding agents understand swarm graphs, sub-agents, tools, and test runs.",
      },
    ] satisfies LandingFaqItem[],
  },
  finalCta: {
    title: "Pick the architecture. Prove it with a run.",
    lede: "Create an account, open the swarm editor, and ship your first test graph in minutes.",
    primaryCta: { label: "Get started", href: "/sign-up" },
    secondaryCta: { label: "Log in", href: "/sign-in" },
  },
  footer: {
    tagline: "Platform to create and test agent swarms.",
    links: [
      { label: "Privacy", href: "/privacy" },
      { label: "Terms", href: "/terms" },
      { label: "Contact", href: "#" },
    ] satisfies LandingNavItem[],
    copyright: "© {year} agentatlas. All rights reserved.",
  },
} as const
