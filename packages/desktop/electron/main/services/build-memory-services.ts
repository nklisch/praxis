import type { PraxisDb } from "@praxis/core/db";
import { MemoryServiceImpl } from "@praxis/core/services";
import type { MainLogger } from "../logger.js";

export interface MemoryServices {
  memoryService: MemoryServiceImpl;
}

export function buildMemoryServices(db: PraxisDb, log: MainLogger): MemoryServices {
  const memoryService = new MemoryServiceImpl({
    db,
    log,
    decayDaysFor: () => 14,
  });
  return { memoryService };
}
