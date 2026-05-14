import type { Logger } from "@praxis/core/types";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

// The envelope module does NOT use `ipcMain` directly, but `withSchema`
// uses Zod, and `wrapEnvelope` reaches into uuid + serializeErrorRedacted.
// No electron-specific mocking is required at the module level.

import {
	toEnvelopeError,
	withSchema,
	wrapEnvelope,
} from "../ipc-error-envelope.js";

interface CapturedRecord {
	level: "debug" | "info" | "warn" | "error";
	message: string;
	fields?: Record<string, unknown>;
	bindings?: Record<string, unknown>;
}

function makeRecorder(): { log: Logger; records: CapturedRecord[] } {
	const records: CapturedRecord[] = [];
	const make = (bindings: Record<string, unknown>): Logger => ({
		debug: (m, f) =>
			records.push({
				level: "debug",
				message: m,
				...(f !== undefined && { fields: f }),
				...(Object.keys(bindings).length > 0 && { bindings }),
			}),
		info: (m, f) =>
			records.push({
				level: "info",
				message: m,
				...(f !== undefined && { fields: f }),
				...(Object.keys(bindings).length > 0 && { bindings }),
			}),
		warn: (m, f) =>
			records.push({
				level: "warn",
				message: m,
				...(f !== undefined && { fields: f }),
				...(Object.keys(bindings).length > 0 && { bindings }),
			}),
		error: (m, f) =>
			records.push({
				level: "error",
				message: m,
				...(f !== undefined && { fields: f }),
				...(Object.keys(bindings).length > 0 && { bindings }),
			}),
		child: (b) => make({ ...bindings, ...b }),
	});
	return { log: make({}), records };
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe("wrapEnvelope — success path", () => {
	it("returns { ok: true, value } when the handler resolves", async () => {
		const { log } = makeRecorder();
		const wrapped = wrapEnvelope("praxis.test", log, async () => 42);
		const result = await wrapped();
		expect(result).toEqual({ ok: true, value: 42 });
	});

	it("passes args through to the wrapped fn", async () => {
		const { log } = makeRecorder();
		const inner = vi.fn(async (n: number, s: string) => `${n}:${s}`);
		const wrapped = wrapEnvelope("praxis.test", log, inner);
		const result = await wrapped(1, "x");
		expect(inner).toHaveBeenCalledWith(1, "x");
		expect(result).toEqual({ ok: true, value: "1:x" });
	});

	it("does not log error on the success path", async () => {
		const { log, records } = makeRecorder();
		const wrapped = wrapEnvelope("praxis.test", log, async () => "ok");
		await wrapped();
		const errors = records.filter((r) => r.level === "error");
		expect(errors).toHaveLength(0);
	});
});

describe("wrapEnvelope — failure path", () => {
	it("never rejects; surfaces failure as { ok: false, error }", async () => {
		const { log } = makeRecorder();
		const wrapped = wrapEnvelope("praxis.test", log, async () => {
			throw new Error("internal boom");
		});
		const result = await wrapped();
		expect(result).toMatchObject({
			ok: false,
			error: { code: "INTERNAL", message: "An internal error occurred" },
		});
	});

	it("maps ZodError to VALIDATION_FAILED with the joined path", async () => {
		const { log } = makeRecorder();
		const schema = z.object({ name: z.string().min(1) });
		const inner = withSchema(schema, async (parsed) => parsed.name);
		const wrapped = wrapEnvelope("praxis.test", log, inner);

		const result = await wrapped({ name: "" });
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.code).toBe("VALIDATION_FAILED");
			expect(result.error.message).toContain("name");
		}
	});

	it("never leaks a filesystem path through the message", async () => {
		const { log } = makeRecorder();
		const wrapped = wrapEnvelope("praxis.test", log, async () => {
			throw new Error("/Users/x/.praxis/dev.db not found");
		});
		const result = await wrapped();
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.message).toBe("An internal error occurred");
			expect(result.error.message).not.toContain("/Users/x");
		}
	});

	it("attaches a UUIDv7 requestId to every envelope failure", async () => {
		const { log } = makeRecorder();
		const wrapped = wrapEnvelope("praxis.test", log, async () => {
			throw new Error("boom");
		});
		const result = await wrapped();
		expect(result.ok).toBe(false);
		if (!result.ok) {
			// UUIDv7 string shape: 8-4-4-4-12 lowercase hex
			expect(result.error.requestId).toMatch(
				/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
			);
		}
	});

	it("logs the original error with requestId and a redacted secret", async () => {
		const { log, records } = makeRecorder();
		const wrapped = wrapEnvelope("praxis.test", log, async () => {
			throw new Error("apiKey=sk-ant-fake-leak-12345 failed");
		});
		const result = await wrapped();
		expect(result.ok).toBe(false);

		const errorRecord = records.find((r) => r.level === "error");
		expect(errorRecord).toBeDefined();
		const fields = errorRecord?.fields as
			| { requestId?: string; err?: { message?: string } }
			| undefined;
		expect(fields).toBeDefined();
		// requestId in the log matches the envelope's requestId
		if (result.ok === false) {
			expect(fields?.requestId).toBe(result.error.requestId);
		}
		// the logged error message is redacted
		expect(fields?.err?.message).toContain("sk-ant-[REDACTED]");
		expect(fields?.err?.message).not.toContain("sk-ant-fake-leak");
	});

	it("preserves allowlisted error codes (e.g., SecretStorage 'unavailable')", async () => {
		const { log } = makeRecorder();
		const wrapped = wrapEnvelope("praxis.test", log, async () => {
			const err = Object.assign(new Error("secret backend not available"), {
				code: "unavailable",
			});
			throw err;
		});
		const result = await wrapped();
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.code).toBe("INTERNAL");
			expect(result.error.message).toContain("unavailable");
		}
	});

	it("does NOT pass through unrecognised codes", async () => {
		const { log } = makeRecorder();
		const wrapped = wrapEnvelope("praxis.test", log, async () => {
			throw Object.assign(new Error("???"), { code: "MY_SPECIAL_INTERNAL" });
		});
		const result = await wrapped();
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.error.message).toBe("An internal error occurred");
			expect(result.error.message).not.toContain("MY_SPECIAL_INTERNAL");
		}
	});
});

