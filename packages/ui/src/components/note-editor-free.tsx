import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./note-editor-free.module.css";

// ── Data model ────────────────────────────────────────────────────────────────

export interface FreeBody {
  kind: "free";
  text: string;
}

export interface NoteEditorFreeProps {
  body: FreeBody;
  onChange: (body: FreeBody) => void;
  /** Concept tags drifted in from the note's metadata or parsed from body. */
  conceptTags?: string[];
  /** Note title shown above the body. */
  title?: string;
  /** Called when title changes. */
  onTitleChange?: (title: string) => void;
}

// ── Slash-command registry ────────────────────────────────────────────────────

interface SlashCommand {
  trigger: string;
  label: string;
  description: string;
}

const SLASH_COMMANDS: SlashCommand[] = [
  { trigger: "/heading", label: "Heading", description: "Section heading" },
  { trigger: "/subheading", label: "Subheading", description: "Sub-section" },
  { trigger: "/quote", label: "Quote", description: "Block quotation" },
  { trigger: "/list", label: "List", description: "Bullet list item" },
  { trigger: "/divider", label: "Divider", description: "Horizontal rule" },
  { trigger: "/callout", label: "Callout", description: "Highlighted note" },
];

// Prefix inserted for each command trigger.
const SLASH_PREFIX: Record<string, string> = {
  "/heading": "# ",
  "/subheading": "## ",
  "/quote": "> ",
  "/list": "- ",
  "/divider": "---",
  "/callout": "> ⚑ ",
};

// ── Word-count utilities ──────────────────────────────────────────────────────

function wordCount(text: string): number {
  return text.trim() === "" ? 0 : text.trim().split(/\s+/).length;
}

function readTimeMinutes(words: number): number {
  return Math.max(1, Math.round(words / 200));
}

// ── Slash-context detection ───────────────────────────────────────────────────

/**
 * Given the text of the current line (from line start to caret), return the
 * filtered command list if the line starts with `/`, or null otherwise.
 */
function detectSlashContext(lineText: string): SlashCommand[] | null {
  if (!lineText.startsWith("/")) return null;
  const q = lineText.toLowerCase();
  const matched = SLASH_COMMANDS.filter((c) => q === "/" || c.trigger.startsWith(q));
  return matched.length > 0 ? matched : null;
}

// ── HTML escape helper ────────────────────────────────────────────────────────

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Component ─────────────────────────────────────────────────────────────────

/**
 * Free note editor — minimal-chrome typewriter page per the locked mock at
 * `.mockups/screens/epic-ui-redesign-ground-up-workspace/note-free-editor.html`.
 *
 * Layout:
 *   - Centered page (max 720px) with generous vertical padding.
 *   - Full-bleed italic serif title input.
 *   - Body: contenteditable div; first paragraph gets a drop-cap via CSS `::first-letter`.
 *   - Slash-command menu: type `/` at a line start to get inline-structure commands.
 *   - Fixed right gutter (220px): word count + read time + drifted concept tags.
 *
 * Slash commands insert prefixed Markdown-like text (headings, quotes, lists, etc.)
 * into the contenteditable. The body is stored as plain text via `textContent`.
 *
 * Contenteditable is used (same pattern as the outline editor) so CSS `::first-letter`
 * can target the first `<p>` child for the drop-cap.
 */
