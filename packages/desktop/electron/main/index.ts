import { join } from "node:path";
import { readLoggingConfig } from "@praxis/core/config";
import { openDb } from "@praxis/core/db";
import { serializeErrorRedacted } from "@praxis/core/types";
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
let activeAbortControllers: Map<string, AbortController> | null = null;

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

  // Migrations must run BEFORE createBootstrapLogger — the logger reads its
  // config from `config_kv`, which doesn't exist until migration 0000 lands.
  // Pre-logger errors fall through to the .catch() in app.whenReady() and
  // surface via console.error.
  await applyMigrations(dbPath);

  log = await createBootstrapLogger(dbPath);
  const bootLog = log.child({ component: "bootstrap" });

  bootLog.info("bootstrap.start", { dbPath });
  bootLog.info("bootstrap.migrations_applied");

  services = buildServices(dbPath, log);
  bootLog.info("bootstrap.services_built");

  const pyodideHandle = services.activity.start({ label: "preparing math tools" });
  services.pyodide
    .preload()
    .then(() => pyodideHandle.finish("done"))
    .catch((err: unknown) => {
      pyodideHandle.finish("failed", {
        message: err instanceof Error ? err.message : String(err),
      });
      bootLog.warn("bootstrap.pyodide_preload_failed", { err: serializeErrorRedacted(err) });
    });

  const embedHandle = services.activity.start({ label: "preparing search" });
  services.embeddings
    .preload()
    .then(() => embedHandle.finish("done"))
    .catch((err: unknown) => {
      embedHandle.finish("failed", {
        message: err instanceof Error ? err.message : String(err),
      });
      bootLog.warn("bootstrap.embeddings_preload_failed", { err: serializeErrorRedacted(err) });
    });

  mainWindow = createMainWindow();
  registerLogChannel(log);
  const ipcResult = registerIpcHandlers(services, () => mainWindow?.webContents ?? null, log);
  activeAbortControllers = ipcResult.activeAbortControllers;

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  bootLog.info("bootstrap.done");
}

app.whenReady().then(async () => {
  await bootstrap().catch((err: unknown) => {
    // log may not be initialized; fall back to console for this one error
    if (log) {
      log.error("bootstrap.failed", { err: serializeErrorRedacted(err) });
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
    // 1. Stop accepting new work — close sessions.
    // Stop the session sweep indexer before closing sessions so it doesn't
    // try to discard entries while shutdown is in progress.
    services.sessionSweep.stop();
    await services.session.shutdown();
    // 2. Cancel any in-flight ingestion / activity producers via their
    //    own AbortControllers. The activity registry's shutdown is purely
    //    a display reset; producers' work-cancellation happens via the
    //    activeAbortControllers map maintained by ipc-server.
    if (activeAbortControllers) {
      for (const controller of activeAbortControllers.values()) controller.abort();
      activeAbortControllers.clear();
    }
    // 3. Clear activity display.
    services.activity.shutdown();
    // 4. Tear down forked Node-mode workers so child processes
    //    don't get orphaned. Shutdown is idempotent and best-effort.
    for (const [name, worker] of Object.entries(services.workers)) {
      await worker.shutdown().catch((err: unknown) => {
        log?.warn("worker.shutdown_failed", { name, err: serializeErrorRedacted(err) });
      });
    }
  } finally {
    await log?.shutdown();
    app.exit(0);
  }
});
