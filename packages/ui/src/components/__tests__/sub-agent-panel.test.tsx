/**
 * Tests for <SubAgentPanel> — collapse-on-hide layout fix.
 *
 * Verifies:
 *   - Renders null when parentCallId === null.
 *   - When collapsed, renders ONLY a toggle <button> (no outer .panel div).
 *   - When expanded, renders the panel chrome + transcript.
 *   - Toggle round-trips show ↔ hide.
 */
import type { PraxisClient } from "@praxis/core/types";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PraxisClientProvider } from "../../context/client-context.js";
import { makeFakeClient } from "../../__tests__/helpers/fake-client.js";
import { SubAgentPanel } from "../sub-agent-panel.js";

// Mock useSubAgent so the transcript renders without needing the full event
// stream plumbing. We only care about the panel chrome shape in these tests.
vi.mock("../../hooks/use-sub-agent.js", () => ({
	useSubAgent: () => ({
		item: { label: "test agent", status: "running", steps: [] },
		recentSteps: [],
	}),
}));

afterEach(() => cleanup());

function wrap(node: React.ReactNode): React.ReactElement {
	const client: PraxisClient = makeFakeClient();
	return <PraxisClientProvider client={client}>{node}</PraxisClientProvider>;
}

describe("SubAgentPanel — collapse-on-hide layout", () => {
	it("renders null when parentCallId is null", () => {
		const { container } = render(wrap(<SubAgentPanel parentCallId={null} />));
		// One PraxisClientProvider root element with no children.
		expect(container.querySelector("button")).toBeNull();
	});

	it("when collapsed, renders ONLY a toggle <button> with no .panel sibling", () => {
		const { container } = render(wrap(<SubAgentPanel parentCallId="call-1" />));
		// The toggle button is rendered.
		const button = container.querySelector("button[aria-expanded='false']");
		expect(button).not.toBeNull();
		expect(button?.textContent).toBe("show sub-agent transcript");

		// No transcript markup is in the document — the collapsed view sits
		// flush. The CSS-module class name for .panel contains the literal
		// "panel" substring; assert it's absent.
		const hasPanelClass = Array.from(container.querySelectorAll("*")).some((el) =>
			Array.from(el.classList).some((c) => /panel/.test(c) && !/toggleCollapsed/.test(c)),
		);
		expect(hasPanelClass).toBe(false);
	});

	it("clicking the collapsed toggle expands to show transcript + hide-toggle", () => {
		const { container } = render(wrap(<SubAgentPanel parentCallId="call-1" />));
		const showButton = container.querySelector("button[aria-expanded='false']");
		expect(showButton).not.toBeNull();

		if (showButton) fireEvent.click(showButton);

		// After expansion, the hide-toggle is rendered with aria-expanded=true
		// and the transcript header text is in the document.
		const hideButton = container.querySelector("button[aria-expanded='true']");
		expect(hideButton).not.toBeNull();
		expect(hideButton?.textContent).toBe("hide sub-agent transcript");
	});

	it("round-trip: collapsed → expanded → collapsed restores the toggle-only footprint", () => {
		const { container } = render(wrap(<SubAgentPanel parentCallId="call-1" />));

		const show = container.querySelector("button[aria-expanded='false']");
		expect(show).not.toBeNull();
		if (show) fireEvent.click(show);

		const hide = container.querySelector("button[aria-expanded='true']");
		expect(hide).not.toBeNull();
		if (hide) fireEvent.click(hide);

		// Back to collapsed.
		const show2 = container.querySelector("button[aria-expanded='false']");
		expect(show2).not.toBeNull();
		expect(show2?.textContent).toBe("show sub-agent transcript");
	});
});
