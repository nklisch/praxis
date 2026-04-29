import { Link } from "@tanstack/react-router";
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
          <Link to="/settings" activeProps={{ className: styles.active }}>
            Settings
          </Link>
        </li>
      </ul>
    </nav>
  );
}
