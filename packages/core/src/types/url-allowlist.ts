/**
 * True iff `input` is a syntactically valid URL whose protocol is `http:`
 * or `https:`. Uses the WHATWG `URL` parser (not a prefix regex), so
 * malformed schemes (`file://`, `javascript:`, `data:`) are rejected by
 * the parser.
 *
 * Note: WHATWG `new URL(...)` silently *strips* embedded ASCII control
 * characters (newlines, carriage returns, tabs) and certain whitespace
 * before parsing. That's a normalization step in the spec, but for our
 * threat model — preventing a renderer from coaxing the main process
 * into opening a smuggled handler — silent stripping is unacceptable.
 * We pre-check for any C0 control character or raw whitespace and
 * reject before parsing.
 *
 * Returns `false` on any parse error or rejected character; never throws.
 *
 * Two call-sites:
 *  - `praxis.shell.openExternal` (IPC handler in
 *    `packages/desktop/electron/main/ipc-server.ts`)
 *  - `UpdateFeedSchema.downloadUrl` + `releaseNotesUrl` refines in
 *    `packages/core/src/services/update-service.ts`
 *
 * One helper, two call-sites — they can't drift.
 */
// biome-ignore lint/suspicious/noControlCharactersInRegex: deliberate C0 + DEL block
const CONTROL_OR_WHITESPACE = /[\x00-\x20\x7F]/;

export function isAllowedExternalUrl(input: string): boolean {
	if (typeof input !== "string" || input.length === 0) return false;
	// Reject any C0 control char (0x00–0x1F including \t, \n, \r), the
	// space (0x20), and DEL (0x7F). The WHATWG URL parser would silently
	// strip these; we want to reject.
	if (CONTROL_OR_WHITESPACE.test(input)) return false;
	let url: URL;
	try {
		url = new URL(input);
	} catch {
		return false;
	}
	return url.protocol === "http:" || url.protocol === "https:";
}