export function NoteEditorFree({
  body,
  onChange,
  conceptTags = [],
  title = "",
  onTitleChange,
}: NoteEditorFreeProps) {
  const [localTitle, setLocalTitle] = useState(title);
  const [slashCommands, setSlashCommands] = useState<SlashCommand[] | null>(null);
  const [slashIdx, setSlashIdx] = useState(0);

  const editorRef = useRef<HTMLDivElement>(null);

  // ── Seed initial body into contenteditable ──────────────────────────────

  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;
    const el = editorRef.current;
    if (!el) return;
    if (body.text) {
      const paras = body.text
        .split(/\n\n+/)
        .map((p) => p.trim())
        .filter(Boolean);
      if (paras.length > 0) {
        el.innerHTML = paras.map((p) => `<p>${escapeHtml(p)}</p>`).join("");
      } else {
        el.innerHTML = "<p><br></p>";
      }
    } else {
      el.innerHTML = "<p><br></p>";
    }
  }, [body.text]);

  // ── Derived stats ──────────────────────────────────────────────────────

  const [statsText, setStatsText] = useState(body.text);
  const words = wordCount(statsText);
  const readTime = readTimeMinutes(words);

  // ── Get plain text from contenteditable ───────────────────────────────

  const getPlainText = useCallback((): string => editorRef.current?.textContent ?? "", []);

  // ── Input handler ──────────────────────────────────────────────────────

  const handleInput = useCallback(() => {
    const text = getPlainText();
    setStatsText(text);
    onChange({ kind: "free", text });

    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      setSlashCommands(null);
      return;
    }
    const range = sel.getRangeAt(0);
    const container = range.startContainer;
    const nodeText =
      container.nodeType === Node.TEXT_NODE
        ? (container.textContent ?? "")
        : ((container as HTMLElement).textContent ?? "");
    const caretOffset = range.startOffset;
    const textBeforeCaret = nodeText.slice(0, caretOffset);
    const lineText = textBeforeCaret.split("\n").pop() ?? textBeforeCaret;

    const matched = detectSlashContext(lineText);
    setSlashCommands(matched);
    setSlashIdx(0);
  }, [onChange, getPlainText]);

  // ── Apply a slash command ──────────────────────────────────────────────

  const applySlashCommand = useCallback(
    (cmd: SlashCommand) => {
      const el = editorRef.current;
      if (!el) return;

      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) {
        setSlashCommands(null);
        return;
      }

      const range = sel.getRangeAt(0);
      // Walk up to find the <p> that is a direct child of the editor.
      let node: Node | null = range.startContainer;
      while (node && node.parentElement !== el) {
        node = node.parentNode;
      }
      if (!node) {
        setSlashCommands(null);
        return;
      }

      const prefix = SLASH_PREFIX[cmd.trigger] ?? "";
      const pEl = node as HTMLElement;
      const rawText = pEl.textContent ?? "";
      const spaceIdx = rawText.indexOf(" ");
      const slashEnd = spaceIdx === -1 ? rawText.length : spaceIdx;
      const rest = rawText.slice(slashEnd).trimStart();
      const newText = cmd.trigger === "/divider" ? "---" : prefix + rest;
      pEl.textContent = newText;

      // Move caret to end of the paragraph.
      const newRange = document.createRange();
      const textNode = pEl.firstChild;
      if (textNode && textNode.nodeType === Node.TEXT_NODE) {
        newRange.setStart(textNode, textNode.textContent?.length ?? 0);
        newRange.collapse(true);
        sel.removeAllRanges();
        sel.addRange(newRange);
      }

      setSlashCommands(null);
      const text = getPlainText();
      setStatsText(text);
      onChange({ kind: "free", text });
    },
    [onChange, getPlainText],
  );

  // ── Keyboard handler for slash-menu navigation ─────────────────────────

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (!slashCommands || slashCommands.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashIdx((i) => Math.min(i + 1, slashCommands.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashIdx((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        const cmd = slashCommands[slashIdx];
        if (cmd) applySlashCommand(cmd);
      } else if (e.key === "Escape") {
        e.preventDefault();
        setSlashCommands(null);
      }
    },
    [slashCommands, slashIdx, applySlashCommand],
  );

  // ── Title change ───────────────────────────────────────────────────────

  const handleTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setLocalTitle(e.target.value);
      onTitleChange?.(e.target.value);
    },
    [onTitleChange],
  );

  // ── Dismiss slash menu on blur ─────────────────────────────────────────

  const handleBlur = useCallback(() => {
    // Delay so mousedown on a menu item fires before blur dismissal.
    setTimeout(() => setSlashCommands(null), 150);
  }, []);

  return (
    <div className={styles.shell}>
      {/* ── Typewriter page ───────────────────────────────────────── */}
      <div className={styles.page}>
        {/* Title input */}
        <div className={styles.titleArea}>
          <input
            className={styles.titleInput}
            value={localTitle}
            onChange={handleTitleChange}
            placeholder="Untitled…"
            aria-label="Note title"
          />
        </div>

        {/* Body (contenteditable) + slash-menu */}
        <div className={styles.bodyWrapper}>
          {slashCommands && slashCommands.length > 0 && (
            <div className={styles.slashMenu} role="listbox" aria-label="Slash commands">
              {slashCommands.map((cmd, i) => (
                <div
                  key={cmd.trigger}
                  className={`${styles.slashItem} ${i === slashIdx ? styles.slashItemActive : ""}`}
                  role="option"
                  aria-selected={i === slashIdx}
                  // tabIndex so focusable-interactive a11y is satisfied; focus management
                  // is handled via the parent contenteditable keyboard handler.
                  tabIndex={-1}
                  onMouseDown={(e) => {
                    // Prevent blur before we apply.
                    e.preventDefault();
                    applySlashCommand(cmd);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") applySlashCommand(cmd);
                  }}
                >
                  <span className={styles.slashLabel}>{cmd.label}</span>
                  <span className={styles.slashDesc}>{cmd.description}</span>
                </div>
              ))}
            </div>
          )}

          {/* biome-ignore lint/a11y/useSemanticElements: contenteditable div requires role="textbox" for accessible querying; <textarea> doesn't support rich HTML children needed for the drop-cap paragraph structure. */}
          <div
            ref={editorRef}
            className={styles.bodyEditor}
            contentEditable
            suppressContentEditableWarning
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            role="textbox"
            aria-multiline="true"
            aria-label="Note body"
            tabIndex={0}
            data-placeholder="Begin writing…"
          />
        </div>
      </div>

      {/* ── Right gutter ──────────────────────────────────────────── */}
      <aside className={styles.gutter} aria-label="Note statistics">
        {/* Stats panel */}
        <div className={styles.gutterPanel}>
          <h3 className={styles.gutterHeading}>This note</h3>
          <div className={styles.stat}>
            <span className={styles.statLabel}>words</span>
            <span className={styles.statVal} data-testid="word-count">
              {words}
            </span>
          </div>
          <div className={styles.stat}>
            <span className={styles.statLabel}>read time</span>
            <span className={styles.statVal} data-testid="read-time">
              ~{readTime} min
            </span>
          </div>
        </div>

        {/* Concept tags panel */}
        {conceptTags.length > 0 && (
          <div className={styles.gutterPanel}>
            <h3 className={styles.gutterHeading}>Concepts drifted in</h3>
            <div className={styles.tagCloud} data-testid="concept-tags">
              {conceptTags.map((tag) => (
                <span key={tag} className={styles.tag}>
                  <em>{tag}</em>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Slash-command hint */}
        <div className={`${styles.gutterPanel} ${styles.gutterHint}`}>
          <h3 className={styles.gutterHeadingAccent}>⌘ /</h3>
          <p className={styles.gutterHintText}>
            type <kbd className={styles.kbd}>/</kbd> in the body for headings, lists, quotes,
            callouts
          </p>
        </div>
      </aside>
    </div>
  );
}
