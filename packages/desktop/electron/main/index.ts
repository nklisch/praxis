import { join } from "node:path";
import { readLoggingConfig } from "@praxis/core/config";
import { openDb } from "@praxis/core/db";
import { serializeError } from "@praxis/core/types";
import { app } from "electron";
import { registerIpcHandlers } from "./ipc-server.js";
import { registerLogChannel } from "./log-channel.js";
import type { MainLogger } from "./logger.js";
import { createMainLogger } from "./logger.js";
import { applyMigrations, resolveDbPath } from "./migrations.js";
import type { Services } from "./services.js";
import { buildServices } from "./services.js";
import { createMainWindow } from "./window.js";

let services: Services | null = null;
let mainWindow: Electron.BrowserWindow | null = null;
let log: MainLogger | null = null;

async function createBootstrapLogger(dbPath: string): Promise<MainLogger> {
  const { db } = openDb({ path: dbPath });
  const cfg = readLoggingConfig(db, { isPackaged: app.isPackaged });
  return createMainLogger({
    level: cfg.level,
    pretty: !app.isPackaged,
    prompts: cfg.prompts,
    maxFileSizeMb: cfg.maxFileSizeMb,
    maxFiles: cfg.maxFiles,
    ...(cfg.fileEnabled && {
      filePath: join(app.getPath("userData"), "logs", "praxis.log"),
    }),
    baseBindings: { pid: process.pid, version: app.getVersion() },
  });
}

async function bootstrap(): Promise<void> {
  const dbPath = resolveDbPath();
  log = await createBootstrapLogger(dbPath);
  const bootLog = log.child({ component: "bootstrap" });

  bootLog.info("bootstrap.start", { dbPath });
  await applyMigrations(dbPath);
  bootLog.info("bootstrap.migrations_applied");

  services = buildServices(dbPath, log);
  bootLog.info("bootstrap.services_built");

  services.pyodide.preload().catch((err: unknown) => {
    bootLog.warn("bootstrap.pyodide_preload_failed", { err: serializeError(err) });
  });
  services.embeddings.preload().catch((err: unknown) => {
    bootLog.warn("bootstrap.embeddings_preload_failed", { err: serializeError(err) });
  });

  mainWindow = createMainWindow();
  registerLogChannel(log);
  registerIpcHandlers(services, () => mainWindow?.webContents ?? null, log);

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  bootLog.info("bootstrap.done");
}

app.whenReady().then(async () => {
  await bootstrap().catch((err: unknown) => {
    // log may not be initialized; fall back to console for this one error
    if (log) {
      log.error("bootstrap.failed", { err: serializeError(err) });
    } else {
      // pre-logger fallback — intentional console use before logger is initialized
      console.error("Praxis bootstrap failed:", err);
    }
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
    await log?.shutdown();
    app.exit(0);
  }
});
