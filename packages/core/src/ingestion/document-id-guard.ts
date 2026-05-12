/**
 * Validates that a documentId cannot be used for filesystem path traversal.
 *
 * Rejects any id that:
 *  - contains `/` or `\` (path separators)
 *  - contains `..` (parent-directory component)
 *  - contains a null byte
 *  - starts with `/`, `~`, or a Windows drive letter (e.g. `C:`)
 *
 * Allows first-party ids: UUIDv7 strings, `_pending_<uuid>`, and any opaque
 * token that does not contain traversal characters.
 *
 * Throws `Error("Invalid documentId: ...")` on rejection — callers (IPC
 * handlers, store methods) propagate this as a hard error rather than
 * silently continuing.
 */
export function assertSafeDocumentId(documentId: string): void {
  if (
    documentId.includes("/") ||
    documentId.includes("\\") ||
    documentId.includes("..") ||
    documentId.includes("\0") ||
    documentId.startsWith("~") ||
    /^[A-Za-z]:/.test(documentId)
  ) {
    throw new Error(`Invalid documentId: "${documentId}"`);
  }
}
