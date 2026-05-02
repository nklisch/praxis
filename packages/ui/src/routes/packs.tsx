import type { PackSummaryClient } from "@praxis/core/types";
import { RouteHeader } from "../components/route-header.js";
import { getRouteMeta } from "../components/route-meta.js";
import { usePacks } from "../hooks/use-packs.js";
import { COPY } from "../lib/copy.js";
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
  const meta = getRouteMeta("packs");

  return (
    <div className={styles.layout}>
      <RouteHeader
        ornament={meta.ornament}
        kicker={meta.kicker}
        title={meta.title}
        deck={meta.deck}
      />

      {loading && <p className={styles.status}>{COPY.loading.default}</p>}
      {error && <p className={styles.error}>{error}</p>}

      {!loading && !error && packs.length === 0 && (
        <div className={styles.empty}>
          <p className={styles.emptyPrimary}>{COPY.empty.packs}</p>
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
