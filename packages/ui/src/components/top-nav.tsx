import { Link } from "@tanstack/react-router";
import styles from "./top-nav.module.css";

/**
 * App-shell running head — top horizontal nav per the locked "Index" design
 * (option-3.html). Renders: wordmark · five surface links · right slot (tabs
 * strip + theme toggle are mounted by sibling stories).
 *
 * Five surface links and their typographic glyphs:
 *   § Library     → /
 *   ¶ Workspace   → /workspace
 *   ‡ Concept maps→ /concept-maps
 *   ‖ Progress    → /progress
 *   ⁂ Configure   → /configure
 *
 * Active state: accent hairline-underline on the active link.
 */
export function TopNav() {
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
      {/* Right slot — tabs strip (Story 4) + theme toggle (Story 3) mount here */}
      <div className={styles.rightSlot} />
    </header>
  );
}
