import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
} from "@tanstack/react-router";
import { ActivityRail } from "./components/activity-rail.js";
import { Nav } from "./components/nav.js";
import styles from "./router.module.css";
import { ChatRoute } from "./routes/chat.js";
import { ConfigureRoute } from "./routes/configure.js";
import { ConceptMapEditorRoute } from "./routes/concept-map-editor.js";
import { ConceptMapsListRoute } from "./routes/concept-maps-list.js";
import { CourseDetailRoute } from "./routes/course-detail.js";
import { CourseMapRoute } from "./routes/course-map.js";
import { LibraryRoute } from "./routes/library.js";
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
      <ActivityRail />
    </div>
  ),
});

// Phase 14: Library is the front door at both "/" and "/library".
const libraryRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: LibraryRoute,
});

const libraryAliasRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/library",
  component: LibraryRoute,
});

// Phase 14: /chat and /chat/$tabId routes. Both render ChatRoute (the
// shell handles both bare /chat and /chat/$tabId internally).
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

// Phase 14: /courses and /packs are permanent redirects to /library.
// TanStack Router matches more-specific routes first, so /courses/$courseId
// and /courses/$courseId/map are NOT caught by this redirect.
const coursesRedirect = createRoute({
  getParentRoute: () => rootRoute,
  path: "/courses",
  beforeLoad: () => {
    throw redirect({ to: "/library" });
  },
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

// Phase 15b: concept-maps routes. More-specific /concept-maps/$conceptMapId
// is listed before /concept-maps so TanStack Router matches it first.
const conceptMapsListRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/courses/$courseId/concept-maps",
  component: ConceptMapsListRoute,
});

const conceptMapEditorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/courses/$courseId/concept-maps/$conceptMapId",
  component: ConceptMapEditorRoute,
});

const packsRedirect = createRoute({
  getParentRoute: () => rootRoute,
  path: "/packs",
  beforeLoad: () => {
    throw redirect({ to: "/library" });
  },
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
  libraryRoute,
  libraryAliasRoute,
  chatWorkspaceRoute,
  chatTabRoute,
  settingsRoute,
  coursesRedirect,
  courseDetailRoute,
  courseMapRoute,
  conceptMapsListRoute,
  conceptMapEditorRoute,
  packsRedirect,
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
