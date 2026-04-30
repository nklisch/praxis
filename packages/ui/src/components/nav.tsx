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

export function Nav() {
  return (
    <nav className={styles.nav}>
      <div className={styles.logo}>Praxis</div>
      <ul className={styles.links}>
        <li>
          <Link to="/" activeProps={{ className: styles.active }}>
            Chat
          </Link>
        </li>
        <li>
          <Link
            to="/courses"
            activeOptions={{ exact: false }}
            activeProps={{ className: styles.active }}
          >
            Courses
          </Link>
        </li>
        <li>
          <Link to="/packs" activeProps={{ className: styles.active }}>
            Packs
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
