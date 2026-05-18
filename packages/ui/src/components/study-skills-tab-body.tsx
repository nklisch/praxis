/**
 * StudySkillsTabBody — redesign.
 *
 * Layout: two-column grid (matches mode-study-skills.html mock).
 *   - Center (flex-1): sticky head · metacognitive prompt banner ·
 *     structured chat turns (coach/student) · composer at bottom
 *   - Right rail (300px): active-technique card · observed-patterns
 *     section · review-queue section
 *
 * The center column renders the full session surface via TeachChatTabBody
 * (message log + composer) wrapped under the mode head and the metacognitive
 * prompt card. The rail is read-only data from memory.procedural(),
 * memory.affective(), and flashcards.list({ due: true }).
 *
 * Follows the tab-body-isolation pattern: mounts and stays mounted while the
 * tab is open; visibility (display:none) is managed by the parent ChatRoute.
 */
import type {
  AffectiveModel,
  Flashcard,
  ProceduralModel,
  SessionTabSummary,
} from "@praxis/core/types";
import type { JSX } from "react";
import { useCallback } from "react";
import { usePraxisClient } from "../context/client-context.js";
import { useResource } from "../hooks/use-resource.js";
import { TeachChatTabBody } from "./chat-tab-body.js";
import styles from "./study-skills-tab-body.module.css";

export interface StudySkillsTabBodyProps {
  tab: SessionTabSummary;
}

/**
 * Study-skills mode tab body.
 *
 * Two-column layout: chat surface (center) + technique/patterns/queue
 * rail (right 300px). The center surface is the full teach-mode chat
 * experience — structured by the pedagogy-pack coach, not improvised
 * chat. The rail surfaces ambient context without interrupting the arc.
 */
export function StudySkillsTabBody({ tab }: StudySkillsTabBodyProps): JSX.Element {
  return (
    <div className={styles.container}>
      <StudySkillsHead tab={tab} />
      <div className={styles.surface}>
        {/* Center: full chat surface (messages + composer) */}
        <main className={styles.main} aria-label="Study skills session">
          <MetaPromptBanner />
          <TeachChatTabBody tab={tab} />
        </main>

        {/* Right rail: technique + patterns + queue */}
        <StudySkillsRail />
      </div>
    </div>
  );
}

// ── Head ─────────────────────────────────────────────────────────────────────

interface StudySkillsHeadProps {
  tab: SessionTabSummary;
}

function StudySkillsHead({ tab }: StudySkillsHeadProps): JSX.Element {
  return (
    <header className={styles.head}>
      <div className={styles.kicker}>
        <span className={styles.kickerDot} aria-hidden="true" />
        <span className={styles.kickerGlyph} aria-hidden="true">
          ‖
        </span>
        <span className={styles.kickerMode}>study skills</span>
        {tab.title && (
          <>
            <span className={styles.kickerSep}>·</span>
            <span className={styles.kickerTitle}>{tab.title}</span>
          </>
        )}
      </div>
    </header>
  );
}

// ── Metacognitive prompt banner ───────────────────────────────────────────────

/**
 * A static prompt banner rendered above the message log.
 * In production this could be driven by the active pedagogy-pack
 * metacognitive prompt for the current trigger; for now it renders a
 * representative prompt so the surface reads correctly.
 *
 * The banner is intentionally a non-interactive display — the coach
 * surfaces it in the chat arc; this is a visual echo of the prompt
 * that is currently active.
 */
function MetaPromptBanner(): JSX.Element {
  return (
    <div className={styles.metaPrompt} role="note" aria-label="Active metacognitive prompt">
      <div className={styles.metaPromptLabel}>⁂ metacognitive prompt</div>
      <div className={styles.metaPromptText}>
        <em>Notice the pattern</em> — pick one thing that landed this week and one thing that
        didn&apos;t.
      </div>
      <div className={styles.metaPromptCitation}>
        — pattern-recognition prompt · pedagogy pack · Schraw 2006
      </div>
    </div>
  );
}

// ── Right rail ────────────────────────────────────────────────────────────────

/**
 * Right rail with three sections:
 *   1. Active technique card
 *   2. Observed patterns (procedural + affective)
 *   3. Review queue (due flashcards)
 */
function StudySkillsRail(): JSX.Element {
  const client = usePraxisClient();

  const proceduralLoader = useCallback(() => client.memory.procedural(), [client]);
  const affectiveLoader = useCallback(() => client.memory.affective(), [client]);
  const flashcardsLoader = useCallback(() => client.flashcards.list({ due: true }), [client]);

  const { data: procedural } = useResource(proceduralLoader);
  const { data: affective } = useResource(affectiveLoader);
  const { data: dueCards } = useResource(flashcardsLoader);

  return (
    <aside
      className={styles.rail}
      aria-label="Study skills context"
      data-testid="study-skills-rail"
    >
      <ActiveTechniqueSection />
      <ObservedPatternsSection procedural={procedural} affective={affective} />
      <ReviewQueueSection dueCards={dueCards ?? []} />
    </aside>
  );
}

// ── Active technique section ──────────────────────────────────────────────────

