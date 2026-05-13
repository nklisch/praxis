/**
 * Tests for <SubAgentBlock>.
 *
 * Verifies:
 * - Shows initialLabel before subscription events arrive.
 * - Shows step count when steps arrive.
 * - Click expands to show step list (capped to 8 most recent).
 * - "live" indicator present while status is in_flight and item.status is running.
 * - "couldn't finish" text shown when errored and settled.
 * - No "live" indicator once status is settled.
 */
import type { PraxisClient, SubAgentEvent, SubAgentItem } from "@praxis/core/types";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeFakeClient } from "../../__tests__/helpers/fake-client.js";
import { PraxisClientProvider } from "../../context/client-context.js";
import { SubAgentBlock } from "../sub-agent-block.js";

afterEach(() => cleanup());

const CALL_ID = "call-42";
const SESSION_ID = "sess-1" as unknown as SubAgentItem["sessionId"];

function makeItem(overrides?: Partial<SubAgentItem>): SubAgentItem {
  return {
    parentCallId: CALL_ID,
    sessionId: SESSION_ID,
    label: "reading your materials",
    status: "running",
    startedAt: Date.now() as SubAgentItem["startedAt"],
    steps: [],
    ...overrides,
  };
}

async function* makeStream(events: SubAgentEvent[]): AsyncGenerator<SubAgentEvent, void, unknown> {
  for (const event of events) {
    yield event;
    await new Promise((r) => setTimeout(r, 0));
  }
}

function makeClient(events: SubAgentEvent[]): PraxisClient {
  return makeFakeClient({
    subAgent: {
      events: vi.fn(() => makeStream(events)),
      list: vi.fn().mockResolvedValue([]),
    } as PraxisClient["subAgent"],
  });
}

function Wrapper({ client, children }: { client: PraxisClient; children: React.ReactNode }) {
  return <PraxisClientProvider client={client}>{children}</PraxisClientProvider>;
}

