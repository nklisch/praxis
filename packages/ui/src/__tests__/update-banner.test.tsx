/**
 * Tests for UpdateBanner component.
 *
 * Verifies:
 * - Renders nothing for null / disabled / up-to-date / error / dismissed.
 * - Renders banner for "available" with download link + dismiss button.
 */
import type { PraxisClient } from "@praxis/core/types";
import type { UpdateCheckResult } from "@praxis/core/services";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UpdateBanner } from "../components/update-banner.js";
import { PraxisClientProvider } from "../context/client-context.js";
import { COPY } from "../lib/copy.js";
import { makeFakeClient } from "./helpers/fake-client.js";

const DISMISS_KEY = "praxis.update.dismissedVersion";

afterEach(() => {
  cleanup();
  try {
    window.localStorage.removeItem(DISMISS_KEY);
  } catch {
    /* noop */
  }
});

function buildClient(result: UpdateCheckResult): PraxisClient {
  return makeFakeClient({
    update: {
      checkLatest: vi.fn().mockResolvedValue(result),
    } as unknown as PraxisClient["update"],
  });
}

function renderBanner(result: UpdateCheckResult) {
  const client = buildClient(result);
  return render(
    <PraxisClientProvider client={client}>
      <UpdateBanner />
    </PraxisClientProvider>,
  );
}

describe("UpdateBanner", () => {
  beforeEach(() => {
    try {
      window.localStorage.removeItem(DISMISS_KEY);
    } catch {
      /* noop */
    }
  });

  it("renders nothing for disabled status", async () => {
    renderBanner({ status: "disabled" });
    // Wait for the effect to settle then assert no banner copy.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(screen.queryByText(/A newer Praxis is available/)).toBeNull();
  });

  it("renders nothing for up-to-date status", async () => {
    renderBanner({ status: "up-to-date", current: "1.0.0" });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(screen.queryByText(/A newer Praxis is available/)).toBeNull();
  });

  it("renders nothing for error status", async () => {
    renderBanner({ status: "error", message: "ipc-broken" });
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(screen.queryByText(/A newer Praxis is available/)).toBeNull();
  });

  it("renders banner with download link for available status", async () => {
    renderBanner({
      status: "available",
      current: "1.0.0",
      latest: { version: "1.0.1", downloadUrl: "https://example.com/Praxis-1.0.1.dmg" },
    });

    await waitFor(() =>
      expect(screen.getByText(COPY.update.available("1.0.1"))).toBeDefined(),
    );
    const link = screen.getByText(COPY.update.downloadLabel) as HTMLAnchorElement;
    expect(link.href).toBe("https://example.com/Praxis-1.0.1.dmg");
    expect(link.target).toBe("_blank");
  });

  it("hides banner after dismiss is clicked", async () => {
    renderBanner({
      status: "available",
      current: "1.0.0",
      latest: { version: "1.0.1", downloadUrl: "https://example.com/Praxis-1.0.1.dmg" },
    });

    await waitFor(() =>
      expect(screen.getByText(COPY.update.available("1.0.1"))).toBeDefined(),
    );

    const dismissBtn = screen.getByLabelText(COPY.update.dismissLabel);
    fireEvent.click(dismissBtn);

    await waitFor(() =>
      expect(screen.queryByText(COPY.update.available("1.0.1"))).toBeNull(),
    );
    expect(window.localStorage.getItem(DISMISS_KEY)).toBe("1.0.1");
  });

  it("does not render when current latest version was previously dismissed", async () => {
    window.localStorage.setItem(DISMISS_KEY, "1.0.1");
    renderBanner({
      status: "available",
      current: "1.0.0",
      latest: { version: "1.0.1", downloadUrl: "https://example.com/Praxis-1.0.1.dmg" },
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByText(COPY.update.available("1.0.1"))).toBeNull();
  });
});
