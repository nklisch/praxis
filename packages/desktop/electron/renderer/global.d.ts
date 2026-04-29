import type { PraxisIpcBridge } from "@praxis/client";

declare global {
  interface Window {
    praxis: PraxisIpcBridge;
  }
}
