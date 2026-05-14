/**
 * Tests for startToolServer's auth gate + socket permission tightening.
 *
 * Exercises the Unix socket protocol directly: connect, write/read
 * newline-delimited JSON. No real CLI or MCP worker needed.
 */

import { stat } from "node:fs/promises";
import * as net from "node:net";
import * as os from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { ToolServerHandle } from "../tool-server.js";
import { startToolServer } from "../tool-server.js";
import { tool } from "../tools.js";

function socketPath(h: ToolServerHandle): string {
	// biome-ignore lint/style/noNonNullAssertion: CLAUDE_SDK_TOOL_SOCKET is always set by startToolServer
	return h.env.CLAUDE_SDK_TOOL_SOCKET!;
}

function token(h: ToolServerHandle): string {
	// biome-ignore lint/style/noNonNullAssertion: CLAUDE_SDK_TOOL_TOKEN is always set by startToolServer
	return h.env.CLAUDE_SDK_TOOL_TOKEN!;
}

const echoTool = tool(
	"echo",
	"echo back the input",
	z.object({ s: z.string() }),
	async ({ s }) => ({ success: true as const, value: { echoed: s } }),
);

describe("startToolServer — auth gate", () => {
	let handle: ToolServerHandle | undefined;

	afterEach(async () => {
		await handle?.close();
		handle = undefined;
	});

	it("emits a 64-char hex token on the handle", async () => {
		handle = await startToolServer([echoTool]);
		const t = handle.env.CLAUDE_SDK_TOOL_TOKEN;
		expect(typeof t).toBe("string");
		expect(t).toMatch(/^[0-9a-f]{64}$/);
	});

	it("two startToolServer calls produce distinct tokens", async () => {
		const h1 = await startToolServer([echoTool]);
		const h2 = await startToolServer([echoTool]);
		try {
			expect(h1.env.CLAUDE_SDK_TOOL_TOKEN).not.toBe(h2.env.CLAUDE_SDK_TOOL_TOKEN);
		} finally {
			await h1.close();
			await h2.close();
		}
	});

	it("auth frame then tool call → succeeds (happy path)", async () => {
		handle = await startToolServer([echoTool]);

		const result = await new Promise<{ success?: boolean; value?: unknown }>(
			(resolve, reject) => {
				const conn = net.createConnection(socketPath(handle!));
				let buf = "";
				conn.on("connect", () => {
					conn.write(`${JSON.stringify({ type: "auth", token: token(handle!) })}\n`);
					conn.write(`${JSON.stringify({ id: "t1", name: "echo", input: { s: "hi" } })}\n`);
				});
				conn.on("data", (chunk) => {
					buf += chunk.toString();
					const nl = buf.indexOf("\n");
					if (nl !== -1) {
						const line = buf.slice(0, nl);
						conn.destroy();
						try {
							const msg = JSON.parse(line) as {
								result: { success?: boolean; value?: unknown };
							};
							resolve(msg.result);
						} catch (err) {
							reject(err);
						}
					}
				});
				conn.on("error", reject);
			},
		);
		expect(result.success).toBe(true);
		expect(result.value).toEqual({ echoed: "hi" });
	});

	it("tool call without auth frame → connection closed; no tool handler invoked", async () => {
		handle = await startToolServer([echoTool]);
		const closed = await new Promise<boolean>((resolve) => {
			const conn = net.createConnection(socketPath(handle!));
			let gotData = false;
			conn.on("connect", () => {
				// Send a tool call first — must be denied.
				conn.write(`${JSON.stringify({ id: "t1", name: "echo", input: { s: "x" } })}\n`);
			});
			conn.on("data", () => {
				gotData = true;
			});
			conn.on("close", () => resolve(!gotData));
			conn.on("error", () => resolve(!gotData));
		});
		expect(closed).toBe(true);
	});

	it("auth frame with wrong token → connection closed", async () => {
		handle = await startToolServer([echoTool]);
		const closed = await new Promise<boolean>((resolve) => {
			const conn = net.createConnection(socketPath(handle!));
			let gotData = false;
			conn.on("connect", () => {
				conn.write(`${JSON.stringify({ type: "auth", token: "deadbeef".repeat(8) })}\n`);
				conn.write(`${JSON.stringify({ id: "t1", name: "echo", input: { s: "x" } })}\n`);
			});
			conn.on("data", () => {
				gotData = true;
			});
			conn.on("close", () => resolve(!gotData));
			conn.on("error", () => resolve(!gotData));
		});
		expect(closed).toBe(true);
	});

	it("malformed auth frame (not JSON) → connection closed", async () => {
		handle = await startToolServer([echoTool]);
		const closed = await new Promise<boolean>((resolve) => {
			const conn = net.createConnection(socketPath(handle!));
			let gotData = false;
			conn.on("connect", () => {
				conn.write(`not-json\n`);
			});
			conn.on("data", () => {
				gotData = true;
			});
			conn.on("close", () => resolve(!gotData));
			conn.on("error", () => resolve(!gotData));
		});
		expect(closed).toBe(true);
	});

	it("no frame within auth timeout window → connection closed", async () => {
		handle = await startToolServer([echoTool]);

		// Spy on setTimeout so we can capture the auth-timeout callback that
		// the server-side connection handler arms (AUTH_TIMEOUT_MS = 5_000ms).
		// The spy must be active when the client connects (the server calls
		// setTimeout inside the 'connection' event handler, not at listen time).
		// We hold a reference to the real setTimeout so the spy can pass all
		// non-auth timers through unmodified.
		const realSetTimeout = setTimeout.bind(globalThis);
		const capturedAuthCallbacks: Array<() => void> = [];

		const spy = vi
			.spyOn(global, "setTimeout")
			.mockImplementation((fn: (...args: unknown[]) => void, delay?: number) => {
				if (delay === 5000) {
					// Intercept AUTH_TIMEOUT_MS timer — record callback; return a
					// dummy Timeout so clearTimeout on the happy path still works.
					capturedAuthCallbacks.push(() => fn());
					return {
						ref: () => {},
						unref: () => {},
						hasRef: () => false,
						[Symbol.toPrimitive]: () => 0,
					} as unknown as ReturnType<typeof setTimeout>;
				}
				// biome-ignore lint/suspicious/noExplicitAny: delegating to preserved real impl
				return (realSetTimeout as (...args: any[]) => ReturnType<typeof setTimeout>)(fn, delay);
			});

		try {
			// Connect but write no frames — the server arms the auth timeout.
			const conn = await new Promise<net.Socket>((resolve, reject) => {
				const s = net.createConnection(socketPath(handle!));
				s.on("connect", () => resolve(s));
				s.on("error", reject);
			});

			// Restore real timers before firing the callback so any internal
			// Node.js I/O timers used by the socket teardown work normally.
			spy.mockRestore();

			// Sanity: the spy must have captured exactly one 5_000ms timer.
			expect(capturedAuthCallbacks.length).toBe(1);

			// Simulate AUTH_TIMEOUT_MS elapsing — fires conn.destroy() server-side.
			for (const cb of capturedAuthCallbacks) {
				cb();
			}

			// The server must close the connection without sending any data.
			const closedWithoutData = await new Promise<boolean>((resolve) => {
				let gotData = false;
				conn.on("data", () => {
					gotData = true;
				});
				conn.on("close", () => resolve(!gotData));
				conn.on("error", () => resolve(!gotData));
			});

			expect(closedWithoutData).toBe(true);
		} finally {
			spy.mockRestore();
		}
	});

	it("auth frame split across two write chunks authenticates correctly", async () => {
		handle = await startToolServer([echoTool]);

		const result = await new Promise<{ success?: boolean; value?: unknown }>(
			(resolve, reject) => {
				const conn = net.createConnection(socketPath(handle!));
				let buf = "";

				conn.on("connect", () => {
					// Split the auth JSON across two writes to simulate TCP fragmentation.
					// The server's newline-delimited buffer must accumulate both chunks
					// before processing the auth frame.
					const authJson = JSON.stringify({ type: "auth", token: token(handle!) });
					const splitAt = Math.floor(authJson.length / 2);
					const firstHalf = authJson.slice(0, splitAt);
					const secondHalfAndNewline = authJson.slice(splitAt) + "\n";

					conn.write(firstHalf);
					// Small delay so the two writes arrive as separate TCP chunks.
					setTimeout(() => {
						conn.write(secondHalfAndNewline);
						// Tool call follows after auth is complete.
						conn.write(
							`${JSON.stringify({ id: "split1", name: "echo", input: { s: "split" } })}\n`,
						);
					}, 10);
				});

				conn.on("data", (chunk) => {
					buf += chunk.toString();
					const nl = buf.indexOf("\n");
					if (nl !== -1) {
						const line = buf.slice(0, nl);
						conn.destroy();
						try {
							const msg = JSON.parse(line) as {
								result: { success?: boolean; value?: unknown };
							};
							resolve(msg.result);
						} catch (err) {
							reject(err);
						}
					}
				});
				conn.on("error", reject);
			},
		);

		expect(result.success).toBe(true);
		expect(result.value).toEqual({ echoed: "split" });
	});

	it("auth frame coalesced with tool call in one chunk → both processed (auth then call)", async () => {
		handle = await startToolServer([echoTool]);

		const result = await new Promise<{ success?: boolean; value?: unknown }>(
			(resolve, reject) => {
				const conn = net.createConnection(socketPath(handle!));
				let buf = "";

				conn.on("connect", () => {
					// Write auth frame and tool call frame together in a single write call.
					// The server must split on "\n" and process auth before dispatching
					// the tool call — both frames arrive in one chunk.
					const authFrame = JSON.stringify({ type: "auth", token: token(handle!) });
					const callFrame = JSON.stringify({
						id: "coalesced1",
						name: "echo",
						input: { s: "coalesced" },
					});
					conn.write(`${authFrame}\n${callFrame}\n`);
				});

				conn.on("data", (chunk) => {
					buf += chunk.toString();
					const nl = buf.indexOf("\n");
					if (nl !== -1) {
						const line = buf.slice(0, nl);
						conn.destroy();
						try {
							const msg = JSON.parse(line) as {
								result: { success?: boolean; value?: unknown };
							};
							resolve(msg.result);
						} catch (err) {
							reject(err);
						}
					}
				});
				conn.on("error", reject);
			},
		);

		expect(result.success).toBe(true);
		expect(result.value).toEqual({ echoed: "coalesced" });
	});
});

describe("startToolServer — socket permissions", () => {
	let handle: ToolServerHandle | undefined;
	afterEach(async () => {
		await handle?.close();
		handle = undefined;
	});

	it.skipIf(os.platform() === "win32")(
		"socket inode has 0600 permissions",
		async () => {
			handle = await startToolServer([echoTool]);
			const s = await stat(socketPath(handle));
			// Mask to permission bits; expect rw------.
			expect(s.mode & 0o777).toBe(0o600);
		},
	);
});
