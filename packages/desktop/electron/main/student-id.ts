import type { StudentId } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import type { Services } from "./services.js";

export function getStudentId(services: Services): StudentId {
  return brandId<"StudentId">(services.getDefaultStudentId()) as StudentId;
}
