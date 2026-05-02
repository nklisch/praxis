import { createRootRoute, createRoute, createRouter, Outlet } from "@tanstack/react-router";
import { Nav } from "./components/nav.js";
import styles from "./router.module.css";
import { ChatRoute } from "./routes/chat.js";
import { ConfigureRoute } from "./routes/configure.js";
import { CourseDetailRoute } from "./routes/course-detail.js";
import { CourseMapRoute } from "./routes/course-map.js";
import { CoursesRoute } from "./routes/courses.js";
import { PacksRoute } from "./routes/packs.js";
import { SettingsRoute } from "./routes/settings.js";
import { NoteEditorPage } from "./routes/workspace/note-editor-page.js";
import { WorkspaceRoute } from "./routes/workspace.js";

const rootRoute = createRootRoute({
  component: () => (
    <div className={styles.layout}>
      <Nav />
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  ),
});

const chatRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: ChatRoute,
});

// Phase 14: /chat and /chat/$tabId routes. Both render ChatRoute (the
// shell handles both bare /chat and /chat/$tabId internally).
// / still points to ChatRoute for now — Agent 3 swaps it to Library.
const chatWorkspaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/chat",
  component: ChatRoute,
});

const chatTabRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/chat/$tabId",
  component: ChatRoute,
});

const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsRoute,
});

const coursesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/courses",
  component: CoursesRoute,
});

const courseDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/courses/$courseId",
  component: CourseDetailRoute,
});

const courseMapRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/courses/$courseId/map",
  component: CourseMapRoute,
});

const packsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/packs",
  component: PacksRoute,
});

const configureRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/configure",
  component: ConfigureRoute,
});

const workspaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/workspace",
  component: WorkspaceRoute,
});

const noteEditorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/workspace/notes/$noteId",
  component: NoteEditorPage,
});

const routeTree = rootRoute.addChildren([
  chatRoute,
  chatWorkspaceRoute,
  chatTabRoute,
  settingsRoute,
  coursesRoute,
  courseDetailRoute,
  courseMapRoute,
  packsRoute,
  configureRoute,
  workspaceRoute,
  noteEditorRoute,
]);

export const router = createRouter({ routeTree });

// Type-safe navigation registration.
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
