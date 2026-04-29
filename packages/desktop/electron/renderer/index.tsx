import { createIpcTransport, createPraxisClient } from "@praxis/client";
import { mountPraxisApp } from "@praxis/ui";

const transport = createIpcTransport(window.praxis);
const client = createPraxisClient(transport);

const root = document.getElementById("root");
if (!root) {
  throw new Error("Could not find #root element");
}

mountPraxisApp(root, { client });
