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
 * - Sign-in button renders only for claude-code engine.
 * - Sign-in button opens ClaudeAuthModal on click.
 * - Button label reflects signed-in state.
 */
import type { PraxisClient } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OnboardingFlow } from "../components/onboarding-flow.js";
import { PraxisClientProvider } from "../context/client-context.js";
import { COPY } from "../lib/copy.js";
import { makeFakeClient } from "./helpers/fake-client.js";

// Mock ClaudeAuthModal to avoid rendering its internals (requires client.claudeAuth.login stream).
vi.mock("../components/claude-auth-modal.js", () => ({
  ClaudeAuthModal: ({ onClose, onSignedIn }: { onClose: () => void; onSignedIn: () => void }) => (
    <div data-testid="claude-auth-modal">
      <button type="button" onClick={onClose}>
        Close
      </button>
      <button type="button" onClick={onSignedIn}>
        Signed In
      </button>
    </div>
  ),
}));

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
  engineId?: string;
  claudeLoggedIn?: boolean;
  sendSpy?: (sessionId: string, message: string) => void;
}): PraxisClient {
  return makeFakeClient({
    config: {
      isLocked: vi.fn(),
      setLockCode: vi.fn(),
      unlock: vi.fn(),
      selectedEngine: vi.fn(),
      setSelectedEngine: vi.fn(),
      engineConfig: vi.fn().mockResolvedValue({ engineId: opts?.engineId ?? "direct.anthropic" }),
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
      send: vi.fn((sessionId: string, message: string) => {
        opts?.sendSpy?.(sessionId, message);
        // Return an async iterable that completes immediately.
        return {
          [Symbol.asyncIterator]() {
            return {
              next: async () => ({ value: undefined as never, done: true as const }),
            };
          },
        };
      }),
    } as unknown as PraxisClient["session"],
    tabs: {
      open: vi.fn(async () => ({ id: "tab-1" })),
    } as unknown as PraxisClient["tabs"],
    claudeAuth: {
      status: vi.fn().mockResolvedValue({ loggedIn: opts?.claudeLoggedIn ?? false }),
      login: vi.fn(),
    } as unknown as PraxisClient["claudeAuth"],
  });
}

