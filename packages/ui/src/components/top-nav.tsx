import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import styles from "./top-nav.module.css";

/**
 * App-shell running head — top horizontal nav per the locked "Index" design
 * (option-3.html). Renders: wordmark · five surface links · tabs slot ·
 * theme slot (at the far right edge).
 *
 * Five surface links and their typographic glyphs:
 *   § Library     → /
 *   ¶ Workspace   → /workspace
 *   ‡ Concept maps→ /concept-maps
 *   ‖ Progress    → /progress
 *   ⁂ Configure   → /configure
 *
 * Active state: accent hairline-underline on the active link.
 *
 * `tabsSlot` — content rendered between the surface nav and the right edge.
 *   Story 4 mounts `<TabStrip>` here as italic deck lines.
 * `themeSlot` — content rendered at the far right edge of the running head.
 *   Story 3 mounts `<ThemeToggle>` here.
 */
export interface TopNavProps {
  tabsSlot?: ReactNode;
  themeSlot?: ReactNode;
}

export function TopNav({ tabsSlot, themeSlot }: TopNavProps) {
  return (
    <header className={styles.runningHead}>
      <span className={styles.wordmark}>
        <em>Praxis</em>
      </span>
      <nav className={styles.nav} aria-label="Main navigation">
        <Link
          to="/"
          activeOptions={{ exact: true }}
          className={styles.link}
          activeProps={{ className: `${styles.link} ${styles.linkActive}` }}
        >
          <span className={styles.glyph} aria-hidden="true">
            §
          </span>
          Library
        </Link>
        <Link
          to="/workspace"
          activeOptions={{ exact: false }}
          className={styles.link}
          activeProps={{ className: `${styles.link} ${styles.linkActive}` }}
        >
          <span className={styles.glyph} aria-hidden="true">
            ¶
          </span>
          Workspace
        </Link>
        <Link
          to="/concept-maps"
          activeOptions={{ exact: false }}
          className={styles.link}
          activeProps={{ className: `${styles.link} ${styles.linkActive}` }}
        >
          <span className={styles.glyph} aria-hidden="true">
            ‡
          </span>
          Concept maps
        </Link>
        <Link
          to="/progress"
          activeOptions={{ exact: false }}
          className={styles.link}
          activeProps={{ className: `${styles.link} ${styles.linkActive}` }}
        >
          <span className={styles.glyph} aria-hidden="true">
            ‖
          </span>
          Progress
        </Link>
        <Link
          to="/configure"
          activeOptions={{ exact: false }}
          className={styles.link}
          activeProps={{ className: `${styles.link} ${styles.linkActive}` }}
        >
          <span className={styles.glyph} aria-hidden="true">
            ⁂
          </span>
          Configure
        </Link>
      </nav>
      {/* Tabs slot — TabStrip (Story 4) mounts here */}
      {tabsSlot !== undefined && <div className={styles.rightSlot}>{tabsSlot}</div>}
      {/* Theme slot — ThemeToggle mounts at the far right edge */}
      {themeSlot !== undefined && <div className={styles.themeSlot}>{themeSlot}</div>}
    </header>
  );
}
