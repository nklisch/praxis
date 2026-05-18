import type {
  ConceptId,
  ConceptLink,
  ConceptMapClientApi,
  ConceptMapDrawing,
  ConceptMapId,
  ConceptMapSummary,
  ConceptMapVersion,
  CourseId,
  NoteId,
  RippleSummary,
  TldrawSnapshot,
} from "@praxis/core/types";
import { type IpcEnvelope, unwrapEnvelope } from "../transport/envelope.js";
import type { ClientTransport } from "../transport/types.js";

const C = "praxis.conceptMaps" as const;

/**
 * ConceptMapClient — Phase 15b implementation.
 *
 * Implements ConceptMapClientApi (renderer-facing). The `studentId` parameter is
 * omitted — the IPC server resolves the active student from the single-student v1
 * install context.
 */
export class ConceptMapClient implements ConceptMapClientApi {
  constructor(private readonly transport: ClientTransport) {}

  async create(input: { courseId: CourseId; title: string }): Promise<ConceptMapDrawing> {
    const result = await this.transport.invoke<IpcEnvelope<ConceptMapDrawing> | ConceptMapDrawing>(
      `${C}.create`,
      input,
    );
    return unwrapEnvelope(result);
  }

  async get(id: ConceptMapId): Promise<ConceptMapDrawing | null> {
    const result = await this.transport.invoke<
      IpcEnvelope<ConceptMapDrawing | null> | ConceptMapDrawing | null
    >(`${C}.get`, id);
    return unwrapEnvelope(result);
  }

  async list(input: { courseId: CourseId }): Promise<ConceptMapSummary[]> {
    const result = await this.transport.invoke<
      IpcEnvelope<ConceptMapSummary[]> | ConceptMapSummary[]
    >(`${C}.list`, input);
    return unwrapEnvelope(result);
  }

  async rename(id: ConceptMapId, title: string): Promise<ConceptMapDrawing> {
    const result = await this.transport.invoke<IpcEnvelope<ConceptMapDrawing> | ConceptMapDrawing>(
      `${C}.rename`,
      { id, title },
    );
    return unwrapEnvelope(result);
  }

  async delete(id: ConceptMapId): Promise<void> {
    const result = await this.transport.invoke<IpcEnvelope<void> | void>(`${C}.delete`, id);
    return unwrapEnvelope(result);
  }

  async updateScene(input: {
    id: ConceptMapId;
    scene: TldrawSnapshot;
    conceptLinks: ConceptLink[];
  }): Promise<ConceptMapDrawing> {
    const result = await this.transport.invoke<IpcEnvelope<ConceptMapDrawing> | ConceptMapDrawing>(
      `${C}.updateScene`,
      input,
    );
    return unwrapEnvelope(result);
  }

  async listVersions(id: ConceptMapId): Promise<ConceptMapVersion[]> {
    const result = await this.transport.invoke<
      IpcEnvelope<ConceptMapVersion[]> | ConceptMapVersion[]
    >(`${C}.listVersions`, id);
    return unwrapEnvelope(result);
  }

  async setNodeLink(input: {
    mapId: ConceptMapId;
    elementId: string;
    candidateId: string | null;
    state: "linked" | "best_guess" | "unlinked";
  }): Promise<ConceptMapDrawing> {
    const result = await this.transport.invoke<IpcEnvelope<ConceptMapDrawing> | ConceptMapDrawing>(
      `${C}.setNodeLink`,
      input,
    );
    return unwrapEnvelope(result);
  }

  async computeRipples(input: {
    mapId: ConceptMapId;
    elementId: string;
    candidateId: ConceptId;
  }): Promise<RippleSummary> {
    const result = await this.transport.invoke<IpcEnvelope<RippleSummary> | RippleSummary>(
      `${C}.computeRipples`,
      input,
    );
    return unwrapEnvelope(result);
  }

  async convertFromSketch(input: {
    sketchNoteId: NoteId;
  }): Promise<{ conceptMapId: ConceptMapId; originalSketchNoteId: NoteId; nodeCount: number }> {
    const result = await this.transport.invoke<
      | IpcEnvelope<{
          conceptMapId: ConceptMapId;
          originalSketchNoteId: NoteId;
          nodeCount: number;
        }>
      | { conceptMapId: ConceptMapId; originalSketchNoteId: NoteId; nodeCount: number }
    >(`${C}.convertFromSketch`, input);
    return unwrapEnvelope(result);
  }
}
