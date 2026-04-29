import type {
  AuthoringService,
  BootstrapOpts,
  Course,
  CreateCourseInput,
  DraftCourse,
  FileRef,
  Gate,
  GateId,
} from "@praxis/core/types";
/**
 * AuthoringClient — Phase 3 stub.
 * Full implementation deferred to Phase 11 (authoring UI).
 */
export class AuthoringClient implements AuthoringService {
  createCourse(_input: CreateCourseInput): Promise<Course> {
    return Promise.reject(new Error("AuthoringClient not implemented in Phase 3"));
  }

  editGate(_id: GateId, _patch: Partial<Gate>): Promise<Gate> {
    return Promise.reject(new Error("AuthoringClient not implemented in Phase 3"));
  }

  bootstrap(_files: FileRef[], _opts: BootstrapOpts): Promise<DraftCourse> {
    return Promise.reject(new Error("AuthoringClient not implemented in Phase 3"));
  }

  customizePrompt(_modeId: string, _fragmentId: string, _override: string): Promise<void> {
    return Promise.reject(new Error("AuthoringClient not implemented in Phase 3"));
  }
}
