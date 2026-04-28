import { describe, expect, it } from "vitest";
import { ClaudeCodeEngine } from "../claude-code/index.js";
import { CodexEngine } from "../codex/index.js";
import { DirectEngine } from "../direct/index.js";
import { createEngine } from "../factory.js";
import type { EngineDeps } from "../types.js";

const deps: EngineDeps = {
  log: {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  },
};

describe("createEngine", () => {
  it("claude-code → ClaudeCodeEngine with id 'claude-code'", () => {
    const engine = createEngine({ config: { engineId: "claude-code" }, deps });
    expect(engine).toBeInstanceOf(ClaudeCodeEngine);
    expect(engine.id).toBe("claude-code");
    expect(engine.kind).toBe("looped");
  });

  it("codex → CodexEngine with id 'codex'", () => {
    const engine = createEngine({ config: { engineId: "codex" }, deps });
    expect(engine).toBeInstanceOf(CodexEngine);
    expect(engine.id).toBe("codex");
    expect(engine.kind).toBe("looped");
  });

  it("direct.anthropic → DirectEngine with id 'direct.anthropic'", () => {
    const engine = createEngine({ config: { engineId: "direct.anthropic" }, deps });
    expect(engine).toBeInstanceOf(DirectEngine);
    expect(engine.id).toBe("direct.anthropic");
    expect(engine.kind).toBe("single-shot");
  });

  it("direct.openai → DirectEngine with id 'direct.openai'", () => {
    const engine = createEngine({ config: { engineId: "direct.openai" }, deps });
    expect(engine.id).toBe("direct.openai");
  });

  it("direct.google → DirectEngine with id 'direct.google'", () => {
    const engine = createEngine({ config: { engineId: "direct.google" }, deps });
    expect(engine.id).toBe("direct.google");
  });

  it("direct.ollama → DirectEngine with id 'direct.ollama'", () => {
    const engine = createEngine({ config: { engineId: "direct.ollama" }, deps });
    expect(engine.id).toBe("direct.ollama");
  });
});
