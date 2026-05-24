import type { PraxisClient } from "@praxis/core/types";
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usePraxisClient } from "../../../context/client-context.js";
import { useDirtyState } from "../../../hooks/use-dirty-state.js";
import { useResource } from "../../../hooks/use-resource.js";
import { MemoryTab } from "../memory-tab.js";

vi.mock("../../../context/client-context.js");
vi.mock("../../../hooks/use-dirty-state.js");

describe("MemoryTab Infinite Loop", () => {
  it("repro: calls episodic stream only once even if empty", async () => {
    const episodicSpy = vi.fn(async function* () {
      // Yield nothing (empty log)
    });

    const client = {
      memory: {
        studentModel: vi.fn(async () => ({ conceptMastery: new Map() })),
        misconceptions: vi.fn(async () => []),
        procedural: vi.fn(async () => null),
        affective: vi.fn(async () => null),
        episodic: episodicSpy,
      },
    } as unknown as PraxisClient;

    vi.mocked(usePraxisClient).mockReturnValue(client);

    render(<MemoryTab />);

    // Switch to Episodic tab
    const episodicBtn = screen.getByRole("button", { name: /Episodic/i });
    await act(async () => {
      episodicBtn.click();
    });

    // Wait a bit to see if it loops
    await new Promise((r) => setTimeout(r, 500));

    console.log("Call count:", episodicSpy.mock.calls.length);
    expect(episodicSpy.mock.calls.length).toBe(1);
  });
});
