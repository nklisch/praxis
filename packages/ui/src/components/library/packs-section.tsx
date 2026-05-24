import type { PackSummaryClient } from "@praxis/core/types";
import { COPY } from "../../lib/copy.js";
import { LibrarySection } from "./library-section.js";
import styles from "./packs-section.module.css";

export interface PacksSectionProps {
  packs: ReadonlyArray<PackSummaryClient> | undefined;
  loading: boolean;
  /**
   * Called when the user clicks "Use this pack". The parent handles:
   * 1. `client.packs.import(packId)` to create the course
   * 2. `openSessionInTab` to open a teach tab on the new course
   */
  onUsePack: (packId: string) => void;
  /** Whether a pack import is in flight (optimistic disabled state). */
  importing?: string | null;
}

/**
 * Editorial listing of available knowledge packs.
 * Non-imported packs show a "Use this pack" CTA that creates a course directly.
 * Imported packs show an "Imported" badge — they're already in use via a course.
 */
export function PacksSection({ packs, loading, onUsePack, importing }: PacksSectionProps) {
  return (
    <LibrarySection<PackSummaryClient>
      ornament="¶"
      kicker="PACKS"
      loading={loading}
      items={packs}
      emptyMessage={COPY.empty.libraryPacksEmpty}
      renderItems={(items) => (
        <ol className={styles.list}>
          {items.map((pack) => {
            const isImporting = importing === pack.id;
            return (
              <li key={pack.id} className={styles.item}>
                <div className={styles.itemBody}>
                  <span className={styles.itemTitle}>{pack.name}</span>
                  <span className={styles.itemDeck}>
                    {pack.subject} · {pack.conceptCount} concepts
                  </span>
                </div>
                {pack.imported ? (
                  <span className={styles.badge}>Imported</span>
                ) : (
                  <button
                    type="button"
                    className={styles.cta}
                    disabled={isImporting}
                    onClick={() => onUsePack(pack.id)}
                  >
                    {isImporting ? "Importing…" : "Use this pack"}
                  </button>
                )}
              </li>
            );
          })}
        </ol>
      )}
    />
  );
}
