import {
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  redirect,
  useNavigate,
} from "@tanstack/react-router";
import { z } from "zod";
import { OnboardingFlow } from "./components/onboarding-flow.js";
import { StatusStrip } from "./components/status-strip.js";
import { TabStrip } from "./components/tab-strip.js";
import { ThemeToggle } from "./components/theme-toggle.js";
import { TopNav } from "./components/top-nav.js";
import { UpdateBanner } from "./components/update-banner.js";
import { useFirstRun } from "./hooks/use-first-run.js";
import { useTabs } from "./hooks/use-tabs.js";
import styles from "./router.module.css";
import { ChatRoute } from "./routes/chat.js";
import { ConceptMapEditorRoute } from "./routes/concept-map-editor.js";
import { ConceptMapsRoute } from "./routes/concept-maps.js";
import { ConceptMapsListRoute } from "./routes/concept-maps-list.js";
import { ConfigureRoute } from "./routes/configure.js";
import { CourseConceptsListRoute } from "./routes/course-concepts-list.js";
import { CourseCreateRoute } from "./routes/course-create.js";
import { CourseDetailRoute } from "./routes/course-detail.js";
import { CourseMapRoute } from "./routes/course-map.js";
import { LibraryRoute } from "./routes/library.js";
import { ProgressRoute } from "./routes/progress.js";
import { SettingsRoute } from "./routes/settings.js";
import { NoteEditorPage } from "./routes/workspace/note-editor-page.js";
import { WorkspaceRoute } from "./routes/workspace.js";

function RootLayout() {
  const { loading, isFirstRun, complete } = useFirstRun();
  const { openTabs, activeTabId, closeTab, switchTo } = useTabs();
  const navigate = useNavigate();

  if (loading) return null;

  if (isFirstRun) {
    return (
      <div className={styles.onboardingLayout}>
        <OnboardingFlow onComplete={complete} />
      </div>
    );
  }

  return (
    <div className={styles.layout}>
      <UpdateBanner />
      <TopNav
        tabsSlot={
          <TabStrip
            tabs={openTabs}
            activeTabId={activeTabId}
            onSwitch={switchTo}
            onClose={closeTab}
            onNew={() => {
              void navigate({ to: "/chat" });
            }}
          />
        }
        themeSlot={<ThemeToggle />}
      />
      <StatusStrip />
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}

const rootRoute = createRootRoute({
  component: RootLayout,
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

const courseConceptsListRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/courses/$courseId/concepts",
  component: CourseConceptsListRoute,
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

// Course-create entry flow — step 2: upload/material screen.
// Library "Create a course" CTA navigates here before opening a course-create session.
// ?pack=<packId> pre-selects the Pack tab and pre-attaches that pack as source on mount.
const courseCreateRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/course-create",
  component: CourseCreateRoute,
  validateSearch: z.object({
    pack: z.string().optional(),
  }),
});

// Top-nav surface stubs — full implementations land in subsequent surface stories.
const conceptMapsSurfaceRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/concept-maps",
  component: ConceptMapsRoute,
});

const progressRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/progress",
  component: ProgressRoute,
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
  courseConceptsListRoute,
  conceptMapsListRoute,
  conceptMapEditorRoute,
  packsRedirect,
  configureRoute,
  workspaceRoute,
  noteEditorRoute,
  courseCreateRoute,
  conceptMapsSurfaceRoute,
  progressRoute,
]);

export const router = createRouter({ routeTree });

// Type-safe navigation registration.
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
