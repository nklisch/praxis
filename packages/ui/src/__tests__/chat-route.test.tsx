import type { EngineEvent, PraxisClient, SessionHandle, Timestamp } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PraxisClientProvider } from "../context/client-context.js";
import { ChatRoute } from "../routes/chat.js";

// useSearch requires a RouterProvider — mock it to return no search params.
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useSearch: () => ({}),
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

  it("shows error banner if session.start throws", async () => {
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
});
