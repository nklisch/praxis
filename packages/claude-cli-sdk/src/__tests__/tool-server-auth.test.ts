/**
 * Tests for startToolServer's auth gate + socket permission tightening.
 *
 * Exercises the Unix socket protocol directly: connect, write/read
 * newline-delimited JSON. No real CLI or MCP worker needed.
 */

import { stat } from "node:fs/promises";
import * as net from "node:net";
import * as os from "node:os";
import { afterEach, describe, expect, it } from "vitest";
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
