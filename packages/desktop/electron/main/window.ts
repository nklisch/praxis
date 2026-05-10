import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { BrowserWindow, shell } from "electron";

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

  // Security: refuse renderer-initiated navigation away from the app origin.
  // A hypothetical XSS or programmatic navigation could otherwise load a
  // remote origin into the same webContents that has `window.praxis` exposed.
  const appOrigin = process.env["ELECTRON_RENDERER_URL"] ?? "file://";
  const isAppOrigin = (url: string): boolean =>
    url.startsWith(appOrigin) || url.startsWith("file://");

  win.webContents.on("will-navigate", (e, url) => {
    if (!isAppOrigin(url)) {
      e.preventDefault();
    }
  });

  // Security: block window.open and forward to shell.openExternal (which
  // already limits to http/https in ipc-server.ts). All popups are denied
  // at the Electron level; external links open in the system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      void shell.openExternal(url);
    }
    return { action: "deny" };
  });

  return win;
}
