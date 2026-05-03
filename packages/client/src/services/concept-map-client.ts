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

  create(input: { courseId: CourseId; title: string }): Promise<ConceptMapDrawing> {
    return this.transport.invoke<ConceptMapDrawing>(`${C}.create`, input);
  }

  get(id: ConceptMapId): Promise<ConceptMapDrawing | null> {
    return this.transport.invoke<ConceptMapDrawing | null>(`${C}.get`, id);
  }

  list(input: { courseId: CourseId }): Promise<ConceptMapSummary[]> {
    return this.transport.invoke<ConceptMapSummary[]>(`${C}.list`, input);
  }

  rename(id: ConceptMapId, title: string): Promise<ConceptMapDrawing> {
    return this.transport.invoke<ConceptMapDrawing>(`${C}.rename`, { id, title });
  }

  delete(id: ConceptMapId): Promise<void> {
    return this.transport.invoke<void>(`${C}.delete`, id);
  }

  updateScene(input: {
    id: ConceptMapId;
    scene: TldrawSnapshot;
    conceptLinks: ConceptLink[];
  }): Promise<ConceptMapDrawing> {
    return this.transport.invoke<ConceptMapDrawing>(`${C}.updateScene`, input);
  }

  listVersions(id: ConceptMapId): Promise<ConceptMapVersion[]> {
    return this.transport.invoke<ConceptMapVersion[]>(`${C}.listVersions`, id);
  }
}