function renderFlow(opts?: { onComplete?: () => Promise<void>; client?: PraxisClient }) {
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
    await waitFor(() => expect(screen.getByText(COPY.onboarding.engineTitle)).toBeDefined());

    fireEvent.click(screen.getByText(COPY.onboarding.continueLabel));
    await waitFor(() => expect(screen.getByText(COPY.onboarding.courseTitle)).toBeDefined());
  });

  it("back from engine returns to welcome", async () => {
    renderFlow();
    fireEvent.click(screen.getByText(COPY.onboarding.continueLabel));
    await waitFor(() => expect(screen.getByText(COPY.onboarding.engineTitle)).toBeDefined());

    fireEvent.click(screen.getByText(COPY.onboarding.backLabel));
    expect(screen.getByText(COPY.onboarding.welcomeTitle)).toBeDefined();
  });

  it("skip on welcome calls onComplete", async () => {
    const onComplete = vi.fn(async () => undefined);
    renderFlow({ onComplete });
    fireEvent.click(screen.getByText(COPY.onboarding.skipLabel));
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
  });

  it("skip on engine step calls onComplete", async () => {
    const onComplete = vi.fn(async () => undefined);
    renderFlow({ onComplete });
    fireEvent.click(screen.getByText(COPY.onboarding.continueLabel));
    await waitFor(() => expect(screen.getByText(COPY.onboarding.engineTitle)).toBeDefined());
    fireEvent.click(screen.getAllByText(COPY.onboarding.skipLabel)[0]);
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
  });

  it("skip on course step calls onComplete", async () => {
    const onComplete = vi.fn(async () => undefined);
    renderFlow({ onComplete });
    fireEvent.click(screen.getByText(COPY.onboarding.continueLabel));
    await waitFor(() => expect(screen.getByText(COPY.onboarding.engineTitle)).toBeDefined());
    fireEvent.click(screen.getByText(COPY.onboarding.continueLabel));
    await waitFor(() => expect(screen.getByText(COPY.onboarding.courseTitle)).toBeDefined());
    fireEvent.click(screen.getByText(COPY.onboarding.skipLabel));
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
  });

  it("engine step writes engine config when continuing", async () => {
    const setEngineConfigSpy = vi.fn();
    const client = buildClient({ setEngineConfigSpy });
    renderFlow({ client });
    fireEvent.click(screen.getByText(COPY.onboarding.continueLabel));
    await waitFor(() => expect(screen.getByText(COPY.onboarding.engineTitle)).toBeDefined());

    fireEvent.click(screen.getByText(COPY.onboarding.continueLabel));
    await waitFor(() => expect(setEngineConfigSpy).toHaveBeenCalledTimes(1));
  });

  it("course card click marks complete and opens a bootstrap session", async () => {
    const startSpy = vi.fn();
    const onComplete = vi.fn(async () => undefined);
    const client = buildClient({ startSpy });
    renderFlow({ client, onComplete });
    fireEvent.click(screen.getByText(COPY.onboarding.continueLabel));
    await waitFor(() => expect(screen.getByText(COPY.onboarding.engineTitle)).toBeDefined());
    fireEvent.click(screen.getByText(COPY.onboarding.continueLabel));
    await waitFor(() => expect(screen.getByText(COPY.onboarding.courseTitle)).toBeDefined());

    fireEvent.click(screen.getByText(COPY.onboarding.courseAlgebraLabel));
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    expect(startSpy).toHaveBeenCalledWith({ modeId: "bootstrap" });
  });

  describe("pre-seed messages on canonical course cards", () => {
    async function goToCourseStep(client: PraxisClient) {
      const onComplete = vi.fn(async () => undefined);
      renderFlow({ client, onComplete });
      fireEvent.click(screen.getByText(COPY.onboarding.continueLabel));
      await waitFor(() => expect(screen.getByText(COPY.onboarding.engineTitle)).toBeDefined());
      fireEvent.click(screen.getByText(COPY.onboarding.continueLabel));
      await waitFor(() => expect(screen.getByText(COPY.onboarding.courseTitle)).toBeDefined());
      return { onComplete };
    }

    it("Algebra card pre-seeds canonical algebra-1 pack message", async () => {
      const sendSpy = vi.fn();
      const client = buildClient({ sendSpy });
      await goToCourseStep(client);

      fireEvent.click(screen.getByText(COPY.onboarding.courseAlgebraLabel));
      await waitFor(() =>
        expect(sendSpy).toHaveBeenCalledWith(
          "sess-1",
          "Please use the canonical algebra-1 pack to create my course.",
        ),
      );
    });

    it("Biology card pre-seeds canonical biology pack message", async () => {
      const sendSpy = vi.fn();
      const client = buildClient({ sendSpy });
      await goToCourseStep(client);

      fireEvent.click(screen.getByText(COPY.onboarding.courseBiologyLabel));
      await waitFor(() =>
        expect(sendSpy).toHaveBeenCalledWith(
          "sess-1",
          "Please use the canonical biology pack to create my course.",
        ),
      );
    });

    it("Syllabus card does not call session.send", async () => {
      const sendSpy = vi.fn();
      const client = buildClient({ sendSpy });
      await goToCourseStep(client);

      fireEvent.click(screen.getByText(COPY.onboarding.courseFromSyllabusLabel));
      // Allow async work to settle before asserting absence.
      await waitFor(() => expect(client.tabs.open).toHaveBeenCalled());
      expect(sendSpy).not.toHaveBeenCalled();
    });
  });

  describe("EngineStep — claude-code sign-in button", () => {
    async function goToEngineStep(client: PraxisClient) {
      const onComplete = vi.fn(async () => undefined);
      renderFlow({ client, onComplete });
      fireEvent.click(screen.getByText(COPY.onboarding.continueLabel));
      await waitFor(() => expect(screen.getByText(COPY.onboarding.engineTitle)).toBeDefined());
      return { onComplete };
    }

    it("shows 'Sign in to Claude Code' button when engine is claude-code and not signed in", async () => {
      const client = buildClient({ engineId: "claude-code", claudeLoggedIn: false });
      await goToEngineStep(client);
      await waitFor(() => expect(screen.getByText("Sign in to Claude Code")).toBeDefined());
    });

    it("shows signed-in badge when engine is claude-code and already signed in", async () => {
      const client = buildClient({ engineId: "claude-code", claudeLoggedIn: true });
      await goToEngineStep(client);
      await waitFor(() => expect(screen.getByText("✓ Signed in")).toBeDefined());
    });

    it("does not render the sign-in button for non-claude-code engines", async () => {
      const client = buildClient({ engineId: "direct.anthropic" });
      await goToEngineStep(client);
      // Let any async effects settle before asserting absence.
      await waitFor(() => expect(screen.getByText(COPY.onboarding.engineTitle)).toBeDefined());
      expect(screen.queryByText("Sign in to Claude Code")).toBeNull();
      expect(screen.queryByText("✓ Signed in")).toBeNull();
    });

    it("opens ClaudeAuthModal when the sign-in button is clicked", async () => {
      const client = buildClient({ engineId: "claude-code", claudeLoggedIn: false });
      await goToEngineStep(client);
      await waitFor(() => expect(screen.getByText("Sign in to Claude Code")).toBeDefined());
      fireEvent.click(screen.getByText("Sign in to Claude Code"));
      expect(screen.getByTestId("claude-auth-modal")).toBeDefined();
    });

    it("updates button label to signed-in after successful auth", async () => {
      const client = buildClient({ engineId: "claude-code", claudeLoggedIn: false });
      await goToEngineStep(client);
      await waitFor(() => expect(screen.getByText("Sign in to Claude Code")).toBeDefined());
      fireEvent.click(screen.getByText("Sign in to Claude Code"));
      // Simulate successful sign-in via the mock modal's "Signed In" button.
      fireEvent.click(screen.getByText("Signed In"));
      await waitFor(() => expect(screen.getByText("✓ Signed in")).toBeDefined());
    });
  });
});
