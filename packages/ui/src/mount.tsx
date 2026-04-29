import type { PraxisClient } from "@praxis/core/types";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PraxisApp } from "./app.js";
import "./styles/global.css";

export interface MountOptions {
  client: PraxisClient;
}

export function mountPraxisApp(el: HTMLElement, opts: MountOptions): void {
  const root = createRoot(el);
  root.render(
    <StrictMode>
      <PraxisApp client={opts.client} />
    </StrictMode>,
  );
}