function ActiveTechniqueSection(): JSX.Element {
  return (
    <div className={styles.techniqueCard} data-testid="active-technique">
      <div className={styles.techniqueLabel}>⁂ active technique</div>
      <div className={styles.techniqueName}>
        <em>Pattern reflection</em>
      </div>
      <div className={styles.techniqueDesc}>
        Identify what&apos;s working in your own learning, name it explicitly, decide whether to
        lean in or change. Habit-forming, not skill-forming.
      </div>
    </div>
  );
}

// ── Observed patterns section ─────────────────────────────────────────────────

interface ObservedPatternsSectionProps {
  procedural: ProceduralModel | undefined;
  affective: AffectiveModel | undefined;
}

function ObservedPatternsSection({
  procedural,
  affective,
}: ObservedPatternsSectionProps): JSX.Element {
  // Build pattern cards from the procedural model — strategies with positive
  // preference (preference > 0) are "working for you" signals.
  const proceduralPatterns = procedural
    ? Array.from(procedural.strategies.values())
        .filter((s) => s.evidenceCount > 0)
        .sort((a, b) => b.preference - a.preference)
        .slice(0, 3)
    : [];

  // Affective patterns: engagement > 0.6 → engaged; frustration > 0.5 → alert.
  const hasAffective = !!affective?.recent.length;
  const recentEngagement =
    affective?.recent.slice(-3).reduce((sum, s) => sum + s.engagement, 0) ?? 0;
  const avgEngagement =
    affective && affective.recent.length > 0
      ? recentEngagement / Math.min(3, affective.recent.length)
      : null;

  return (
    <section aria-label="Observed patterns" data-testid="observed-patterns">
      <h3 className={styles.railHead}>Patterns observed</h3>

      {proceduralPatterns.length === 0 && !hasAffective && (
        <p className={styles.railEmpty}>
          <em>No patterns yet.</em> Patterns surface after a few sessions.
        </p>
      )}

      {proceduralPatterns.map((strategy) => (
        <div key={strategy.strategyId} className={styles.patternCard}>
          <div className={styles.patternCardLabel}>procedural memory</div>
          <em>{strategy.strategyId}</em>
          {strategy.evidenceCount > 0 && (
            <>
              {" "}
              · used {strategy.evidenceCount}×{" "}
              {strategy.preference > 0.1 ? "· high mastery delta" : "· medium mastery delta"}
            </>
          )}
        </div>
      ))}

      {hasAffective && avgEngagement !== null && (
        <div className={styles.patternCard}>
          <div className={styles.patternCardLabel}>affective</div>
          {avgEngagement >= 0.6 ? (
            <>
              Most engaged on <em>recent sessions</em> · engagement sustained above baseline
            </>
          ) : avgEngagement < 0.4 ? (
            <>
              <em>Engagement dip</em> detected in recent sessions · consider changing technique
            </>
          ) : (
            <>Steady engagement in recent sessions · baseline holding</>
          )}
        </div>
      )}
    </section>
  );
}

// ── Review queue section ──────────────────────────────────────────────────────

interface ReviewQueueSectionProps {
  dueCards: Flashcard[];
}

function ReviewQueueSection({ dueCards }: ReviewQueueSectionProps): JSX.Element {
  // Group due cards by conceptId for a compact view (max 3 groups shown).
  const grouped = groupByConceptId(dueCards);
  const visibleGroups = grouped.slice(0, 3);
  const remainingCount = Math.max(0, grouped.length - 3);

  return (
    <section aria-label="Review queue" data-testid="review-queue" style={{ marginTop: "18px" }}>
      <h3 className={styles.railHead}>Coming up</h3>
      <div className={styles.reviewQueue}>
        <h4 className={styles.reviewQueueHead}>‖ next review</h4>

        {dueCards.length === 0 ? (
          <p className={styles.reviewQueueEmpty}>No cards due — you&apos;re up to date.</p>
        ) : (
          <>
            {visibleGroups.map(({ conceptId, cards }) => (
              <div key={conceptId} className={styles.reviewRow}>
                <em>{conceptId || "general"}</em> · {cards.length}{" "}
                {cards.length === 1 ? "card" : "cards"}
                <span className={styles.reviewWhen}>due</span>
              </div>
            ))}
            {remainingCount > 0 && (
              <div className={styles.reviewRow}>
                <em>+{remainingCount} more</em>
              </div>
            )}
          </>
        )}

        <button type="button" className={styles.reviewPlanBtn}>
          plan a session →
        </button>
      </div>
    </section>
  );
}

// ── Helper ────────────────────────────────────────────────────────────────────

interface ConceptGroup {
  conceptId: string;
  cards: Flashcard[];
}

function groupByConceptId(cards: Flashcard[]): ConceptGroup[] {
  const map = new Map<string, Flashcard[]>();
  for (const card of cards) {
    const key = card.conceptId ?? "";
    const group = map.get(key);
    if (group) {
      group.push(card);
    } else {
      map.set(key, [card]);
    }
  }
  return Array.from(map.entries()).map(([conceptId, cs]) => ({ conceptId, cards: cs }));
}
