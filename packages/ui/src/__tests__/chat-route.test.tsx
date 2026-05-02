import type { EngineEvent, PraxisClient, SessionHandle, Timestamp } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PraxisClientProvider } from "../context/client-context.js";
import { ChatRoute } from "../routes/chat.js";

afterEach(() => cleanup());

// useSearch and useNavigate require a RouterProvider — mock them.
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useSearch: () => ({}),
    useNavigate: () => vi.fn(),
  };
});

function makeFakeClient(overrides?: Partial<PraxisClient["session"]>): PraxisClient {
  const session: PraxisClient["session"] = {
    active: vi.fn().mockResolvedValue(null),
    start: vi.fn().mockResolvedValue({
      sessionId: brandId<"SessionId">("s1"),
      modeId: "teach",
      startedAt: Date.now() as Timestamp,
    } satisfies SessionHandle),
    end: vi.fn().mockResolvedValue({
      sessionId: brandId<"SessionId">("s1"),
      endedAt: Date.now() as Timestamp,
      unlockedGates: [],
      newMisconceptions: 0,
    }),
    send: vi.fn(async function* (): AsyncIterable<EngineEvent> {
      yield { type: "model_message", content: "Hello!", partial: false };
      yield { type: "final", usage: { inputTokens: 0, outputTokens: 0 } };
    }) as unknown as PraxisClient["session"]["send"],
    ...overrides,
  };

  return {
    session,
    artifacts: {} as PraxisClient["artifacts"],
    author: {} as PraxisClient["author"],
    memory: {} as PraxisClient["memory"],
    config: {} as PraxisClient["config"],
    ingest: {} as PraxisClient["ingest"],
    documents: {} as PraxisClient["documents"],
    assignments: {} as PraxisClient["assignments"],
    packs: {} as PraxisClient["packs"],
    notes: {} as PraxisClient["notes"],
    flashcards: {} as PraxisClient["flashcards"],
    claudeAuth: {} as PraxisClient["claudeAuth"],
    shell: {} as PraxisClient["shell"],
  };
}

function renderWithClient(client: PraxisClient) {
  return render(
    <PraxisClientProvider client={client}>
      <ChatRoute />
    </PraxisClientProvider>,
  );
}

describe("ChatRoute", () => {
  it("calls session.start on mount", async () => {
    const client = makeFakeClient();
    renderWithClient(client);

    await waitFor(() => {
      expect(client.session.start).toHaveBeenCalledWith({ modeId: "teach" });
    });
  });

  it("shows 'Session active' once session starts", async () => {
    const client = makeFakeClient();
    renderWithClient(client);

    await waitFor(() => {
      expect(screen.getByText("Session active")).toBeDefined();
    });
  });

  it("shows error banner if session.start throws a generic error", async () => {
    const client = makeFakeClient({
      start: vi.fn().mockRejectedValue(new Error("Engine unavailable")),
    });
    renderWithClient(client);

    await waitFor(() => {
      expect(screen.getByText(/Engine unavailable/)).toBeDefined();
    });
  });

  it("has a New chat button", async () => {
    const client = makeFakeClient();
    renderWithClient(client);

    await waitFor(() => {
      const buttons = screen.getAllByRole("button", { name: /new chat/i });
      expect(buttons.length).toBeGreaterThan(0);
    });
  });

  // ── Auth error integration tests ─────────────────────────────────────────────

  it("shows auth banner (not generic error) when session.start fails with auth-required error", async () => {
    const client = makeFakeClient({
      start: vi.fn().mockRejectedValue(new Error("claude.auth.required: not signed in")),
    });
    renderWithClient(client);

    await waitFor(() => {
      expect(screen.getByText("Not signed in to Claude.")).toBeDefined();
    });

    // Generic error banner must NOT show
    expect(screen.queryByText(/Session error:/)).toBeNull();
  });

  it("does not show auth banner for non-auth errors", async () => {
    const client = makeFakeClient({
      start: vi.fn().mockRejectedValue(new Error("Engine unavailable")),
    });
    renderWithClient(client);

    await waitFor(() => {
      expect(screen.getByText(/Engine unavailable/)).toBeDefined();
    });

    expect(screen.queryByText("Not signed in to Claude.")).toBeNull();
  });

  it("clicking Sign in button mounts the ClaudeAuthModal", async () => {
    const client = makeFakeClient({
      start: vi.fn().mockRejectedValue(new Error("claude.auth.required: not signed in")),
    });
    // Provide real claudeAuth + shell so the modal renders without crashing
    client.claudeAuth = {
      status: vi.fn(),
      login: vi.fn(() =>
        (async function* () {
          // Yield nothing — keeps the modal open in awaiting state
        })(),
      ),
    } as PraxisClient["claudeAuth"];
    client.shell = {
      openExternal: vi.fn().mockResolvedValue(undefined),
    };
    renderWithClient(client);

    await waitFor(() => {
      expect(screen.getByText("Not signed in to Claude.")).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      // The modal title should appear
      expect(screen.getByRole("dialog")).toBeDefined();
      expect(screen.getByText("Sign in to Claude")).toBeDefined();
    });
  });
});
