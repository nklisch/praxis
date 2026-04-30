import { createRootRoute, createRoute, createRouter, Outlet } from "@tanstack/react-router";
import { Nav } from "./components/nav.js";
import styles from "./router.module.css";
import { ChatRoute } from "./routes/chat.js";
import { CourseDetailRoute } from "./routes/course-detail.js";
import { CourseMapRoute } from "./routes/course-map.js";
import { CoursesRoute } from "./routes/courses.js";
import { SettingsRoute } from "./routes/settings.js";

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

const routeTree = rootRoute.addChildren([
  chatRoute,
  settingsRoute,
  coursesRoute,
  courseDetailRoute,
  courseMapRoute,
]);

export const router = createRouter({ routeTree });

// Type-safe navigation registration.
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
