import { parseArgs } from "node:util";
import { type EngineConfig, EngineIdSchema, readEngineConfig } from "@praxis/core/config";
import { openDb } from "@praxis/core/db";
import type { EngineEvent, Logger } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { composeSystemPrompt } from "@praxis/curriculum/brief";
import { teachMode } from "@praxis/curriculum/modes";
import { createEngine, runOneShot } from "@praxis/engines";
import {
  InProcessToolRegistry,
  IsolatedVmHost,
  PyodideHost,
  PyodideSymPyService,
} from "@praxis/tools";
import { gradeMathTool } from "@praxis/tools/math";
import { codeSandboxTool, LocalCodeSandbox } from "@praxis/tools/sandbox";
import { v7 as uuidv7 } from "uuid";

const consoleLogger: Logger = {
  debug: (m, f) => console.debug(`[debug] ${m}`, f ?? {}),
  info: (m, f) => console.info(`[info] ${m}`, f ?? {}),
  warn: (m, f) => console.warn(`[warn] ${m}`, f ?? {}),
  error: (m, f) => console.error(`[error] ${m}`, f ?? {}),
};

async function main() {
  const { values, positionals } = parseArgs({
    options: {
      engine: { type: "string" },
      model: { type: "string" },
      "api-key": { type: "string" },
      "base-url": { type: "string" },
      "no-tools": { type: "boolean", default: false },
      "max-steps": { type: "string" },
    },
    allowPositionals: true,
  });
  const userMessage = positionals.join(" ").trim();
  if (!userMessage) {
    console.error('usage: pnpm script:run-session [--engine=<id>] [--no-tools] "<user message>"');
    process.exit(1);
  }

  const { db } = openDb();
  const stored = readEngineConfig(db);
  const config: EngineConfig = {
    ...stored,
    ...(values.engine !== undefined && { engineId: EngineIdSchema.parse(values.engine) }),
    ...(values.model !== undefined && { model: values.model }),
    ...(values["api-key"] !== undefined && { apiKey: values["api-key"] }),
    ...(values["base-url"] !== undefined && { baseUrl: values["base-url"] }),
  };

  const studentId = brandId<"StudentId">(uuidv7()); // Phase 2/3: ephemeral student per script run.
  const sessionId = brandId<"SessionId">(uuidv7());

  const pyodide = new PyodideHost({ packages: ["sympy"] });
  const jsHost = new IsolatedVmHost();
  const sympy = new PyodideSymPyService(pyodide);
  const sandbox = new LocalCodeSandbox(jsHost, pyodide);

  const toolContext = {
    studentId,
    sessionId,
    services: {
      memory: null,
      artifacts: null,
      vectorStore: null,
      sandbox,
      sympy,
      pedagogyPack: null,
    },
    log: consoleLogger,
  };
  const tools = new InProcessToolRegistry({
    tools: values["no-tools"] ? [] : [gradeMathTool, codeSandboxTool],
    context: toolContext,
  });

  const engine = createEngine({ config, deps: { log: consoleLogger } });
  const systemPrompt = composeSystemPrompt({ mode: teachMode });
  const maxSteps = values["max-steps"] ? Number.parseInt(values["max-steps"], 10) : undefined;

  console.log(`# Engine: ${config.engineId}`);
  console.log(`# Session: ${sessionId}`);
  console.log("---");

  let eventCount = 0;
  let finalUsage: { inputTokens: number; outputTokens: number } | undefined;
  for await (const event of runOneShot(
    engine,
    {
      systemPrompt,
      tools,
      ...(maxSteps !== undefined && { maxSteps }),
    },
    userMessage,
  )) {
    eventCount++;
    renderEvent(event);
    if (event.type === "final") finalUsage = event.usage;
  }

  console.log("\n---");
  console.log(`# events: ${eventCount}`);
  console.log(`# final usage: ${JSON.stringify(finalUsage ?? {})}`);
}

function renderEvent(event: EngineEvent): void {
  switch (event.type) {
    case "user_message":
      // Script already printed the user message; skip the echoed event.
      break;
    case "model_message":
      process.stdout.write(event.content);
      break;
    case "tool_call":
      console.log(`\n[tool_call] ${event.toolName} ${JSON.stringify(event.args)}`);
      break;
    case "tool_result":
      console.log(`[tool_result] ${JSON.stringify(event.result)}`);
      break;
    case "thinking":
      // Quiet by default; uncomment to surface model reasoning.
      // process.stderr.write(`[thinking] ${event.content}`);
      break;
    case "error":
      console.error(`\n[error] ${event.error.code}: ${event.error.message}`);
      break;
    case "final":
      // Handled in the done branch.
      break;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
