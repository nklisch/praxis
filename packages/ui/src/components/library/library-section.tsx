import type { JSX, ReactNode } from "react";
import { EmptyState } from "../empty-state.js";
import { LoadingState } from "../loading-state.js";
import styles from "./library-section.module.css";

export interface LibrarySectionProps<T> {
  /** Typographic ornament shown on the section header. */
  ornament: string;
  /** Uppercase mono kicker label. */
  kicker: string;
  /** Optional header-right action — e.g. "+ Add document". */
  headerAction?: ReactNode;
  loading: boolean;
  items: ReadonlyArray<T> | undefined;
  /** Editorial empty-state message. Use COPY.empty.* values. */
  emptyMessage: string;
  /** Optional empty-state action button. */
  emptyAction?: { label: string; onClick: () => void };
  /** Render the list of items. Receives the non-empty array. */
  renderItems: (items: ReadonlyArray<T>) => ReactNode;
}

/**
 * Polymorphic library section — ornament + kicker header, loading/empty/list
 * states. Each library section contributes its own `renderItems` for its
 * specific item shape; this component owns the envelope.
 */
export function LibrarySection<T>({
  ornament,
  kicker,
  headerAction,
  loading,
  items,
  emptyMessage,
  emptyAction,
  renderItems,
}: LibrarySectionProps<T>): JSX.Element {
  const isEmpty = !items || items.length === 0;

  return (
    <section className={styles.section}>
      <header className={styles.sectionHeader}>
        <span className={styles.ornament} aria-hidden="true">
          {ornament}
        </span>
        <span className={styles.kicker}>{kicker}</span>
        {headerAction && <span className={styles.headerAction}>{headerAction}</span>}
      </header>

      {loading ? (
        <LoadingState />
      ) : isEmpty ? (
        <EmptyState
          message={emptyMessage}
          {...(emptyAction !== undefined && { action: emptyAction })}
          compact
        />
      ) : (
        renderItems(items as ReadonlyArray<T>)
      )}
    </section>
  );
}