describe("withSchema", () => {
	it("validates input with the given Zod schema", async () => {
		const schema = z.object({ a: z.number() });
		const fn = vi.fn(async (parsed: { a: number }) => parsed.a * 2);
		const wrapped = withSchema(schema, fn);

		const out = await wrapped({ a: 21 });
		expect(out).toBe(42);
		expect(fn).toHaveBeenCalledWith({ a: 21 });
	});

	it("throws ZodError on input mismatch", async () => {
		const schema = z.object({ a: z.number() });
		const wrapped = withSchema(schema, async (parsed: { a: number }) => parsed.a);
		await expect(wrapped({ a: "not a number" })).rejects.toThrow(
			expect.objectContaining({ name: "ZodError" }),
		);
	});
});

describe("toEnvelopeError", () => {
	it("maps a Zod-like error to VALIDATION_FAILED", () => {
		const fakeZod = {
			name: "ZodError",
			issues: [{ path: ["user", "email"], message: "Invalid" }],
		};
		const out = toEnvelopeError(fakeZod, "request-id-123");
		expect(out.code).toBe("VALIDATION_FAILED");
		expect(out.message).toContain("user.email");
		expect(out.requestId).toBe("request-id-123");
	});

	it("uses (root) when ZodError path is empty", () => {
		const fakeZod = { name: "ZodError", issues: [{ path: [], message: "x" }] };
		const out = toEnvelopeError(fakeZod, "req");
		expect(out.message).toContain("(root)");
	});

	it("falls through to INTERNAL for everything else", () => {
		const out = toEnvelopeError(new Error("anything"), "req");
		expect(out.code).toBe("INTERNAL");
		expect(out.message).toBe("An internal error occurred");
	});
});
