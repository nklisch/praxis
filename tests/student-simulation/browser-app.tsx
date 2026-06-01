import type {
  QuickCheckEvent,
  SessionId,
  StudentSimulationScenario,
  StudentSimulationStep,
} from "@praxis/core/types";
import { resolveRenderToggles } from "@praxis/core/types";
// biome-ignore lint/correctness/noUnusedImports: Vite's standalone TSX transform emits React.createElement for this test app.
import React, {
  type JSX,
  type MutableRefObject,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import { MessageBubble } from "../../packages/ui/src/components/message.js";
import { QuickCheckCard } from "../../packages/ui/src/components/quick-check-card.js";
import { StructuredQuestionCard } from "../../packages/ui/src/components/structured-question-card.js";
import { ThinkingIndicator } from "../../packages/ui/src/components/thinking-indicator.js";
import { ToolCallDisclosure } from "../../packages/ui/src/components/tool-call-disclosure.js";
import type { ChatStreamItem } from "../../packages/ui/src/hooks/use-streamed-send.js";
import { useStreamedSend } from "../../packages/ui/src/hooks/use-streamed-send.js";
import "../../packages/ui/src/styles/global.css";
import {
  buildBrowserQuickCheckAnswer,
  createBrowserSimulationClient,
} from "../helpers/student-simulation/browser-fixture.js";
import {
  getStudentSimulationFixture,
  type ScriptedStudentSimulationFixture,
  STUDENT_SIMULATION_SCENARIOS,
} from "../helpers/student-simulation/scenarios/index.js";

interface BrowserScenarioRunSummary {
  scenarioId: string;
  status: "passed" | "failed";
  bodyText: string;
  sessionIds: string[];
  callIds: string[];
  anomalies: string[];
}

interface BrowserSimulationApi {
  listScenarios(): StudentSimulationScenario[];
  runScenario(id: string): Promise<BrowserScenarioRunSummary>;
}

declare global {
  interface Window {
    __praxisStudentSimulation?: BrowserSimulationApi;
  }
}

interface RunRequest {
  id: string;
  sequence: number;
  resolve(summary: BrowserScenarioRunSummary): void;
  reject(err: unknown): void;
}

function SimulationApp(): JSX.Element {
  const [request, setRequest] = useState<RunRequest | null>(null);
  const sequenceRef = useRef(0);

  useEffect(() => {
    window.__praxisStudentSimulation = {
      listScenarios: () => [...STUDENT_SIMULATION_SCENARIOS],
      runScenario: (id) =>
        new Promise<BrowserScenarioRunSummary>((resolve, reject) => {
          sequenceRef.current += 1;
          setRequest({ id, sequence: sequenceRef.current, resolve, reject });
        }),
    };
  }, []);

  return (
    <main className="simulation-shell">
      <style>{SIMULATION_CSS}</style>
      <header className="simulation-header">
        <p>Praxis browser simulation</p>
        <h1>{request?.id ?? "Ready"}</h1>
      </header>
      {request === null ? (
        <p className="simulation-empty">Waiting for a scenario.</p>
      ) : (
        <ScenarioRun key={request.sequence} request={request} />
      )}
    </main>
  );
}

function ScenarioRun({ request }: { request: RunRequest }): JSX.Element {
  const fixture = useMemo(() => getStudentSimulationFixture(request.id), [request.id]);
  const browserClient = useMemo(() => createBrowserSimulationClient(fixture), [fixture]);
  const streamed = useStreamedSend(browserClient.client);
  const sendRef = useRef(streamed.send);
  sendRef.current = streamed.send;
  const startedRef = useRef(false);
  const [quickChecks, setQuickChecks] = useState<Array<QuickCheckEvent & { resolved?: boolean }>>(
    [],
  );
  const quickChecksRef = useRef(quickChecks);
  quickChecksRef.current = quickChecks;
  const sessionRefs = useRef(new Map<string, SessionId>());
  const runStartedRef = useRef(false);
  const sendFailuresRef = useRef<string[]>([]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    let cancelled = false;
    async function listen() {
      for await (const event of browserClient.client.quickCheck.events()) {
        if (cancelled) break;
        if (event.kind === "pending") {
          setQuickChecks((prev) => {
            const next = [...prev, { ...event, resolved: false }];
            quickChecksRef.current = next;
            return next;
          });
        } else {
          setQuickChecks((prev) => {
            const next = prev.map((check) =>
              check.callId === event.callId ? { ...check, ...event, resolved: true } : check,
            );
            quickChecksRef.current = next;
            return next;
          });
        }
      }
    }
    void listen();
    return () => {
      cancelled = true;
    };
  }, [browserClient.client]);

  useEffect(() => {
    if (runStartedRef.current) return;
    runStartedRef.current = true;
    let cancelled = false;
    async function run() {
      try {
        console.info(`[praxis-browser-sim] start ${fixture.scenario.id}`);
        for (const [index, step] of fixture.scenario.steps.entries()) {
          if (cancelled) return;
          console.info(`[praxis-browser-sim] step ${index} ${step.kind} start`);
          await runBrowserStep({
            fixture,
            step,
            send: (sessionId, message) => sendRef.current(sessionId, message),
            sessionRefs: sessionRefs.current,
            quickChecksRef,
            sendFailuresRef,
            client: browserClient.client,
          });
          console.info(`[praxis-browser-sim] step ${index} ${step.kind} done`);
          await nextFrame();
        }
        throwIfSendFailed(sendFailuresRef);
        const bodyText = document.body.innerText;
        const anomalies = detectBrowserVisibleAnomalies(bodyText);
        console.info(`[praxis-browser-sim] resolve ${fixture.scenario.id}`);
        request.resolve({
          scenarioId: fixture.scenario.id,
          status: anomalies.length === 0 ? "passed" : "failed",
          bodyText,
          sessionIds: [...browserClient.sessionIds],
          callIds: [...browserClient.callIds],
          anomalies,
        });
      } catch (err) {
        request.reject(err);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [browserClient, fixture, request]);

  return (
    <section className="simulation-surface" data-testid="simulation-surface">
      <h2>{fixture.scenario.title}</h2>
      <p className="simulation-meta">
        {fixture.scenario.persona.label} / {fixture.scenario.determinism}
      </p>
      <div className="simulation-chat">{streamed.items.map(renderStreamItem)}</div>
      {streamed.thinking && <ThinkingIndicator />}
      {quickChecks.map((event) => {
        if (event.kind !== "pending") return null;
        if (event.item.kind === "structured-question") {
          return (
            <StructuredQuestionCard
              key={event.callId}
              callId={event.callId}
              item={event.item}
              onResolve={async (callId, answer) => {
                await browserClient.client.quickCheck.resolve({ callId, answer });
              }}
            />
          );
        }
        return (
          <QuickCheckCard
            key={event.callId}
            callId={event.callId}
            item={event.item}
            onResolve={async (callId, answer) => {
              await browserClient.client.quickCheck.resolve({ callId, answer });
            }}
          />
        );
      })}
    </section>
  );
}

async function runBrowserStep(input: {
  fixture: ScriptedStudentSimulationFixture;
  step: StudentSimulationStep;
  send: (sessionId: SessionId, message: string) => Promise<void>;
  sessionRefs: Map<string, SessionId>;
  quickChecksRef: MutableRefObject<Array<QuickCheckEvent & { resolved?: boolean }>>;
  sendFailuresRef: MutableRefObject<string[]>;
  client: ReturnType<typeof createBrowserSimulationClient>["client"];
}): Promise<void> {
  throwIfSendFailed(input.sendFailuresRef);
  switch (input.step.kind) {
    case "start-session": {
      const handle = await input.client.session.start({ modeId: input.step.modeId });
      input.sessionRefs.set(input.step.ref, handle.sessionId);
      return;
    }
    case "send-message": {
      const sessionId = input.sessionRefs.get(input.step.sessionRef);
      if (sessionId === undefined) throw new Error(`Unknown session ref: ${input.step.sessionRef}`);
      void input.send(sessionId, input.step.text).catch((err) => {
        input.sendFailuresRef.current.push(err instanceof Error ? err.message : String(err));
      });
      return;
    }
    case "answer-quick-check": {
      const pending = await waitForPendingQuickCheck(input.quickChecksRef);
      const answer = buildBrowserQuickCheckAnswer({
        item: pending.item,
        strategy: input.step.strategy,
        persona: input.fixture.scenario.persona,
      });
      await input.client.quickCheck.resolve({ callId: pending.callId, answer });
      return;
    }
    case "expect-visible": {
      await nextFrame();
      const found = await waitForTextExpectation(input.step.text, input.step.absent === true);
      if (input.step.absent === true && found) {
        throw new Error(`Text was visible but expected absent: ${input.step.text}`);
      }
      if (input.step.absent !== true && !found) {
        throw new Error(`Expected visible text was not observed: ${input.step.text}`);
      }
      return;
    }
    case "expect-event":
    case "capture-browser-artifacts":
      return;
  }
}

function throwIfSendFailed(ref: MutableRefObject<string[]>): void {
  const failure = ref.current[0];
  if (failure !== undefined) throw new Error(`Browser send failed: ${failure}`);
}

function renderStreamItem(item: ChatStreamItem): JSX.Element | null {
  if (item.kind === "message") {
    return (
      <MessageBubble
        key={item.id}
        role={item.role}
        content={item.content}
        rawContent={item.rawContent}
        {...(item.streaming !== undefined && { streaming: item.streaming })}
        renderToggles={resolveRenderToggles({})}
      />
    );
  }
  if (item.kind === "tool-entry") {
    return (
      <ToolCallDisclosure
        key={item.callId}
        toolName={item.toolName}
        verdict={item.status === "errored" ? "error" : item.status === "settled" ? "ok" : "running"}
        {...(item.input !== undefined && { input: item.input })}
        {...(item.output !== undefined && { output: item.output })}
        {...(item.errorMessage !== undefined && { errorMessage: item.errorMessage })}
      />
    );
  }
  if (item.kind === "thinking") {
    return <div key={item.id}>{item.content}</div>;
  }
  if (item.kind === "pending-message") {
    return <div key={item.id}>{item.text}</div>;
  }
  return null;
}

async function waitForPendingQuickCheck(
  ref: MutableRefObject<Array<QuickCheckEvent & { resolved?: boolean }>>,
): Promise<Extract<QuickCheckEvent, { kind: "pending" }>> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const pending = ref.current.find(
      (event): event is Extract<QuickCheckEvent, { kind: "pending" }> & { resolved?: boolean } =>
        event.kind === "pending" && event.resolved !== true,
    );
    if (pending !== undefined) return pending;
    await delay(25);
  }
  throw new Error("Timed out waiting for browser quick-check card");
}

async function waitForTextExpectation(text: string, absent: boolean): Promise<boolean> {
  for (let attempt = 0; attempt < 40; attempt++) {
    const found = document.body.innerText.includes(text);
    if (absent ? !found : found) return found;
    await delay(50);
  }
  return document.body.innerText.includes(text);
}

function detectBrowserVisibleAnomalies(bodyText: string): string[] {
  return ["<invoke", "[object Object]"].filter((needle) => bodyText.includes(needle));
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    const timeout = setTimeout(resolve, 25);
    requestAnimationFrame(() => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const SIMULATION_CSS = `
  body { background: var(--color-bg-primary); color: var(--color-text-primary); font-family: var(--font-body); }
  .simulation-shell { min-height: 100vh; padding: 24px; }
  .simulation-header { margin-bottom: 18px; }
  .simulation-header p, .simulation-meta { color: var(--color-text-secondary); font-family: var(--font-sans); font-size: 13px; }
  .simulation-header h1 { font-size: 28px; line-height: 1.2; margin-top: 4px; }
  .simulation-surface { max-width: 840px; margin: 0 auto; }
  .simulation-chat { display: grid; gap: 12px; margin-block: 16px; }
  .simulation-empty { color: var(--color-text-secondary); }
`;

createRoot(document.getElementById("root") ?? document.body).render(<SimulationApp />);
