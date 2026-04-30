import type { PackSummaryClient } from "@praxis/core/types";
import { usePacks } from "../hooks/use-packs.js";
import styles from "./packs.module.css";

/**
 * /packs route — Knowledge Packs browser.
 *
 * Lists all available packs from the packs directory. Each pack shows
 * its name, version, subject, grade level, and concept/edge count.
 * Imported packs display an "Imported" badge; un-imported packs show an
 * "Import" button.
 *
 * Phase 11 note: this same list will gain an "Edit" action when configure
 * mode lands. The component stays read-only for now.
 */
export function PacksRoute() {
  const { packs, loading, error, importing, importPack } = usePacks();

  return (
    <div className={styles.layout}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Knowledge Packs</h1>
          <p className={styles.subtitle}>
            Curated concept graphs for specific subjects. Import a pack to use it in a new course.
          </p>
        </div>
      </header>

      {loading && <p className={styles.status}>Loading packs…</p>}
      {error && <p className={styles.error}>{error}</p>}

      {!loading && !error && packs.length === 0 && (
        <div className={styles.empty}>
          <p className={styles.emptyPrimary}>No packs available.</p>
          <p className={styles.emptyHint}>
            Pack JSON files go in the <code>packages/curriculum/packs/</code> directory.
          </p>
        </div>
      )}

      {packs.length > 0 && (
        <ul className={styles.list}>
          {packs.map((pack) => (
            <PackCard
              key={`${pack.id}@${pack.version}`}
              pack={pack}
              importing={importing === pack.id}
              onImport={() => importPack(pack.id)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

// ── PackCard ──────────────────────────────────────────────────────────────────

interface PackCardProps {
  pack: PackSummaryClient;
  importing: boolean;
  onImport: () => void;
}

function PackCard({ pack, importing, onImport }: PackCardProps) {
  return (
    <li className={styles.card}>
      <div className={styles.cardMain}>
        <div className={styles.cardHeader}>
          <span className={styles.packName}>{pack.name}</span>
          <span className={styles.packVersion}>v{pack.version}</span>
          {pack.imported && <span className={styles.importedBadge}>Imported</span>}
        </div>
        <div className={styles.cardMeta}>
          <span className={styles.metaItem}>{pack.subject}</span>
          <span className={styles.metaSep}>·</span>
          <span className={styles.metaItem}>Grade {pack.gradeLevel}</span>
          <span className={styles.metaSep}>·</span>
          <span className={styles.metaItem}>{pack.conceptCount} concepts</span>
          {pack.edgeCount > 0 && (
            <>
              <span className={styles.metaSep}>·</span>
              <span className={styles.metaItem}>{pack.edgeCount} edges</span>
            </>
          )}
        </div>
      </div>

      <div className={styles.cardActions}>
        {!pack.imported && (
          <button
            type="button"
            className={styles.importBtn}
            disabled={importing}
            onClick={onImport}
            aria-label={importing ? `Importing ${pack.name}` : `Import ${pack.name}`}
          >
            {importing ? "Importing…" : "Import"}
          </button>
        )}
      </div>
    </li>
  );
}
