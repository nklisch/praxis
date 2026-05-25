/**
 * Tests for <ComposerStatus> — pure presentational status row.
 *
 * Covers:
 * - Each variant renders the correct text
 * - Priority ladder: failed > streaming > queued > idle (null)
 * - Idle case returns null (no DOM node)
 * - Streaming variant includes the pip element
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { COPY } from "../lib/copy.js";
import { ComposerStatus } from "../components/composer-status.js";

afterEach(() => cleanup());

describe("ComposerStatus", () => {
  // ── idle ──────────────────────────────────────────────────────────────────

  it("returns null in idle (all-zero) state", () => {
    const { container } = render(
      <ComposerStatus isStreaming={false} pendingCount={0} failedCount={0} />,
    );
    expect(container.firstChild).toBeNull();
  });

  // ── queued variant ────────────────────────────────────────────────────────

  it("renders queued count when pendingCount > 0 and not streaming and no failures", () => {
    render(
      <ComposerStatus isStreaming={false} pendingCount={3} failedCount={0} />,
    );
    expect(screen.getByText(COPY.composer.status.queued(3))).toBeDefined();
  });

  it("renders queued count of 1 correctly", () => {
    render(
      <ComposerStatus isStreaming={false} pendingCount={1} failedCount={0} />,
    );
    expect(screen.getByText(COPY.composer.status.queued(1))).toBeDefined();
  });

  // ── streaming variant ─────────────────────────────────────────────────────

  it("renders streaming when isStreaming=true and no failures", () => {
    render(
      <ComposerStatus isStreaming={true} pendingCount={0} failedCount={0} />,
    );
    expect(screen.getByText(COPY.composer.status.streaming)).toBeDefined();
  });

  it("renders streaming when isStreaming=true even with pending turns", () => {
    render(
      <ComposerStatus isStreaming={true} pendingCount={5} failedCount={0} />,
    );
    expect(screen.getByText(COPY.composer.status.streaming)).toBeDefined();
    expect(screen.queryByText(COPY.composer.status.queued(5))).toBeNull();
  });

  it("streaming variant includes an aria-hidden pip element", () => {
    const { container } = render(
      <ComposerStatus isStreaming={true} pendingCount={0} failedCount={0} />,
    );
    const pip = container.querySelector("[aria-hidden='true']");
    expect(pip).not.toBeNull();
  });

  // ── failed variant ────────────────────────────────────────────────────────

  it("renders failed variant when failedCount > 0", () => {
    render(
      <ComposerStatus isStreaming={false} pendingCount={0} failedCount={2} />,
    );
    expect(screen.getByText(COPY.composer.status.failed(2))).toBeDefined();
  });

  it("failed takes priority over streaming", () => {
    render(
      <ComposerStatus isStreaming={true} pendingCount={3} failedCount={1} />,
    );
    expect(screen.getByText(COPY.composer.status.failed(1))).toBeDefined();
    expect(screen.queryByText(COPY.composer.status.streaming)).toBeNull();
    expect(screen.queryByText(COPY.composer.status.queued(3))).toBeNull();
  });

  it("failed takes priority over queued", () => {
    render(
      <ComposerStatus isStreaming={false} pendingCount={4} failedCount={2} />,
    );
    expect(screen.getByText(COPY.composer.status.failed(2))).toBeDefined();
    expect(screen.queryByText(COPY.composer.status.queued(4))).toBeNull();
  });

  it("failed count of 1 renders correctly", () => {
    render(
      <ComposerStatus isStreaming={false} pendingCount={0} failedCount={1} />,
    );
    expect(screen.getByText(COPY.composer.status.failed(1))).toBeDefined();
  });
});