describe("SubAgentBlock", () => {
  it("shows initialLabel before any subscription events", () => {
    const client = makeClient([]);
    const { container } = render(
      <Wrapper client={client}>
        <SubAgentBlock
          parentCallId={CALL_ID}
          initialLabel="reading your materials"
          status="in_flight"
        />
      </Wrapper>,
    );
    expect(container.textContent).toContain("reading your materials");
  });

  it("does not show step count when steps are 0", () => {
    const client = makeClient([]);
    const { container } = render(
      <Wrapper client={client}>
        <SubAgentBlock
          parentCallId={CALL_ID}
          initialLabel="reading your materials"
          status="in_flight"
        />
      </Wrapper>,
    );
    expect(container.textContent).not.toContain("step");
  });

  it("shows step count after steps arrive", async () => {
    const item = makeItem();
    const steps = [
      {
        callId: "s1",
        toolName: "document.outline",
        label: "Reading outline",
        startedAt: Date.now() as SubAgentItem["startedAt"],
      },
      {
        callId: "s2",
        toolName: "document.read_pages",
        label: "Reading pages",
        startedAt: Date.now() as SubAgentItem["startedAt"],
      },
      {
        callId: "s3",
        toolName: "document.list_sections",
        label: "Scanning sections",
        startedAt: Date.now() as SubAgentItem["startedAt"],
      },
    ];
    const events: SubAgentEvent[] = [{ kind: "snapshot", items: [{ ...item, steps }] }];
    const client = makeClient(events);
    const { container } = render(
      <Wrapper client={client}>
        <SubAgentBlock
          parentCallId={CALL_ID}
          initialLabel="reading your materials"
          status="in_flight"
        />
      </Wrapper>,
    );
    await waitFor(() => expect(container.textContent).toContain("3 steps"));
  });

  it("click expands to show step list", async () => {
    const item = makeItem();
    const steps = [
      {
        callId: "s1",
        toolName: "document.outline",
        label: "Reading the table of contents",
        startedAt: Date.now() as SubAgentItem["startedAt"],
      },
    ];
    const events: SubAgentEvent[] = [{ kind: "snapshot", items: [{ ...item, steps }] }];
    const client = makeClient(events);
    const { getByRole, queryByText } = render(
      <Wrapper client={client}>
        <SubAgentBlock
          parentCallId={CALL_ID}
          initialLabel="reading your materials"
          status="in_flight"
        />
      </Wrapper>,
    );
    // Initially collapsed — step label not visible.
    expect(queryByText("Reading the table of contents")).toBeNull();

    // Expand.
    await waitFor(() => expect(getByRole("button").getAttribute("aria-expanded")).toBe("false"));
    fireEvent.click(getByRole("button"));
    await waitFor(() => expect(queryByText("Reading the table of contents")).not.toBeNull());
  });

  it("caps displayed steps to 8 most recent when expanded", async () => {
    const item = makeItem();
    const steps = Array.from({ length: 10 }, (_, i) => ({
      callId: `s${i}`,
      toolName: "document.read_pages",
      label: `Step ${i + 1}`,
      startedAt: Date.now() as SubAgentItem["startedAt"],
    }));
    const client = makeClient([{ kind: "snapshot", items: [{ ...item, steps }] }]);
    const { getByRole, getAllByRole } = render(
      <Wrapper client={client}>
        <SubAgentBlock
          parentCallId={CALL_ID}
          initialLabel="reading your materials"
          status="in_flight"
        />
      </Wrapper>,
    );
    await waitFor(() => expect(getByRole("button").textContent).toContain("10 steps"));
    fireEvent.click(getByRole("button"));
    // Only 8 list items rendered (most recent 8 of 10).
    const listItems = getAllByRole("listitem");
    expect(listItems).toHaveLength(8);
  });

  it("shows live indicator when in_flight and item status running", async () => {
    const item = makeItem({ status: "running" });
    const client = makeClient([{ kind: "snapshot", items: [item] }]);
    const { container } = render(
      <Wrapper client={client}>
        <SubAgentBlock
          parentCallId={CALL_ID}
          initialLabel="reading your materials"
          status="in_flight"
        />
      </Wrapper>,
    );
    await waitFor(() => expect(container.textContent).toContain("live"));
  });

  it("no live indicator when status is settled", async () => {
    const item = makeItem({ status: "done" });
    const client = makeClient([{ kind: "snapshot", items: [item] }]);
    const { container } = render(
      <Wrapper client={client}>
        <SubAgentBlock
          parentCallId={CALL_ID}
          initialLabel="reading your materials"
          status="settled"
        />
      </Wrapper>,
    );
    await waitFor(() => expect(container.textContent).not.toContain("live"));
  });

  it("shows 'couldn't finish' when settled and errored", async () => {
    const item = makeItem({ status: "failed" });
    const client = makeClient([{ kind: "snapshot", items: [item] }]);
    const { container } = render(
      <Wrapper client={client}>
        <SubAgentBlock
          parentCallId={CALL_ID}
          initialLabel="reading your materials"
          status="settled"
          errored={true}
        />
      </Wrapper>,
    );
    await waitFor(() => expect(container.textContent).toContain("couldn't finish"));
  });

  it("aria-expanded toggles on click", async () => {
    const item = makeItem();
    const steps = [
      {
        callId: "s1",
        toolName: "document.outline",
        label: "Reading outline",
        startedAt: Date.now() as SubAgentItem["startedAt"],
      },
    ];
    const client = makeClient([{ kind: "snapshot", items: [{ ...item, steps }] }]);
    const { getByRole } = render(
      <Wrapper client={client}>
        <SubAgentBlock
          parentCallId={CALL_ID}
          initialLabel="reading your materials"
          status="in_flight"
        />
      </Wrapper>,
    );
    const button = getByRole("button");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });
});
