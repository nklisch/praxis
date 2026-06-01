import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SKILL_DIR = join(process.cwd(), ".agents", "skills", "agent-debugging-harness");
const SKILL_PATH = join(SKILL_DIR, "SKILL.md");

describe("agent debugging harness skill", () => {
  it("keeps all referenced runbook files present", async () => {
    const skill = await readFile(SKILL_PATH, "utf8");
    const references = [
      ...new Set([...skill.matchAll(/references\/[a-z0-9-]+\.md/g)].map((match) => match[0])),
    ];

    expect(references).toEqual([
      "references/report-shape.md",
      "references/commands.md",
      "references/owner-routing.md",
      "references/tool-call-leaked-into-chat.md",
      "references/tool-dispatch-before-subagent.md",
      "references/react-tool-result-crash.md",
      "references/ipc-stream-died.md",
      "references/subagent-missing-or-stalled.md",
      "references/persistence-fk-failure.md",
      "references/student-simulation-visual-mismatch.md",
    ]);
    await Promise.all(references.map((reference) => access(join(SKILL_DIR, reference))));
  });

  it("keeps trigger text aligned with common failure symptoms", async () => {
    const skill = await readFile(SKILL_PATH, "utf8");
    const normalizedSkill = skill.replace(/\s+/g, " ");

    for (const trigger of [
      "tool calls leaked into chat",
      "raw <invoke> markup",
      "[object Object] rendering",
      "tool.dispatch.error",
      "sub-agent stalls",
      "IPC stream failures",
      "React renderer crashes",
      "persistence/FK failures",
      "student-simulation/browser mismatches",
    ]) {
      expect(normalizedSkill).toContain(trigger);
    }
  });

  it("keeps command and owner-routing references actionable", async () => {
    const commands = await readFile(join(SKILL_DIR, "references", "commands.md"), "utf8");
    const ownerRouting = await readFile(join(SKILL_DIR, "references", "owner-routing.md"), "utf8");

    for (const command of [
      ".work/bin/work-view --ready",
      "pnpm debug:bundle",
      "pnpm debug:replay",
      "pnpm student-sim:run",
      "PRAXIS_RUN_BROWSER_SIMULATION=1",
      "pnpm exec playwright show-trace",
      "pnpm db:show",
    ]) {
      expect(commands).toContain(command);
    }
    for (const owner of [
      "packages/tools",
      "packages/core",
      "packages/desktop",
      "packages/client",
      "packages/ui",
      "tests/helpers/student-simulation",
    ]) {
      expect(ownerRouting).toContain(owner);
    }
  });
});
