import type { ArtifactsService, DocumentId, DocumentScopesService } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { describe, expect, it, vi } from "vitest";
import { makeToolContext } from "../../../../../tests/helpers/tool-context.js";
import { listLibraryDocumentsTool } from "../list-library-documents.js";

function makeDoc(id: string) {
  return {
    documentId: brandId<"DocumentId">(id) as DocumentId,
    filename: `${id}.pdf`,
    mimeType: "application/pdf",
    chunkCount: 5,
    hasPageImages: false,
  };
}

function makeDocumentScopes(sessionAttachedIds: DocumentId[] = []): DocumentScopesService {
  return {
    listForScope: vi.fn().mockResolvedValue(sessionAttachedIds),
    listForScopeDetailed: vi.fn().mockResolvedValue([]),
    attach: vi.fn().mockResolvedValue({ attached: true }),
    detach: vi.fn().mockResolvedValue({ detached: true }),
    attachMany: vi.fn().mockResolvedValue({ newlyAttached: [] }),
    listScopesForDocument: vi.fn().mockResolvedValue([]),
    promoteScope: vi.fn().mockResolvedValue({ promoted: [] }),
  };
}

describe("course.list_library_documents handler", () => {
  it("returns all library documents with attachedToCurrentCourse=false when no course in scope", async () => {
    const docs = [makeDoc("doc-1"), makeDoc("doc-2")];
    const artifacts: Partial<ArtifactsService> = {
      listDocuments: vi.fn().mockResolvedValue(docs),
    };
    const ctx = makeToolContext({
      services: {
        artifacts: artifacts as ArtifactsService,
        documentScopes: makeDocumentScopes(),
      },
    });

    const result = await listLibraryDocumentsTool.handler({}, ctx);
    expect(result.documents).toHaveLength(2);
    expect(result.documents.every((d) => d.attachedToCurrentCourse === false)).toBe(true);
  });

  it("marks attached docs correctly when courseDocumentIds is set", async () => {
    const doc1 = makeDoc("doc-1");
    const doc2 = makeDoc("doc-2");
    const artifacts: Partial<ArtifactsService> = {
      listDocuments: vi.fn().mockResolvedValue([doc1, doc2]),
    };
    const courseDocumentIds = [brandId<"DocumentId">("doc-1") as DocumentId];
    const ctx = makeToolContext({
      services: {
        artifacts: artifacts as ArtifactsService,
        documentScopes: makeDocumentScopes(),
      },
      courseId: brandId<"CourseId">("course-x"),
      courseDocumentIds,
    });

    const result = await listLibraryDocumentsTool.handler({}, ctx);
    const d1 = result.documents.find((d) => d.documentId === "doc-1");
    const d2 = result.documents.find((d) => d.documentId === "doc-2");
    expect(d1?.attachedToCurrentCourse).toBe(true);
    expect(d2?.attachedToCurrentCourse).toBe(false);
  });

  it("passes studentId to artifacts.listDocuments", async () => {
    const artifacts: Partial<ArtifactsService> = {
      listDocuments: vi.fn().mockResolvedValue([]),
    };
    const ctx = makeToolContext({
      services: {
        artifacts: artifacts as ArtifactsService,
        documentScopes: makeDocumentScopes(),
      },
      studentId: "student-test",
    });
    await listLibraryDocumentsTool.handler({}, ctx);
    expect(artifacts.listDocuments).toHaveBeenCalledWith(ctx.studentId);
  });

  it("has correct name, tier, effects", () => {
    expect(listLibraryDocumentsTool.name).toBe("course.list_library_documents");
    expect(listLibraryDocumentsTool.tier).toBe("grounded");
    expect(listLibraryDocumentsTool.effects).toContain("none");
  });

  // ─── attachedToCurrentSession tests ──────────────────────────────────────────

  it("attachedToCurrentSession is false for all docs when no session-scope rows exist", async () => {
    const docs = [makeDoc("doc-1"), makeDoc("doc-2")];
    const artifacts: Partial<ArtifactsService> = {
      listDocuments: vi.fn().mockResolvedValue(docs),
    };
    // No session-scope rows.
    const ctx = makeToolContext({
      services: {
        artifacts: artifacts as ArtifactsService,
        documentScopes: makeDocumentScopes([]),
      },
    });

    const result = await listLibraryDocumentsTool.handler({}, ctx);
    expect(result.documents.every((d) => d.attachedToCurrentSession === false)).toBe(true);
  });

  it("marks docs as attachedToCurrentSession=true when session has those docs scoped", async () => {
    const doc1 = makeDoc("doc-1");
    const doc2 = makeDoc("doc-2");
    const artifacts: Partial<ArtifactsService> = {
      listDocuments: vi.fn().mockResolvedValue([doc1, doc2]),
    };
    const sessionAttached = [brandId<"DocumentId">("doc-1") as DocumentId];
    const ctx = makeToolContext({
      services: {
        artifacts: artifacts as ArtifactsService,
        documentScopes: makeDocumentScopes(sessionAttached),
      },
      sessionId: "session-bootstrap-s1",
    });

    const result = await listLibraryDocumentsTool.handler({}, ctx);
    const d1 = result.documents.find((d) => d.documentId === "doc-1");
    const d2 = result.documents.find((d) => d.documentId === "doc-2");
    expect(d1?.attachedToCurrentSession).toBe(true);
    expect(d2?.attachedToCurrentSession).toBe(false);
  });

  it("uses parentSessionId for session scope lookup when set (explorer sub-agent mode)", async () => {
    const docs = [makeDoc("doc-1")];
    const artifacts: Partial<ArtifactsService> = {
      listDocuments: vi.fn().mockResolvedValue(docs),
    };

    // listForScope is called with the parent session id, not the sub-agent session.
    const listForScopeSpy = vi.fn().mockResolvedValue([brandId<"DocumentId">("doc-1")]);
    const documentScopes: DocumentScopesService = {
      ...makeDocumentScopes(),
      listForScope: listForScopeSpy,
    };

    const ctx = makeToolContext({
      services: {
        artifacts: artifacts as ArtifactsService,
        documentScopes,
      },
      sessionId: "sub-agent-session-s2",
      parentSessionId: brandId<"SessionId">("parent-session-s1"),
    });

    const result = await listLibraryDocumentsTool.handler({}, ctx);

    // listForScope was called with the PARENT session, not the sub-agent session.
    expect(listForScopeSpy).toHaveBeenCalledWith({
      kind: "session",
      id: brandId<"SessionId">("parent-session-s1"),
    });
    // doc-1 is session-attached (returned by the spy).
    expect(result.documents[0]?.attachedToCurrentSession).toBe(true);
  });

  it("falls back to sessionId for scope lookup when parentSessionId is absent", async () => {
    const docs = [makeDoc("doc-1")];
    const artifacts: Partial<ArtifactsService> = {
      listDocuments: vi.fn().mockResolvedValue(docs),
    };

    const listForScopeSpy = vi.fn().mockResolvedValue([]);
    const documentScopes: DocumentScopesService = {
      ...makeDocumentScopes(),
      listForScope: listForScopeSpy,
    };

    const ctx = makeToolContext({
      services: {
        artifacts: artifacts as ArtifactsService,
        documentScopes,
      },
      sessionId: "top-level-session",
    });

    await listLibraryDocumentsTool.handler({}, ctx);

    // Falls back to the session's own id.
    expect(listForScopeSpy).toHaveBeenCalledWith({
      kind: "session",
      id: brandId<"SessionId">("top-level-session"),
    });
  });
});
