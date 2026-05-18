import { documentCitations } from "@praxis/artifacts/schema";
import { asc, eq } from "drizzle-orm";
import { v7 as uuidv7 } from "uuid";
import type { PraxisDb } from "../db/index.js";
import type { DocumentId, Logger, SessionId } from "../types/index.js";
import { brandId } from "../types/index.js";

export interface DocumentCitation {
  id: string;
  documentId: DocumentId;
  citingSessionId: SessionId;
  citingTurnId: string | null;
  startOffset: number;
  endOffset: number;
  citedText: string | null;
  createdAt: Date;
}

export interface CitationsServiceDeps {
  db: PraxisDb;
  log: Logger;
}

export interface CitationsService {
  record(input: {
    documentId: DocumentId;
    citingSessionId: SessionId;
    citingTurnId?: string;
    startOffset: number;
    endOffset: number;
    citedText?: string;
  }): Promise<DocumentCitation>;

  listByDocument(documentId: DocumentId): Promise<DocumentCitation[]>;
}

export class CitationsServiceImpl implements CitationsService {
  constructor(private readonly deps: CitationsServiceDeps) {}

  async record(input: {
    documentId: DocumentId;
    citingSessionId: SessionId;
    citingTurnId?: string;
    startOffset: number;
    endOffset: number;
    citedText?: string;
  }): Promise<DocumentCitation> {
    const id = uuidv7();
    const now = new Date();

    this.deps.db
      .insert(documentCitations)
      .values({
        id,
        documentId: input.documentId,
        citingSessionId: input.citingSessionId,
        citingTurnId: input.citingTurnId ?? null,
        startOffset: input.startOffset,
        endOffset: input.endOffset,
        citedText: input.citedText ?? null,
        createdAt: now,
      })
      .run();

    this.deps.log.debug("citations.record", {
      id,
      documentId: input.documentId,
      citingSessionId: input.citingSessionId,
      startOffset: input.startOffset,
      endOffset: input.endOffset,
    });

    return {
      id,
      documentId: input.documentId,
      citingSessionId: input.citingSessionId,
      citingTurnId: input.citingTurnId ?? null,
      startOffset: input.startOffset,
      endOffset: input.endOffset,
      citedText: input.citedText ?? null,
      createdAt: now,
    };
  }

  async listByDocument(documentId: DocumentId): Promise<DocumentCitation[]> {
    const rows = this.deps.db
      .select()
      .from(documentCitations)
      .where(eq(documentCitations.documentId, documentId))
      .orderBy(asc(documentCitations.startOffset))
      .all();

    return rows.map((r) => ({
      id: r.id,
      documentId: brandId<"DocumentId">(r.documentId),
      citingSessionId: brandId<"SessionId">(r.citingSessionId),
      citingTurnId: r.citingTurnId,
      startOffset: r.startOffset,
      endOffset: r.endOffset,
      citedText: r.citedText,
      createdAt: r.createdAt,
    }));
  }
}
