import type { ConfiguratorActionRow, PraxisClient } from "@praxis/core/types";
import { render, renderHook, waitFor } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { PraxisClientProvider } from "../../context/client-context.js";
import { makeFakeClient } from "../../__tests__/helpers/fake-client.js";
import { useConfiguratorActions } from "../use-configurator-actions.js";

function wrapper(client: PraxisClient): (props: { children: React.ReactNode }) => React.ReactElement {
	return ({ children }) => (
		<PraxisClientProvider client={client}>{children}</PraxisClientProvider>
	);
}

describe("useConfiguratorActions", () => {
	it("single fetch on mount; identical opts literal across renders does NOT re-fetch (loop-flickers-audit fix)", async () => {
		const spy = vi.fn().mockResolvedValue([] as ConfiguratorActionRow[]);
		const client = makeFakeClient({
			author: {
				listConfiguratorActions: spy,
			} as unknown as PraxisClient["author"],
		});

		const { rerender, result } = renderHook(() => useConfiguratorActions({ limit: 100 }), {
			wrapper: wrapper(client),
		});

		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(spy).toHaveBeenCalledTimes(1);
		expect(spy).toHaveBeenCalledWith({ limit: 100 });

		// Re-render with a fresh literal that is structurally identical. Prior to
		// the fix, this triggered another fetch each render.
		rerender();
		rerender();
		rerender();

		// Allow any pending fetches to settle (should be none).
		await new Promise((resolve) => setTimeout(resolve, 30));
		expect(spy).toHaveBeenCalledTimes(1);
	});

	it("re-fetches when limit changes", async () => {
		const spy = vi.fn().mockResolvedValue([] as ConfiguratorActionRow[]);
		const client = makeFakeClient({
			author: {
				listConfiguratorActions: spy,
			} as unknown as PraxisClient["author"],
		});

		const { result, rerender } = renderHook(({ limit }) => useConfiguratorActions({ limit }), {
			initialProps: { limit: 100 },
			wrapper: wrapper(client),
		});

		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(spy).toHaveBeenCalledTimes(1);

		rerender({ limit: 50 });
		await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
		expect(spy).toHaveBeenLastCalledWith({ limit: 50 });
	});

	it("no-arg call invokes the IPC with an empty payload", async () => {
		const spy = vi.fn().mockResolvedValue([] as ConfiguratorActionRow[]);
		const client = makeFakeClient({
			author: {
				listConfiguratorActions: spy,
			} as unknown as PraxisClient["author"],
		});

		const { result } = renderHook(() => useConfiguratorActions(), {
			wrapper: wrapper(client),
		});

		await waitFor(() => expect(result.current.loading).toBe(false));
		expect(spy).toHaveBeenCalledTimes(1);
		expect(spy).toHaveBeenCalledWith({});
	});

	it("error path: spy rejects → error set, loading false, actions unchanged", async () => {
		const spy = vi.fn().mockRejectedValue(new Error("boom"));
		const client = makeFakeClient({
			author: {
				listConfiguratorActions: spy,
			} as unknown as PraxisClient["author"],
		});

		const { result } = renderHook(() => useConfiguratorActions({ limit: 5 }), {
			wrapper: wrapper(client),
		});

		await waitFor(() => expect(result.current.error).toBe("boom"));
		expect(result.current.loading).toBe(false);
		expect(result.current.actions).toEqual([]);
	});
});

// Render is imported as unused in some checks — keep it to mirror existing
// ui-test-helper conventions.
void render;
