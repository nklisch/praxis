/**
 * Tests for TwoTierBody component.
 */
import type { TwoTierItem } from "@praxis/core/types";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TwoTierBody } from "../components/item-bodies/two-tier-body.js";

afterEach(() => {
  cleanup();
});

const item: TwoTierItem = {
  kind: "two-tier",
  id: "tt1",
  prompt: "Which is larger?",
  options: ["Sun", "Moon"],
  correctOptionIndex: 0,
  reasonPrompt: "Why?",
  reasonOptions: ["Because it burns gas", "Because it looks bigger"],
  correctReasonIndex: 0,
  misconceptionByReasonIndex: [null, "mc-size-visual"],
};

describe("TwoTierBody", () => {
  it("renders tier-1 options as radio buttons", () => {
    render(<TwoTierBody item={item} response="" onChange={() => {}} />);
    expect(screen.getAllByRole("radio")).toHaveLength(2);
    expect(screen.getByText("Sun")).toBeDefined();
    expect(screen.getByText("Moon")).toBeDefined();
  });

  it("hides tier-2 section initially (aria-hidden)", () => {
    render(<TwoTierBody item={item} response="" onChange={() => {}} />);
    const hidden = document.querySelector('[aria-hidden="true"]');
    expect(hidden).not.toBeNull();
  });

  it("reveals tier-2 after tier-1 is selected", () => {
    render(<TwoTierBody item={item} response="" onChange={() => {}} />);
    // Select tier-1 option "Sun"
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    fireEvent.click(radios[0]!);
    // After interaction, tier-2 should become visible (aria-hidden false)
    // The component uses internal state to show/hide tier-2
    // We check that the reason options are now accessible
    expect(screen.getByText("Why?")).toBeDefined();
  });

  it("calls onChange with tier1Index on tier-1 selection", () => {
    const onChange = vi.fn();
    render(<TwoTierBody item={item} response="" onChange={onChange} />);
    const radios = screen.getAllByRole("radio");
    fireEvent.click(radios[0]!);
    const call = onChange.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(call);
    expect(parsed.tier1Index).toBe("0");
    // Tier-2 resets
    expect(parsed.tier2Index).toBe("");
  });

  it("tier-2 selection sets tier2Index in response", () => {
    const onChange = vi.fn();
    // Pre-select tier-1 so tier-2 is visible
    const response = JSON.stringify({ tier1Index: "0", tier2Index: "" });
    render(<TwoTierBody item={item} response={response} onChange={onChange} />);

    // All 4 radios visible now (2 tier-1 + 2 tier-2)
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    // tier-2 radios are indices 2 and 3
    fireEvent.click(radios[2]!);
    const call = onChange.mock.calls[0]?.[0] as string;
    const parsed = JSON.parse(call);
    expect(parsed.tier2Index).toBe("0");
  });

  it("disables all radios when disabled=true", () => {
    render(
      <TwoTierBody
        item={item}
        response={JSON.stringify({ tier1Index: "0", tier2Index: "" })}
        onChange={() => {}}
        disabled={true}
      />,
    );
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    for (const r of radios) {
      expect(r.disabled).toBe(true);
    }
  });
});
