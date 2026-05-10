/**
 * Tests for OnboardingFlow component.
 *
 * Verifies:
 * - Renders the welcome step initially.
 * - Continue advances welcome → engine → course.
 * - Back returns to the previous step.
 * - Skip on any step calls onComplete.
 * - Engine step writes engine config when continuing.
 * - Course-card click marks complete and opens a bootstrap session.
 */
import type { PraxisClient } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OnboardingFlow } from "../components/onboarding-flow.js";
import { PraxisClientProvider } from "../context/client-context.js";
import { COPY } from "../lib/copy.js";
import { makeFakeClient } from "./helpers/fake-client.js";

afterEach(() => cleanup());

// Mock TanStack Router — CourseStep uses useNavigate.
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: () => vi.fn(async () => undefined),
  };
});

function buildClient(opts?: {
  setEngineConfigSpy?: (cfg: { engineId: string; apiKey?: string }) => Promise<void> | void;
  startSpy?: (opts: { modeId: string }) => Promise<void> | void;
  startRejects?: boolean;
}): PraxisClient {
  return makeFakeClient({
    config: {
      isLocked: vi.fn(),
      setLockCode: vi.fn(),
      unlock: vi.fn(),
      selectedEngine: vi.fn(),
      setSelectedEngine: vi.fn(),
      engineConfig: vi.fn().mockResolvedValue({ engineId: "direct.anthropic" }),
      setEngineConfig: vi.fn(async (cfg: { engineId: string; apiKey?: string }) => {
        await opts?.setEngineConfigSpy?.(cfg);
      }),
      bootstrapConfig: vi.fn(),
      setBootstrapConfig: vi.fn(),
      firstRunCompleted: vi.fn().mockResolvedValue(false),
      markFirstRunComplete: vi.fn(),
    } as unknown as PraxisClient["config"],
    session: {
      start: vi.fn(async (input: { modeId: string }) => {
        if (opts?.startRejects) throw new Error("session start failed");
        await opts?.startSpy?.(input);
        return { sessionId: "sess-1" };
      }),
    } as unknown as PraxisClient["session"],
    tabs: {
      open: vi.fn(async () => ({ id: "tab-1" })),
    } as unknown as PraxisClient["tabs"],
  });
}

function renderFlow(opts?: {
  onComplete?: () => Promise<void>;
  client?: PraxisClient;
}) {
  const client = opts?.client ?? buildClient();
  const onComplete = opts?.onComplete ?? vi.fn(async () => undefined);
  render(
    <PraxisClientProvider client={client}>
      <OnboardingFlow onComplete={onComplete} />
    </PraxisClientProvider>,
  );
  return { client, onComplete };
}

describe("OnboardingFlow", () => {
  it("renders the welcome step first", () => {
    renderFlow();
    expect(screen.getByText(COPY.onboarding.welcomeTitle)).toBeDefined();
  });

  it("continue advances welcome → engine → course", async () => {
    renderFlow();
    fireEvent.click(screen.getByText(COPY.onboarding.continueLabel));
    await waitFor(() =>
      expect(screen.getByText(COPY.onboarding.engineTitle)).toBeDefined(),
    );

    fireEvent.click(screen.getByText(COPY.onboarding.continueLabel));
    await waitFor(() =>
      expect(screen.getByText(COPY.onboarding.courseTitle)).toBeDefined(),
    );
  });

  it("back from engine returns to welcome", async () => {
    renderFlow();
    fireEvent.click(screen.getByText(COPY.onboarding.continueLabel));
    await waitFor(() =>
      expect(screen.getByText(COPY.onboarding.engineTitle)).toBeDefined(),
    );

    fireEvent.click(screen.getByText(COPY.onboarding.backLabel));
    expect(screen.getByText(COPY.onboarding.welcomeTitle)).toBeDefined();
  });

  it("skip on welcome calls onComplete", async () => {
    const onComplete = vi.fn(async () => undefined);
    renderFlow({ onComplete });
    fireEvent.click(screen.getByText(COPY.onboarding.skipLabel));
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
  });

  it("engine step writes engine config when continuing", async () => {
    const setEngineConfigSpy = vi.fn();
    const client = buildClient({ setEngineConfigSpy });
    renderFlow({ client });
    fireEvent.click(screen.getByText(COPY.onboarding.continueLabel));
    await waitFor(() =>
      expect(screen.getByText(COPY.onboarding.engineTitle)).toBeDefined(),
    );

    fireEvent.click(screen.getByText(COPY.onboarding.continueLabel));
    await waitFor(() => expect(setEngineConfigSpy).toHaveBeenCalledTimes(1));
  });

  it("course card click marks complete and opens a bootstrap session", async () => {
    const startSpy = vi.fn();
    const onComplete = vi.fn(async () => undefined);
    const client = buildClient({ startSpy });
    renderFlow({ client, onComplete });
    fireEvent.click(screen.getByText(COPY.onboarding.continueLabel));
    await waitFor(() =>
      expect(screen.getByText(COPY.onboarding.engineTitle)).toBeDefined(),
    );
    fireEvent.click(screen.getByText(COPY.onboarding.continueLabel));
    await waitFor(() =>
      expect(screen.getByText(COPY.onboarding.courseTitle)).toBeDefined(),
    );

    fireEvent.click(screen.getByText(COPY.onboarding.courseAlgebraLabel));
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    expect(startSpy).toHaveBeenCalledWith({ modeId: "bootstrap" });
  });
});
