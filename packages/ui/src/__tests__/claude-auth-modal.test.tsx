import type { PraxisClient } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClaudeAuthModal } from "../components/claude-auth-modal.js";
import { PraxisClientProvider } from "../context/client-context.js";
import { makeFakeClient } from "./helpers/fake-client.js";

afterEach(() => cleanup());

// ── Fake client helpers ────────────────────────────────────────────────────────

function makeClient(overrides?: {
  loginEvents?: Array<{ kind: string; [k: string]: unknown }>;
  openExternal?: ReturnType<typeof vi.fn>;
}): PraxisClient {
  const events = overrides?.loginEvents ?? [];
  const openExternal = overrides?.openExternal ?? vi.fn().mockResolvedValue(undefined);

  const login = vi.fn(() =>
    (async function* () {
      for (const event of events) {
        yield event as Parameters<typeof login>[0];
      }
    })(),
  );

  return makeFakeClient({
    claudeAuth: {
      status: vi.fn(),
      login,
    } as PraxisClient["claudeAuth"],
    shell: {
      openExternal,
    } as PraxisClient["shell"],
  });
}

function renderModal(client: PraxisClient, onClose = vi.fn(), onSignedIn = vi.fn()) {
  return render(
    <PraxisClientProvider client={client}>
      <ClaudeAuthModal onClose={onClose} onSignedIn={onSignedIn} />
    </PraxisClientProvider>,
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("ClaudeAuthModal", () => {
  it("renders idle phase initially with Sign in button", () => {
    const client = makeClient();
    renderModal(client);

    expect(screen.getByText("Sign in to Claude")).toBeDefined();
    expect(screen.getByRole("button", { name: /sign in with claude\.ai/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /cancel/i })).toBeDefined();
  });

  it("clicking Sign in calls client.claudeAuth.login() exactly once", async () => {
    const client = makeClient({ loginEvents: [] });
    renderModal(client);

    fireEvent.click(screen.getByRole("button", { name: /sign in with claude\.ai/i }));

    await waitFor(() => {
      expect(client.claudeAuth.login).toHaveBeenCalledOnce();
    });
  });

  it("transitions to awaiting_url after started event", async () => {
    const client = makeClient({
      loginEvents: [{ kind: "started" }],
    });
    renderModal(client);

    fireEvent.click(screen.getByRole("button", { name: /sign in with claude\.ai/i }));

    await waitFor(() => {
      expect(screen.getByText(/starting sign-in flow/i)).toBeDefined();
    });
  });

  it("transitions to url phase and calls openExternal once on first url event", async () => {
    const openExternal = vi.fn().mockResolvedValue(undefined);
    const client = makeClient({
      loginEvents: [
        { kind: "started" },
        { kind: "url", url: "https://claude.ai/oauth/test" },
        // Second url event — openExternal must NOT be called again
        { kind: "url", url: "https://claude.ai/oauth/test2" },
      ],
      openExternal,
    });
    renderModal(client);

    fireEvent.click(screen.getByRole("button", { name: /sign in with claude\.ai/i }));

    await waitFor(() => {
      // The textarea with the URL should appear
      const textarea = screen.getByRole("textbox") as HTMLTextAreaElement;
      expect(textarea.value).toBe("https://claude.ai/oauth/test2");
    });

    expect(openExternal).toHaveBeenCalledOnce();
    expect(openExternal).toHaveBeenCalledWith("https://claude.ai/oauth/test");
  });

  it("calls onSignedIn when stream yields succeeded", async () => {
    const onSignedIn = vi.fn();
    const client = makeClient({
      loginEvents: [
        { kind: "started" },
        { kind: "url", url: "https://claude.ai/oauth/x" },
        { kind: "succeeded", status: { loggedIn: true } },
      ],
    });
    renderModal(client, vi.fn(), onSignedIn);

    fireEvent.click(screen.getByRole("button", { name: /sign in with claude\.ai/i }));

    await waitFor(() => {
      expect(onSignedIn).toHaveBeenCalledOnce();
    });
  });

  it("shows error message and Try again button on failed event", async () => {
    const client = makeClient({
      loginEvents: [{ kind: "started" }, { kind: "failed", message: "auth timed out" }],
    });
    renderModal(client);

    fireEvent.click(screen.getByRole("button", { name: /sign in with claude\.ai/i }));

    await waitFor(() => {
      expect(screen.getByText(/auth timed out/)).toBeDefined();
      expect(screen.getByRole("button", { name: /try again/i })).toBeDefined();
    });
  });

  it("clicking Try again restarts the login flow (calls login a second time)", async () => {
    const client = makeClient({
      loginEvents: [{ kind: "failed", message: "network error" }],
    });
    renderModal(client);

    // First click
    fireEvent.click(screen.getByRole("button", { name: /sign in with claude\.ai/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /try again/i })).toBeDefined();
    });

    // Second click via Try again
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    await waitFor(() => {
      expect(client.claudeAuth.login).toHaveBeenCalledTimes(2);
    });
  });

  it("pressing Escape calls onClose", async () => {
    const onClose = vi.fn();
    const client = makeClient();
    renderModal(client, onClose);

    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledOnce();
    });
  });

  it("clicking the backdrop calls onClose", () => {
    const onClose = vi.fn();
    const client = makeClient();
    renderModal(client, onClose);

    const dialog = screen.getByRole("dialog");
    fireEvent.click(dialog);

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("clicking inside the modal card does not call onClose", () => {
    const onClose = vi.fn();
    const client = makeClient();
    renderModal(client, onClose);

    // Click the title which is inside the modal card, not on the backdrop
    fireEvent.click(screen.getByText("Sign in to Claude"));

    expect(onClose).not.toHaveBeenCalled();
  });

  it("ignores stdout and stderr events without changing visible phase", async () => {
    const client = makeClient({
      loginEvents: [
        { kind: "started" },
        { kind: "stdout", line: "some debug output" },
        { kind: "stderr", line: "some stderr" },
      ],
    });
    renderModal(client);

    fireEvent.click(screen.getByRole("button", { name: /sign in with claude\.ai/i }));

    // After started we should be in awaiting_url (no visible URL or error)
    await waitFor(() => {
      expect(screen.getByText(/starting sign-in flow/i)).toBeDefined();
    });

    // No error should be visible
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
