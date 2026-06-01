import {
  ActivityRegistryImpl,
  DebugTraceRegistryImpl,
  QuickCheckServiceImpl,
  SubAgentRegistryImpl,
} from "@praxis/core/services";
import { getToolLabel } from "@praxis/tools/labels";
import type { MainLogger } from "../logger.js";

export interface InfraServices {
  activityRegistry: ActivityRegistryImpl;
  debugTraceRegistry: DebugTraceRegistryImpl;
  subAgentRegistry: SubAgentRegistryImpl;
  quickCheckService: QuickCheckServiceImpl;
}

export function buildInfraServices(log: MainLogger): InfraServices {
  // Activity registry — constructed first so all producers can reference it.
  const activityRegistry = new ActivityRegistryImpl({ log });
  const debugTraceRegistry = new DebugTraceRegistryImpl();

  // Sub-agent transparency registry — resolves step labels from @praxis/tools/labels
  // so the registry doesn't need to import from @praxis/tools itself.
  const subAgentRegistry = new SubAgentRegistryImpl({
    log,
    resolveLabel: (toolName) => getToolLabel(toolName).present,
  });

  // Phase 17: QuickCheckService — stateless in-process dispatch.
  const quickCheckService = new QuickCheckServiceImpl(
    log.child({ component: "quick-check-service" }),
  );

  return { activityRegistry, debugTraceRegistry, subAgentRegistry, quickCheckService };
}
