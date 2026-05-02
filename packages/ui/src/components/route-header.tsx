import type { CSSProperties, JSX, ReactNode } from "react";
import styles from "./route-header.module.css";

export interface RouteHeaderProps {
  /** The route's typographic ornament — see ROUTE_META for the convention. */
  ornament: string;
  /** Tiny uppercase mono kicker — e.g. "COURSES", "SETTINGS". */
  kicker: string;
  /** Italic display title — e.g. "courses", "settings". */
  title: string;
  /** Optional italic deck line beneath the title. */
  deck?: string;
  /** Optional right-aligned actions (buttons, links). */
  actions?: ReactNode;
  /**
   * Optional tint override. Defaults to `--tint-route` (graphite neutral).
   * Mode tints are reserved for `<ModeHeader />` inside active session tab
   * bodies — do not pass a mode tint here even if a route is "about" a mode.
   */
  tint?: string;
}

export function RouteHeader({
  ornament,
  kicker,
  title,
  deck,
  actions,
  tint,
}: RouteHeaderProps): JSX.Element {
  const style = tint ? ({ "--tint-route": tint } as CSSProperties) : undefined;

  return (
    <header className={styles.header} style={style}>
      <span className={styles.ornament} aria-hidden="true">
        {ornament}
      </span>

      <span className={styles.kicker}>
        <span className={styles.kickerDot} aria-hidden="true" />
        {kicker}
      </span>

      <div className={styles.titleRow}>
        <span className={styles.title}>{title}</span>
        {deck && (
          <span className={styles.deck}>
            <span className={styles.deckDash} aria-hidden="true">
              —
            </span>
            {deck}
          </span>
        )}
      </div>

      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  );
}
