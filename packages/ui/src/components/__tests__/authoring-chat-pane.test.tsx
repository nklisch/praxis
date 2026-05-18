/**
 * Tests for <AuthoringChatPane> and its thin wrapper <ConfigureChatPane>.
 *
 * Verifies:
 * - Renders the mode-specific header label for "configure".
 * - Renders the mode-specific header label for "course-create".
 * - Shows "Starting session…" status when sessionId is null.
 * - Shows "Ready" status when sessionId is present and not streaming.
 * - Shows the mode-specific empty-state hint when no messages are present.
 * - Composer is disabled when sessionId is null.
 * - <ConfigureChatPane> wrapper renders as "configure" mode.
 */
import type { PraxisClient, SessionId } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeFakeClient } from "../../__tests__/helpers/fake-client.js";
import { PraxisClientProvider } from "../../context/client-context.js";
import { AuthoringChatPane } from "../authoring-chat-pane.js";
import { ConfigureChatPane } from "../configure-chat-pane.js";

afterEach(() => cleanup());

const SESSION_ID = brandId<"SessionId">("sess-authoring-1") as SessionId;

function makeClient(): PraxisClient {
  return makeFakeClient({
    memory: {
      episodic: vi.fn(async function* () {}),
    } as unknown as PraxisClient["memory"],
  });
}

function Wrapper({ client, children }: { client: PraxisClient; children: React.ReactNode }) {
  return <PraxisClientProvider client={client}>{children}</PraxisClientProvider>;
}

describe("AuthoringChatPane", () => {
  it("renders 'Configure assistant' header for configure mode", () => {
    const client = makeClient();
    const { container } = render(
      <Wrapper client={client}>
        <AuthoringChatPane mode="configure" sessionId={SESSION_ID} />
      </Wrapper>,
    );
    expect(container.textContent).toContain("Configure assistant");
  });

  it("renders 'Course-design assistant' header for bootstrap mode", () => {
    const client = makeClient();
    const { container } = render(
      <Wrapper client={client}>
        <AuthoringChatPane mode="course-create" sessionId={SESSION_ID} />
      </Wrapper>,
    );
    expect(container.textContent).toContain("Course-design assistant");
  });

  it("shows 'Starting session…' when sessionId is null", () => {
    const client = makeClient();
    const { container } = render(
      <Wrapper client={client}>
        <AuthoringChatPane mode="configure" sessionId={null} />
      </Wrapper>,
    );
    expect(container.textContent).toContain("Starting session…");
  });

  it("shows 'Ready' when sessionId is present and not streaming", () => {
    const client = makeClient();
    const { container } = render(
      <Wrapper client={client}>
        <AuthoringChatPane mode="configure" sessionId={SESSION_ID} />
      </Wrapper>,
    );
    expect(container.textContent).toContain("Ready");
  });

  it("shows configure empty-state hint for configure mode", () => {
    const client = makeClient();
    const { container } = render(
      <Wrapper client={client}>
        <AuthoringChatPane mode="configure" sessionId={SESSION_ID} />
      </Wrapper>,
    );
    expect(container.textContent).toContain(
      "Ask me to edit courses, lessons, gates, or customize prompts.",
    );
  });

  it("shows bootstrap empty-state hint for bootstrap mode", () => {
    const client = makeClient();
    const { container } = render(
      <Wrapper client={client}>
        <AuthoringChatPane mode="course-create" sessionId={SESSION_ID} />
      </Wrapper>,
    );
    expect(container.textContent).toContain("Steer the draft");
  });

  it("disables the composer when sessionId is null", () => {
    const client = makeClient();
    const { container } = render(
      <Wrapper client={client}>
        <AuthoringChatPane mode="configure" sessionId={null} />
      </Wrapper>,
    );
    const textarea = container.querySelector("textarea");
    expect(textarea).not.toBeNull();
    expect(textarea?.disabled).toBe(true);
  });

  it("enables the composer when sessionId is present and not streaming", () => {
    const client = makeClient();
    const { container } = render(
      <Wrapper client={client}>
        <AuthoringChatPane mode="configure" sessionId={SESSION_ID} />
      </Wrapper>,
    );
    const textarea = container.querySelector("textarea");
    expect(textarea).not.toBeNull();
    expect(textarea?.disabled).toBe(false);
  });
});

describe("ConfigureChatPane", () => {
  it("renders as configure mode (shows 'Configure assistant')", () => {
    const client = makeClient();
    const { container } = render(
      <Wrapper client={client}>
        <ConfigureChatPane sessionId={SESSION_ID} />
      </Wrapper>,
    );
    expect(container.textContent).toContain("Configure assistant");
  });

  it("forwards disabled prop to authoring pane", () => {
    const client = makeClient();
    const { container } = render(
      <Wrapper client={client}>
        <ConfigureChatPane sessionId={SESSION_ID} disabled={true} />
      </Wrapper>,
    );
    const textarea = container.querySelector("textarea");
    expect(textarea?.disabled).toBe(true);
  });

  it("renders 'Starting session…' when sessionId is null", () => {
    const client = makeClient();
    const { container } = render(
      <Wrapper client={client}>
        <ConfigureChatPane sessionId={null} />
      </Wrapper>,
    );
    expect(container.textContent).toContain("Starting session…");
  });
});
