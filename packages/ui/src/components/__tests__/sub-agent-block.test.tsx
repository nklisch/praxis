/**
 * Tests for <SubAgentBlock> — inline marginalia restyle.
 *
 * Verifies:
 * - Renders mono kicker with initialLabel before subscription events arrive.
 * - Kicker includes "sub-agent" prefix.
 * - No step count when there are no steps.
 * - Step count appears in kicker when steps are present.
 * - Collapsed by default — no toggle shown until steps arrive.
 * - Expand toggle appears once steps arrive; click reveals step list.
 * - Step list capped at 8 most recent when expanded.
 * - Step icons: ✓ for done/ok, ✗ for done/failed, ◐ for running.
 * - Pulse dot present when in_flight and agent status running.
 * - No pulse dot once status is settled.
 * - "couldn't finish" text shown when settled and errored.
 * - aria-expanded toggles on expand/collapse.
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

describe("SubAgentBlock — marginalia render", () => {
  it("renders kicker with 'sub-agent' prefix", () => {
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
    expect(container.textContent).toContain("sub-agent");
  });

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

  it("shows step count in kicker after steps arrive", async () => {
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

  it("updates kicker label from phase_changed event", async () => {
    const item = makeItem();
    const events: SubAgentEvent[] = [
      { kind: "snapshot", items: [item] },
      { kind: "phase_changed", parentCallId: CALL_ID, label: "drafting unit 2" },
    ];
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
    await waitFor(() => expect(container.textContent).toContain("drafting unit 2"));
  });
});

describe("SubAgentBlock — collapsed-by-default + expand toggle", () => {
  it("no expand toggle when there are no steps", () => {
    const client = makeClient([]);
    const { queryByRole } = render(
      <Wrapper client={client}>
        <SubAgentBlock
          parentCallId={CALL_ID}
          initialLabel="reading your materials"
          status="in_flight"
        />
      </Wrapper>,
    );
    expect(queryByRole("button")).toBeNull();
  });

  it("expand toggle appears once steps arrive", async () => {
    const item = makeItem();
    const steps = [
      {
        callId: "s1",
        toolName: "document.outline",
        label: "Reading outline",
        startedAt: Date.now() as SubAgentItem["startedAt"],
      },
    ];
    const events: SubAgentEvent[] = [{ kind: "snapshot", items: [{ ...item, steps }] }];
    const client = makeClient(events);
    const { queryByRole } = render(
      <Wrapper client={client}>
        <SubAgentBlock
          parentCallId={CALL_ID}
          initialLabel="reading your materials"
          status="in_flight"
        />
      </Wrapper>,
    );
    await waitFor(() => expect(queryByRole("button")).not.toBeNull());
  });

  it("step list not visible when collapsed", async () => {
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
    const { queryByText } = render(
      <Wrapper client={client}>
        <SubAgentBlock
          parentCallId={CALL_ID}
          initialLabel="reading your materials"
          status="in_flight"
        />
      </Wrapper>,
    );
    await waitFor(() => expect(queryByText(/show steps/i)).not.toBeNull());
    // Step label not visible in collapsed state.
    expect(queryByText("Reading the table of contents")).toBeNull();
  });

  it("click expand toggle reveals step list", async () => {
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
    await waitFor(() => expect(getByRole("button")).not.toBeNull());
    fireEvent.click(getByRole("button"));
    // Only 8 list items rendered (most recent 8 of 10).
    const listItems = getAllByRole("listitem");
    expect(listItems).toHaveLength(8);
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
    await waitFor(() => expect(getByRole("button")).not.toBeNull());
    const button = getByRole("button");
    expect(button.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(button);
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });
});

describe("SubAgentBlock — step event rendering", () => {
  it("shows ✓ icon for done/ok step", async () => {
    const item = makeItem();
    const steps = [
      {
        callId: "s1",
        toolName: "document.outline",
        label: "Reading outline",
        startedAt: Date.now() as SubAgentItem["startedAt"],
        ok: true,
        endedAt: Date.now() as SubAgentItem["startedAt"],
      },
    ];
    const client = makeClient([{ kind: "snapshot", items: [{ ...item, steps }] }]);
    const { getByRole, container } = render(
      <Wrapper client={client}>
        <SubAgentBlock
          parentCallId={CALL_ID}
          initialLabel="reading your materials"
          status="in_flight"
        />
      </Wrapper>,
    );
    await waitFor(() => expect(getByRole("button")).not.toBeNull());
    fireEvent.click(getByRole("button"));
    await waitFor(() => expect(container.textContent).toContain("✓"));
  });

  it("shows ✗ icon for done/failed step", async () => {
    const item = makeItem();
    const steps = [
      {
        callId: "s1",
        toolName: "document.outline",
        label: "Reading outline",
        startedAt: Date.now() as SubAgentItem["startedAt"],
        ok: false,
        endedAt: Date.now() as SubAgentItem["startedAt"],
      },
    ];
    const client = makeClient([{ kind: "snapshot", items: [{ ...item, steps }] }]);
    const { getByRole, container } = render(
      <Wrapper client={client}>
        <SubAgentBlock
          parentCallId={CALL_ID}
          initialLabel="reading your materials"
          status="in_flight"
        />
      </Wrapper>,
    );
    await waitFor(() => expect(getByRole("button")).not.toBeNull());
    fireEvent.click(getByRole("button"));
    await waitFor(() => expect(container.textContent).toContain("✗"));
  });

  it("shows ◐ icon for running step (no ok yet)", async () => {
    const item = makeItem();
    const steps = [
      {
        callId: "s1",
        toolName: "document.outline",
        label: "Reading outline",
        startedAt: Date.now() as SubAgentItem["startedAt"],
        // ok is undefined — step is still running
      },
    ];
    const client = makeClient([{ kind: "snapshot", items: [{ ...item, steps }] }]);
    const { getByRole, container } = render(
      <Wrapper client={client}>
        <SubAgentBlock
          parentCallId={CALL_ID}
          initialLabel="reading your materials"
          status="in_flight"
        />
      </Wrapper>,
    );
    await waitFor(() => expect(getByRole("button")).not.toBeNull());
    fireEvent.click(getByRole("button"));
    await waitFor(() => expect(container.textContent).toContain("◐"));
  });
});

describe("SubAgentBlock — live indicator + error states", () => {
  it("pulse element present when in_flight and agent status running", async () => {
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
    // Pulse dot is aria-hidden; check by selector — wait for snapshot to arrive
    await waitFor(() => {
      // When item arrives from subscription, the pulse is driven by isLive check.
      // The item is running and status is in_flight, so pulse should be present.
      const pulse = container.querySelector("[aria-hidden='true'][class*='pulse']");
      expect(pulse).not.toBeNull();
    });
  });

  it("no pulse when status is settled", async () => {
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
    await waitFor(() => {
      const pulse = container.querySelector("[class*='pulse']");
      expect(pulse).toBeNull();
    });
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
});
