/**
 * Tests for OnboardingFlow component.
 *
 * Verifies:
 * - Renders the welcome step initially.
 * - Continue advances welcome → engine → course.
 * - Back returns to the previous step.
 * - Skip on any step calls onComplete.
 * - Engine step writes engine config when continuing.
 * - Course-card click calls onComplete then navigates to /course-create.
 * - Algebra card navigates with ?pack=algebra-1.
 * - Biology card navigates with ?pack=biology.
 * - Syllabus card navigates without a pack param.
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

// navigate spy shared across tests — reset per test via the factory.
let navigateSpy = vi.fn(async () => undefined);

// Mock TanStack Router — CourseStep uses useNavigate.
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: () => navigateSpy,
  };
});

function buildClient(opts?: {
  setEngineConfigSpy?: (cfg: { engineId: string; apiKey?: string }) => Promise<void> | void;
  engineId?: string;
  claudeLoggedIn?: boolean;
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
      courseCreateConfig: vi.fn(),
      setCourseCreateConfig: vi.fn(),
      firstRunCompleted: vi.fn().mockResolvedValue(false),
      markFirstRunComplete: vi.fn(),
    } as unknown as PraxisClient["config"],
    claudeAuth: {
      status: vi.fn().mockResolvedValue({ loggedIn: opts?.claudeLoggedIn ?? false }),
      login: vi.fn(),
    } as unknown as PraxisClient["claudeAuth"],
  });
}

function renderFlow(opts?: { onComplete?: () => Promise<void>; client?: PraxisClient }) {
  navigateSpy = vi.fn(async () => undefined);
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

  async function goToCourseStep(opts?: {
    client?: PraxisClient;
    onComplete?: () => Promise<void>;
  }) {
    const onComplete = opts?.onComplete ?? vi.fn(async () => undefined);
    const client = opts?.client ?? buildClient();
    renderFlow({ client, onComplete });
    fireEvent.click(screen.getByText(COPY.onboarding.continueLabel));
    await waitFor(() => expect(screen.getByText(COPY.onboarding.engineTitle)).toBeDefined());
    fireEvent.click(screen.getByText(COPY.onboarding.continueLabel));
    await waitFor(() => expect(screen.getByText(COPY.onboarding.courseTitle)).toBeDefined());
    return { client, onComplete };
  }

  describe("course card navigation", () => {
    it("Algebra card calls onComplete then navigates to /course-create?pack=algebra-1", async () => {
      const callOrder: string[] = [];
      const onComplete = vi.fn(async () => {
        callOrder.push("onComplete");
      });
      await goToCourseStep({ onComplete });

      fireEvent.click(screen.getByText(COPY.onboarding.courseAlgebraLabel));
      await waitFor(() => expect(navigateSpy).toHaveBeenCalled());

      expect(onComplete).toHaveBeenCalled();
      expect(navigateSpy).toHaveBeenCalledWith({
        to: "/course-create",
        search: { pack: "algebra-1" },
      });
      // onComplete fires before navigate.
      expect(callOrder[0]).toBe("onComplete");
    });

    it("Biology card calls onComplete then navigates to /course-create?pack=biology", async () => {
      const onComplete = vi.fn(async () => undefined);
      await goToCourseStep({ onComplete });

      fireEvent.click(screen.getByText(COPY.onboarding.courseBiologyLabel));
      await waitFor(() => expect(navigateSpy).toHaveBeenCalled());

      expect(onComplete).toHaveBeenCalled();
      expect(navigateSpy).toHaveBeenCalledWith({
        to: "/course-create",
        search: { pack: "biology" },
      });
    });

    it("Syllabus card calls onComplete then navigates to /course-create without pack", async () => {
      const onComplete = vi.fn(async () => undefined);
      await goToCourseStep({ onComplete });

      fireEvent.click(screen.getByText(COPY.onboarding.courseFromSyllabusLabel));
      await waitFor(() => expect(navigateSpy).toHaveBeenCalled());

      expect(onComplete).toHaveBeenCalled();
      expect(navigateSpy).toHaveBeenCalledWith({ to: "/course-create" });
    });
  });

  describe("EngineStep — accessible label association", () => {
    async function goToEngineStepAndSettle(client: PraxisClient) {
      renderFlow({ client });
      fireEvent.click(screen.getByText(COPY.onboarding.continueLabel));
      await waitFor(() => expect(screen.getByText(COPY.onboarding.engineTitle)).toBeDefined());
    }

    it("engine select has an accessible name via <label>", async () => {
      const client = buildClient({ engineId: "direct.anthropic" });
      await goToEngineStepAndSettle(client);
      // getByLabelText throws if no label association exists — this is the regression guard.
      expect(screen.getByLabelText("Engine")).toBeDefined();
    });

    it("API key input has an accessible name via <label>", async () => {
      const client = buildClient({ engineId: "direct.anthropic" });
      await goToEngineStepAndSettle(client);
      expect(screen.getByLabelText("API key")).toBeDefined();
    });

    it("API key field is not rendered for claude-code engine", async () => {
      const client = buildClient({ engineId: "claude-code" });
      await goToEngineStepAndSettle(client);
      expect(screen.queryByLabelText("API key")).toBeNull();
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
