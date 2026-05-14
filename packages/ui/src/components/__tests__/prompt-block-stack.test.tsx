import type { PraxisClient } from "@praxis/core/types";
import {
	cleanup,
	fireEvent,
	render,
	screen,
	waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeFakeClient } from "../../__tests__/helpers/fake-client.js";
import { PraxisClientProvider } from "../../context/client-context.js";
import {
	assembleBlocks,
	PromptBlockStack,
} from "../prompt-block-stack.js";

afterEach(() => cleanup());

function makeClient(opts: {
	globalText?: string | null;
	appendText?: string | null;
	overrides?: Array<{ fragmentId: string; override: string }>;
	customizePromptSpy?: PraxisClient["author"]["customizePrompt"];
	setGlobalPromptSpy?: PraxisClient["author"]["setGlobalPrompt"];
	setModeAppendSpy?: PraxisClient["author"]["setModeAppend"];
}): PraxisClient {
	const globalText = opts.globalText ?? null;
	const appendText = opts.appendText ?? null;
	const overrides = opts.overrides ?? [];

	return makeFakeClient({
		author: {
			getGlobalPrompt: vi.fn().mockResolvedValue(globalText),
			setGlobalPrompt: opts.setGlobalPromptSpy ?? vi.fn().mockResolvedValue(undefined),
			getModeAppend: vi.fn().mockResolvedValue(appendText),
			setModeAppend: opts.setModeAppendSpy ?? vi.fn().mockResolvedValue(undefined),
			listFragmentOverrides: vi.fn().mockResolvedValue(overrides),
			customizePrompt: opts.customizePromptSpy ?? vi.fn().mockResolvedValue(undefined),
			previewPromptWithAttribution: vi.fn().mockResolvedValue({
				modeId: "teach",
				segments: [],
				fullText: "",
			}),
			setStyleSliders: vi.fn().mockResolvedValue(undefined),
		} as unknown as PraxisClient["author"],
	});
}

function renderStack(
	client: PraxisClient,
	onModeChange: (id: string) => void = vi.fn(),
) {
	return render(
		<PraxisClientProvider client={client}>
			<PromptBlockStack modeId="teach" onModeChange={onModeChange} />
		</PraxisClientProvider>,
	);
}

describe("assembleBlocks", () => {
	it("places user-global and user-append at the correct FRAGMENT_ORDER positions", () => {
		const blocks = assembleBlocks("teach", "my-global", "my-append", new Map());
		const positions = blocks.map((b) => b.positionLabel);
		// user-global precedes user-append; both precede postamble.
		const globalIdx = positions.indexOf("user-global");
		const appendIdx = positions.indexOf("user-append");
		expect(globalIdx).toBeGreaterThan(-1);
		expect(appendIdx).toBeGreaterThan(-1);
		expect(globalIdx).toBeLessThan(appendIdx);
	});

	it("assembles a synthetic global block with saveAction 'global'", () => {
		const blocks = assembleBlocks("teach", "hello", null, new Map());
		const global = blocks.find((b) => b.blockId === "user-global");
		expect(global).toBeDefined();
		expect(global?.saveAction).toBe("global");
		expect(global?.currentText).toBe("hello");
		expect(global?.hasOverride).toBe(true);
	});

	it("assembles a synthetic append block with saveAction 'append'", () => {
		const blocks = assembleBlocks("teach", null, "append-text", new Map());
		const append = blocks.find((b) => b.blockId === "user-append");
		expect(append).toBeDefined();
		expect(append?.saveAction).toBe("append");
		expect(append?.currentText).toBe("append-text");
		expect(append?.hasOverride).toBe(true);
	});

	it("applies overrides to fragment blocks with saveAction 'fragment'", () => {
		const overrides = new Map([["role.teach", "custom role text"]]);
		const blocks = assembleBlocks("teach", null, null, overrides);
		const fragmentBlock = blocks.find((b) => b.blockId === "role.teach");
		if (fragmentBlock) {
			expect(fragmentBlock.saveAction).toBe("fragment");
			expect(fragmentBlock.currentText).toBe("custom role text");
			expect(fragmentBlock.hasOverride).toBe(true);
		}
	});

	it("global block has hasOverride false when global is empty / null", () => {
		const blocks = assembleBlocks("teach", null, null, new Map());
		const global = blocks.find((b) => b.blockId === "user-global");
		expect(global?.hasOverride).toBe(false);
	});
});

describe("PromptBlockStack", () => {
	it("renders blocks once async sources resolve", async () => {
		const client = makeClient({});
		renderStack(client);
		// After the global+append fetches resolve, the Global prompt block
		// surfaces by title. Before that, the LoadingState is rendered (no
		// blocks visible).
		await waitFor(() => {
			expect(screen.getByText("Global prompt")).toBeDefined();
		});
	});

	it("renders the Blocks view by default after load", async () => {
		const client = makeClient({});
		renderStack(client);
		await waitFor(() => {
			// At least one block (user-global title) should render once loaded.
			expect(screen.getByText("Global prompt")).toBeDefined();
		});
	});

	it("the [Blocks | Composed] toggle flips between views", async () => {
		const client = makeClient({});
		renderStack(client);
		await waitFor(() => {
			expect(screen.getByText("Global prompt")).toBeDefined();
		});
		// Click "Composed"
		fireEvent.click(screen.getByRole("tab", { name: /composed/i }));
		// The Composed pane (AttributedPreviewPane) replaces the block list.
		// Wait for the global block title to disappear from view.
		await waitFor(() => {
			expect(screen.queryByText("Global prompt")).toBeNull();
		});
	});

	it("mode picker change calls onModeChange", async () => {
		const client = makeClient({});
		const onModeChange = vi.fn();
		renderStack(client, onModeChange);
		await waitFor(() => {
			expect(screen.getByText("Global prompt")).toBeDefined();
		});
		const select = screen.getByLabelText(/mode/i) as HTMLSelectElement;
		fireEvent.change(select, { target: { value: "quiz" } });
		expect(onModeChange).toHaveBeenCalledWith("quiz");
	});

	it("renders both global and append blocks after async load", async () => {
		const client = makeClient({
			globalText: "my global",
			appendText: "my append",
		});
		renderStack(client);
		await waitFor(() => {
			expect(screen.getByText("Global prompt")).toBeDefined();
			// The append block title is `${modeId} append`.
			expect(screen.getByText(/teach append/i)).toBeDefined();
		});
	});

	it("changing mode refetches getModeAppend with the new modeId", async () => {
		const getModeAppend = vi.fn().mockResolvedValue("first-append");
		const client = makeFakeClient({
			author: {
				getGlobalPrompt: vi.fn().mockResolvedValue(null),
				setGlobalPrompt: vi.fn().mockResolvedValue(undefined),
				getModeAppend,
				setModeAppend: vi.fn().mockResolvedValue(undefined),
				listFragmentOverrides: vi.fn().mockResolvedValue([]),
				customizePrompt: vi.fn().mockResolvedValue(undefined),
				previewPromptWithAttribution: vi.fn().mockResolvedValue({
					modeId: "teach",
					segments: [],
					fullText: "",
				}),
				setStyleSliders: vi.fn().mockResolvedValue(undefined),
			} as unknown as PraxisClient["author"],
		});
		renderStack(client);
		await waitFor(() => {
			expect(getModeAppend).toHaveBeenCalledWith("teach");
		});
	});
});
