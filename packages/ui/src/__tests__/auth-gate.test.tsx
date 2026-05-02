/**
 * Tests for <AuthGate /> and the AuthProvider/useAuthStatus context.
 *
 * Key behavior: multiple AuthGate instances share a single auth status via
 * AuthProvider. When flagAuthRequired() is called, all gates show their banner.
 * When clearAuthRequired() is called (e.g., after sign-in), all gates clear.
 */
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthGate } from "../components/auth-gate.js";
import { AuthProvider, useAuthStatus } from "../context/auth-context.js";
import { PraxisClientProvider } from "../context/client-context.js";
import { makeFakeClient } from "./helpers/fake-client.js";

afterEach(() => cleanup());

// Mock TanStack Router (AuthGate uses useNavigate)
vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useNavigate: () => vi.fn(),
  };
});

// Mock ClaudeAuthModal — we're testing AuthGate's banner behavior, not the modal
vi.mock("../components/claude-auth-modal.js", () => ({
  ClaudeAuthModal: ({
    onClose,
    onSignedIn,
  }: { onClose: () => void; onSignedIn: () => void }) => (
    <div data-testid="auth-modal">
      <button type="button" onClick={onClose}>
        Cancel
      </button>
      <button type="button" onClick={onSignedIn}>
        Signed In
      </button>
    </div>
  ),
}));

/** Small harness that exposes flagAuthRequired and clearAuthRequired as buttons */
function AuthHarness({ children }: { children: React.ReactNode }) {
  const { flagAuthRequired, clearAuthRequired } = useAuthStatus();
  return (
    <>
      <button type="button" onClick={flagAuthRequired}>
        flag
      </button>
      <button type="button" onClick={clearAuthRequired}>
        clear
      </button>
      {children}
    </>
  );
}

function renderWithProviders(ui: React.ReactNode) {
  const client = makeFakeClient();
  return render(
    <PraxisClientProvider client={client}>
      <AuthProvider>
        <AuthHarness>{ui}</AuthHarness>
      </AuthProvider>
    </PraxisClientProvider>,
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("AuthGate", () => {
  it("does not show the auth banner when needsAuth is false", () => {
    renderWithProviders(<AuthGate><p>Child content</p></AuthGate>);

    expect(screen.queryByText("Not signed in to Claude.")).toBeNull();
    expect(screen.getByText("Child content")).toBeDefined();
  });

  it("shows the auth banner when flagAuthRequired is called", async () => {
    renderWithProviders(<AuthGate><p>Child content</p></AuthGate>);

    fireEvent.click(screen.getByRole("button", { name: "flag" }));

    await waitFor(() => {
      expect(screen.getByText("Not signed in to Claude.")).toBeDefined();
    });
  });

  it("clears the auth banner when clearAuthRequired is called", async () => {
    renderWithProviders(<AuthGate><p>Child content</p></AuthGate>);

    fireEvent.click(screen.getByRole("button", { name: "flag" }));
    await waitFor(() => {
      expect(screen.getByText("Not signed in to Claude.")).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: "clear" }));
    await waitFor(() => {
      expect(screen.queryByText("Not signed in to Claude.")).toBeNull();
    });
  });

  it("both AuthGate instances show banner when flagAuthRequired fires", async () => {
    renderWithProviders(
      <>
        <AuthGate><p>Gate A</p></AuthGate>
        <AuthGate><p>Gate B</p></AuthGate>
      </>,
    );

    fireEvent.click(screen.getByRole("button", { name: "flag" }));

    await waitFor(() => {
      const banners = screen.getAllByText("Not signed in to Claude.");
      expect(banners).toHaveLength(2);
    });
  });

  it("both AuthGate instances clear when clearAuthRequired fires", async () => {
    renderWithProviders(
      <>
        <AuthGate><p>Gate A</p></AuthGate>
        <AuthGate><p>Gate B</p></AuthGate>
      </>,
    );

    fireEvent.click(screen.getByRole("button", { name: "flag" }));
    await waitFor(() => {
      expect(screen.getAllByText("Not signed in to Claude.")).toHaveLength(2);
    });

    fireEvent.click(screen.getByRole("button", { name: "clear" }));
    await waitFor(() => {
      expect(screen.queryByText("Not signed in to Claude.")).toBeNull();
    });
  });

  it("opens ClaudeAuthModal when Sign in button is clicked", async () => {
    renderWithProviders(<AuthGate><p>Child</p></AuthGate>);

    fireEvent.click(screen.getByRole("button", { name: "flag" }));
    await waitFor(() => {
      expect(screen.getByText("Not signed in to Claude.")).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => {
      expect(screen.getByTestId("auth-modal")).toBeDefined();
    });
  });

  it("clears the banner and calls onSignedIn when sign-in succeeds", async () => {
    const onSignedIn = vi.fn();
    renderWithProviders(<AuthGate onSignedIn={onSignedIn}><p>Child</p></AuthGate>);

    fireEvent.click(screen.getByRole("button", { name: "flag" }));
    await waitFor(() => {
      expect(screen.getByText("Not signed in to Claude.")).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => {
      expect(screen.getByTestId("auth-modal")).toBeDefined();
    });

    fireEvent.click(screen.getByRole("button", { name: "Signed In" }));

    await waitFor(() => {
      expect(screen.queryByText("Not signed in to Claude.")).toBeNull();
      expect(onSignedIn).toHaveBeenCalledOnce();
    });
  });

  it("cross-tab: signing in via one gate clears the banner on both gates", async () => {
    const onSignedIn = vi.fn();
    renderWithProviders(
      <>
        <AuthGate onSignedIn={onSignedIn}><p>Gate A</p></AuthGate>
        <AuthGate><p>Gate B</p></AuthGate>
      </>,
    );

    // Flag auth
    fireEvent.click(screen.getByRole("button", { name: "flag" }));
    await waitFor(() => {
      expect(screen.getAllByText("Not signed in to Claude.")).toHaveLength(2);
    });

    // Open the modal on gate A (first Sign in button)
    const signInButtons = screen.getAllByRole("button", { name: "Sign in" });
    fireEvent.click(signInButtons[0]);
    await waitFor(() => {
      expect(screen.getByTestId("auth-modal")).toBeDefined();
    });

    // Complete sign-in
    fireEvent.click(screen.getByRole("button", { name: "Signed In" }));

    // Both banners should be gone
    await waitFor(() => {
      expect(screen.queryByText("Not signed in to Claude.")).toBeNull();
    });
    expect(onSignedIn).toHaveBeenCalledOnce();
  });

  it("useAuthStatus throws when used outside AuthProvider", () => {
    // Silence expected console.error from React
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => {
      render(
        // biome-ignore lint/suspicious/noExplicitAny: test for error boundary
        <AuthHarness>{null}</AuthHarness>,
      );
    }).toThrow("useAuthStatus must be used inside <AuthProvider>");
    spy.mockRestore();
  });
});
