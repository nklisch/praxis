import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserWindow } from "electron";

const __dirname = fileURLToPath(new URL(".", import.meta.url));

export function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: "Praxis",
    webPreferences: {
      // Security: restrict renderer — no Node, context isolated.
      nodeIntegration: false,
      contextIsolation: true,
      // sandbox: false because electron-vite emits ESM (.mjs) preload, and
      // Electron requires CJS preloads when sandbox is true. The renderer is
      // still locked down via contextIsolation + nodeIntegration: false.
      sandbox: false,
      preload: join(__dirname, "../preload/index.mjs"),
    },
  });

  // Load the renderer.
  if (process.env["ELECTRON_RENDERER_URL"]) {
    // Dev: electron-vite provides the Vite dev server URL.
    win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    win.loadFile(join(__dirname, "../renderer/index.html"));
  }

  return win;
}
