import { describe, expect, it } from "vitest";
import { isAllowedExternalUrl } from "../url-allowlist.js";

describe("isAllowedExternalUrl", () => {
	it("accepts https URLs", () => {
		expect(isAllowedExternalUrl("https://example.com")).toBe(true);
		expect(isAllowedExternalUrl("https://example.com/path?q=1")).toBe(true);
	});

	it("accepts http URLs", () => {
		expect(isAllowedExternalUrl("http://example.com")).toBe(true);
		expect(isAllowedExternalUrl("http://localhost:3000/foo")).toBe(true);
	});

	it("rejects file:// URLs", () => {
		expect(isAllowedExternalUrl("file:///etc/passwd")).toBe(false);
	});

	it("rejects javascript: URLs", () => {
		expect(isAllowedExternalUrl("javascript:alert(1)")).toBe(false);
	});

	it("rejects data: URLs", () => {
		expect(isAllowedExternalUrl("data:text/plain,hello")).toBe(false);
	});

	it("rejects mailto: URLs", () => {
		expect(isAllowedExternalUrl("mailto:test@example.com")).toBe(false);
	});

	it("rejects strings with embedded newlines", () => {
		expect(isAllowedExternalUrl("https://example.com\nfile:///etc")).toBe(false);
	});

	it("rejects strings with embedded carriage returns", () => {
		expect(isAllowedExternalUrl("https://example.com\rfoo")).toBe(false);
	});

	it("rejects strings with embedded tabs", () => {
		expect(isAllowedExternalUrl("https://example.com\tfoo")).toBe(false);
	});

	it("rejects strings with raw spaces (the parser refuses)", () => {
		expect(isAllowedExternalUrl("https://example.com foo")).toBe(false);
	});

	it("rejects malformed strings", () => {
		expect(isAllowedExternalUrl("not a url")).toBe(false);
		expect(isAllowedExternalUrl(":::::")).toBe(false);
	});

	it("rejects empty string", () => {
		expect(isAllowedExternalUrl("")).toBe(false);
	});

	it("rejects non-string inputs (defensive)", () => {
		// biome-ignore lint/suspicious/noExplicitAny: deliberately testing bad input
		expect(isAllowedExternalUrl(null as any)).toBe(false);
		// biome-ignore lint/suspicious/noExplicitAny: deliberately testing bad input
		expect(isAllowedExternalUrl(undefined as any)).toBe(false);
		// biome-ignore lint/suspicious/noExplicitAny: deliberately testing bad input
		expect(isAllowedExternalUrl(42 as any)).toBe(false);
	});

	it("accepts URLs with query strings and fragments", () => {
		expect(
			isAllowedExternalUrl("https://example.com/foo?bar=baz#frag"),
		).toBe(true);
	});

	it("accepts the http(s) variants of user-input URLs that the spec allows", () => {
		// IDN domains (URL parses them):
		expect(isAllowedExternalUrl("https://例え.テスト/path")).toBe(true);
		// IPv6 literals:
		expect(isAllowedExternalUrl("https://[::1]:8080/foo")).toBe(true);
	});
});
