# Pattern: Tab-Body Isolation via CSS Display

Multiple `<ChatTabBody>` instances mount simultaneously in the chat workspace. Inactive
tabs are hidden with CSS (`display: none`) rather than unmounted. This preserves each
tab's React state — message log, composer value, in-flight streams — across tab switches.

## Rationale

The chat workspace supports multiple concurrent sessions (teach, bootstrap, quiz, etc.)
in parallel tabs. If inactive tabs were unmounted and remounted, the student would lose
their in-progress message logs, and any background streams would abort. CSS hide keeps
everything alive. The trade-off: memory scales with open tabs, but the per-tab state
is small (~few MB) for realistic tab counts.

## Examples

### Example 1: The mounting pattern — chat.tsx

**File**: `packages/ui/src/routes/chat.tsx:98-106`

```tsx
{openTabs.map((t) => (
  <div
    key={t.id}
    style={{ display: t.id === activeTabId ? "contents" : "none" }}
    className={styles.tabBodyMount}
  >
    <ChatTabBody tab={t} />
  </div>
))}
{openTabs.length === 0 && !loading && (
  <EmptyState message={COPY.empty.tabs} action={{ ... }} />
)}
```

- Active tab wrapper: `display: contents` — the ChatTabBody's flex layout fills the
  workspace container without an extra block-stacking context.
- Inactive tab wrapper: `display: none` — hides the DOM subtree but keeps all React
  state and effects alive. Streams continue filling message logs in the background.
- The `key={t.id}` ensures React re-uses the same component instance when a tab becomes
  active again, rather than mounting fresh.

### Example 2: Per-tab state isolation — ChatTabBody

**File**: `packages/ui/src/components/chat-tab-body.tsx`

```tsx
export function ChatTabBody({ tab }: { tab: TabSummary }) {
  // Each tab instance has its own independent hook state:
  const { messages, isStreaming, lastError, send, clearMessages } = useStreamedSend(client);
  const [composerValue, setComposerValue] = useState("");
  const [pageImageTarget, setPageImageTarget] = useState(null);

  // Session is reconstructed from tab metadata — no session.start call here.
  // The session was created when the tab was opened (in NewTabPicker or openSessionInTab).
  const session: SessionHandle = {
    sessionId: tab.sessionId,
    modeId: tab.modeId,
    startedAt: tab.openedAt as Timestamp,
  };
  // ...
}
```

`useStreamedSend` is a `useState`-based hook — each call creates isolated state, so
switching tabs doesn't mix message logs between instances.

### Example 3: Tab strip manages which tab is visible

**File**: `packages/ui/src/components/tab-strip.tsx`

```tsx
// Each tab button just calls onSwitch — the shell updates activeTabId:
<button
  type="button"
  className={clsx(styles.tab, tab.id === activeTabId && styles.active)}
  style={{ "--mode-tint": getModeMeta(tab.modeId).tint } as CSSProperties}
  onClick={() => onSwitch(tab.id)}
>
  <span className={styles.ornament}>{getModeMeta(tab.modeId).ornament}</span>
  <span className={styles.title}>{tab.title}</span>
  <button className={styles.close} onClick={(e) => { e.stopPropagation(); onClose(tab.id); }}>
    ×
  </button>
</button>
```

`TabStrip` is purely presentational — it calls `onSwitch` and `onClose`; the `useTabs`
hook in the shell owns the state.

## When to Use

- Multi-session workspaces where each "tab" has non-trivial local state (message logs,
  form state, in-flight streams) that should survive tab switching
- Anywhere you need the "background tabs keep running" browser-tab semantic

## When NOT to Use

- Simple navigation patterns (Library, Settings) — those are separate routes; the shell
  unmounts and remounts correctly
- Phase 16 modality bodies — quiz/exam/homework/bootstrap each have their own tab body
  component (`QuizTabBody`, `ExamTabBody`, `HomeworkTabBody`, `BootstrapTabBody`) dispatched
  by `session.modeId` in `packages/ui/src/components/chat-tab-body.tsx`; the `display:none`
  pattern applies to the tab wrapper, not to switching modality bodies within a tab

## Common Violations

- Using React `key` to unmount/remount tab content — loses message log state; user
  returns to an empty conversation
- Putting per-tab state (composerValue, messages) in the chat shell (ChatRoute) rather
  than inside ChatTabBody — creates a single shared state that all tabs overwrite
- Forgetting `key={t.id}` on the wrapper div — React can't diff correctly and may
  reuse a stale instance
