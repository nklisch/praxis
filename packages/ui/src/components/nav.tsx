import { Link } from "@tanstack/react-router";
import { LockIcon } from "./lock-icon.js";
import styles from "./nav.module.css";

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
