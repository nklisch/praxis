/**
 * Shared test helpers for pedagogy tool tests.
 *
 * NOTE: This file does NOT import from @praxis/curriculum because @praxis/tools
 * does not take a runtime dependency on @praxis/curriculum. The empty-pack
 * service is implemented inline here as a minimal PedagogyPackService that
 * returns empty/null from every accessor.
 */
import type { Logger, PedagogyPackService, ToolContext } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { vi } from "vitest";

const NOOP_LOG: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => NOOP_LOG,
};

/** Minimal PedagogyPackService that always operates in empty-pack mode. */
export function makeEmptyPedagogyPackService(): PedagogyPackService {
  return {
    current: () => null,
    listStrategies: () => [],
    getStrategy: () => null,
    listTechniques: () => [],
    getTechnique: () => null,
    listMetacognitivePrompts: () => [],
  };
}

/**
 * Minimal PedagogyPackService that returns two synthetic strategies, one
 * technique, and two metacognitive prompts — enough to exercise all tool
 * happy paths without importing from @praxis/curriculum.
 */
export function makeFilledPedagogyPackService(): PedagogyPackService {
  const strategies = [
    {
      id: "worked-examples" as import("@praxis/core/types").StrategyId,
      name: "Worked Examples",
      description: "Solve problems step-by-step before asking the student to attempt similar ones.",
      applicability: {
        conceptKinds: ["procedural"],
        bloomsLevels: ["apply", "analyze"],
        cognitiveLoad: "medium" as const,
      },
      promptFragment: "Walk through a worked example first.",
      citations: [],
    },
    {
      id: "socratic" as import("@praxis/core/types").StrategyId,
      name: "Socratic Questioning",
      description: "Lead the student to insight through targeted questions.",
      applicability: {
        conceptKinds: ["conceptual"],
        bloomsLevels: ["understand", "evaluate"],
        cognitiveLoad: "high" as const,
      },
      promptFragment: "Ask guiding questions instead of giving the answer.",
      citations: [],
    },
  ];

  const techniques = [
    {
      id: "spaced-repetition" as import("@praxis/core/types").TechniqueId,
      name: "Spaced Repetition",
      description: "Review material at increasing intervals.",
      uiAffordances: ["flashcard-deck"],
      curriculum: {
        lessons: [
          {
            id: "sr-intro",
            title: "Why Spacing Works",
            body: "Memory decays over time. Reviewing just before forgetting strengthens the trace.",
            practicePromptIds: [],
          },
        ],
      },
      citations: [],
    },
  ];

  const prompts = [
    {
      id: "pre-reading-goals",
      trigger: "pre-reading" as const,
      template: "What do you already know about {{topic}}?",
    },
    {
      id: "post-error-reflect",
      trigger: "post-error" as const,
      template: "What was your reasoning?",
    },
  ];

  return {
    current: () =>
      ({
        version: "0.1.0",
        signature: "v1-unsigned",
        manifest: {
          name: "Test Pack",
          description: "Synthetic pack for tests.",
          praxisCompatible: ">=0.1.0",
          publishedAt: 1700000000,
          authors: ["Test"],
        },
        strategies,
        studyTechniques: techniques,
        metacognitivePrompts: prompts,
      }) as import("@praxis/core/types").PedagogyPack,
    listStrategies: () => strategies,
    getStrategy: (id) => strategies.find((s) => s.id === id) ?? null,
    listTechniques: () => techniques,
    getTechnique: (id) => techniques.find((t) => t.id === id) ?? null,
    listMetacognitivePrompts: (opts) => {
      if (opts?.trigger) return prompts.filter((p) => p.trigger === opts.trigger);
      return prompts;
    },
  };
}

export function makeCtx(pedagogyPack: PedagogyPackService): ToolContext {
  return {
    studentId: brandId<"StudentId">("student-1"),
    sessionId: brandId<"SessionId">("session-1"),
    services: {
      // biome-ignore lint/suspicious/noExplicitAny: test stub — not used in pedagogy tool tests
      memory: null as any,
      // biome-ignore lint/suspicious/noExplicitAny: test stub — not used in pedagogy tool tests
      artifacts: null as any,
      // biome-ignore lint/suspicious/noExplicitAny: test stub — not used in pedagogy tool tests
      bootstrap: null as any,
      // biome-ignore lint/suspicious/noExplicitAny: test stub — not used in pedagogy tool tests
      courseState: null as any,
      // biome-ignore lint/suspicious/noExplicitAny: test stub — not used in pedagogy tool tests
      vectorStore: null as any,
      // biome-ignore lint/suspicious/noExplicitAny: test stub — not used in pedagogy tool tests
      ftsStore: null as any,
      // biome-ignore lint/suspicious/noExplicitAny: test stub — not used in pedagogy tool tests
      embeddings: null as any,
      // biome-ignore lint/suspicious/noExplicitAny: test stub — not used in pedagogy tool tests
      documents: null as any,
      sandbox: { availableLanguages: ["javascript", "python"], run: vi.fn() },
      sympy: {
        checkSolution: vi.fn(),
        solveEquation: vi.fn(),
        simplify: vi.fn(),
        checkEquivalent: vi.fn(),
        parseLatex: vi.fn(),
      },
      pedagogyPack,
      // biome-ignore lint/suspicious/noExplicitAny: test stub — not used in pedagogy tool tests
      lock: null as any,
      // biome-ignore lint/suspicious/noExplicitAny: test stub — not used in pedagogy tool tests
      authoring: null as any,
      // biome-ignore lint/suspicious/noExplicitAny: test stub — not used in pedagogy tool tests
      notes: null as any,
      // biome-ignore lint/suspicious/noExplicitAny: test stub — not used in pedagogy tool tests
      flashcards: null as any,
      // biome-ignore lint/suspicious/noExplicitAny: test stub — not used in pedagogy tool tests
      fsrsScheduler: null as any,
      // biome-ignore lint/suspicious/noExplicitAny: test stub — not used in pedagogy tool tests
      packs: null as any,
      // biome-ignore lint/suspicious/noExplicitAny: test stub — not used in pedagogy tool tests
      assignments: null as any,
      // biome-ignore lint/suspicious/noExplicitAny: test stub — not used in pedagogy tool tests
      documentScopes: null as any,
      // biome-ignore lint/suspicious/noExplicitAny: test stub — not used in pedagogy tool tests
      engineResolver: null as any,
    },
    log: NOOP_LOG,
  };
}
