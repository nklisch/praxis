import type {
  ConceptLink,
  ConceptMapClientApi,
  ConceptMapDrawing,
  ConceptMapId,
  ConceptMapSummary,
  ConceptMapVersion,
  CourseId,
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
}
