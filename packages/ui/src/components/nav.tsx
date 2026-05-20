import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { usePraxisClient } from "../context/client-context.js";
import { LockIcon } from "./lock-icon.js";
import styles from "./nav.module.css";

/**
 * Due-count badge for the Workspace nav link.
 * Fetches dueCount on mount; refreshes on route change.
 * Failures are silent (badge simply omitted).
 */
function DueBadge() {
  const client = usePraxisClient();
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    client.flashcards
      .dueCount()
      .then((n) => {
        if (!cancelled) setCount(n);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [client]);

  if (count <= 0) return null;
  return <span className={styles.dueBadge}>{count > 99 ? "99+" : count}</span>;
}

/**
 * Top-nav IA:
 * Library (/) · Tutor (/chat) · Workspace · Configure · Settings
 *
 * App-chrome refresh: the "Chat" label was renamed to "Tutor" to reflect
 * the mode-aware tutoring surface (route path stays `/chat` so deep-links
 * keep working). The Praxis wordmark uses an editorial typographic
 * treatment — an ornament + italic display-serif title — to rhyme with
 * RouteHeader's masthead vocabulary. The bar itself adopts the editorial
 * token vocabulary (mono uppercase links + hairline-underline active state)
 * to align with the rest of the editorial design system.
 */
export function Nav() {
  return (
    <nav className={styles.nav} aria-label="Main navigation">
      <div className={styles.wordmark}>
        <span className={styles.wordmarkOrnament} aria-hidden="true">
          §
        </span>
        <span className={styles.wordmarkTitle}>Praxis</span>
      </div>
      <ul className={styles.links}>
        <li>
          <Link to="/" activeOptions={{ exact: true }} activeProps={{ className: styles.active }}>
            Library
          </Link>
        </li>
        <li>
          <Link
            to="/chat"
            activeOptions={{ exact: false }}
            activeProps={{ className: styles.active }}
          >
            Tutor
          </Link>
        </li>
        <li>
          <Link
            to="/workspace"
            activeOptions={{ exact: false }}
            activeProps={{ className: styles.active }}
            className={styles.workspaceLink}
          >
            Workspace
            <DueBadge />
          </Link>
        </li>
        <li>
          <Link to="/configure" activeProps={{ className: styles.active }}>
            Configure
          </Link>
        </li>
        <li>
          <Link to="/settings" activeProps={{ className: styles.active }}>
            Settings
          </Link>
        </li>
      </ul>
      <div className={styles.lockArea}>
        <LockIcon />
      </div>
    </nav>
  );
}
