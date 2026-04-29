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
      // Security: restrict renderer — no Node, context isolated, sandbox.
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: join(__dirname, "../preload/index.js"),
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
