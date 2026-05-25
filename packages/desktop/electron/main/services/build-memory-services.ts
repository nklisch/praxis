import type { PraxisDb } from "@praxis/core/db";
import { MemoryServiceImpl } from "@praxis/core/services";
import { createTermFirstOccurrencesService } from "@praxis/memory";
import type { TermFirstOccurrencesService } from "@praxis/memory";
import type { MainLogger } from "../logger.js";

export interface MemoryServiceDeps {
  db: PraxisDb;
  log: MainLogger;
}

export interface MemoryServices {
  memoryService: MemoryServiceImpl;
  termFirstOccurrences: TermFirstOccurrencesService;
}

export function buildMemoryServices(deps: MemoryServiceDeps): MemoryServices {
  const { db, log } = deps;
  const memoryService = new MemoryServiceImpl({
    db,
    log,
    decayDaysFor: () => 14,
  });
  const termFirstOccurrences = createTermFirstOccurrencesService({ db });
  return { memoryService, termFirstOccurrences };
}
