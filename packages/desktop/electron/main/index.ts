import { app } from "electron";
import { registerIpcHandlers } from "./ipc-server.js";
import { applyMigrations, resolveDbPath } from "./migrations.js";
import type { Services } from "./services.js";
import { buildServices } from "./services.js";
import { createMainWindow } from "./window.js";

let services: Services | null = null;
let mainWindow: Electron.BrowserWindow | null = null;

async function bootstrap(): Promise<void> {
  const dbPath = resolveDbPath();
  await applyMigrations(dbPath);
  services = buildServices(dbPath);

  // Preload pyodide in the background so the first tool call is snappy.
  // Failure is non-fatal — the first call will surface any error.
  services.pyodide.preload().catch((err) => {
    console.warn("[praxis] pyodide preload failed:", err);
  });

  mainWindow = createMainWindow();

  registerIpcHandlers(services, () => mainWindow?.webContents ?? null);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  await bootstrap().catch((err) => {
    console.error("Praxis bootstrap failed:", err);
    app.exit(1);
  });

  app.on("activate", () => {
    if (mainWindow === null) {
      mainWindow = createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

let shuttingDown = false;
app.on("before-quit", async (event) => {
  if (shuttingDown || !services) return;
  shuttingDown = true;
  event.preventDefault();
  try {
    await services.session.shutdown();
  } finally {
    app.exit(0);
  }
});
