---
id: gate-security-browser-window-navigation-guards
kind: story
tags: [security]
parent: null
depends_on: []
release_binding: v0.1.0
gate_origin: security
created: 2026-05-10
updated: 2026-05-10
---

# BrowserWindow has no `will-navigate` / `setWindowOpenHandler` guards

## Severity
Low

## Domain
API Security / Electron hardening

## Location
`packages/desktop/electron/main/window.ts:7-33`

## Evidence

```typescript
// window.ts — webPreferences are good (nodeIntegration: false, contextIsolation: true)
// but there is no guard installed against renderer-initiated navigation
// or window.open. The renderer is loaded once via loadFile/loadURL and
// then trusted to never navigate to anything else.
webPreferences: {
  nodeIntegration: false,
  contextIsolation: true,
  sandbox: false,   // (preload is ESM)
  preload: join(__dirname, "../preload/index.mjs"),
},
```

Per Electron's own security checklist, every BrowserWindow should either
install `webContents.on('will-navigate', ...)` to refuse navigation away
from the app's origin, and `webContents.setWindowOpenHandler(...)` to
forward popups to `shell.openExternal` (which already filters to
http/https in `ipc-server.ts:1161`). Without these, a hypothetical XSS or
programmatic navigation could load a remote origin into the same
`webContents` that has `window.praxis` (the IPC bridge) exposed. With
react-markdown's safe defaults and the absence of `dangerouslySetInnerHTML`
in the bundle, this is currently theoretical — but it's the standard
hardening for a shipping Electron app and electron-builder docs flag
missing it.

## Remediation direction

In `createMainWindow`:

```typescript
win.webContents.on('will-navigate', (e, url) => {
  if (!isAppOrigin(url)) e.preventDefault();
});
win.webContents.setWindowOpenHandler(({ url }) => {
  shell.openExternal(url);
  return { action: 'deny' };
});
```

Both should refuse anything that isn't the bundled `app://` / `file://`
renderer URL.
