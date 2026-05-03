# Pattern: Session + Tab Open Flow

Starting a new session in the desktop app is always a three-step sequence:
`session.start` → `tabs.open` → `navigate`. The `openSessionInTab` helper centralizes
this so no call site implements the steps out of order.

## Rationale

With the multi-session tab model (Phase 14), opening a session requires:
1. Creating the session row on the server (`session.start`)
2. Creating a tab bound to that session (`tabs.open`) — this also updates the renderer's
   `useTabs` hook state so the tab appears in the strip immediately
3. Navigating the browser to `/chat/$tabId` so the workspace shell focuses the new tab

Doing only 1 and 3 (no `tabs.open`) leaves the session orphaned — no tab row, no strip
entry, no message log. Doing 1 and 2 but not 3 leaves the tab open but the workspace
still showing the previous tab. The helper enforces all three steps.

## Examples

### Example 1: openSessionInTab helper

**File**: `packages/ui/src/lib/open-session-in-tab.ts`

```typescript
export async function openSessionInTab(opts: {
  client: PraxisClient;
  navigate: NavigateFn;
  startOpts: { modeId: string; courseId?: CourseId; assignmentId?: AssignmentId };
  courseTitle?: string;
  openTab: (input: { sessionId: SessionId; courseTitle?: string }) => Promise<TabSummary>;
}): Promise<TabId> {
  // 1. Create the session
  const handle = await opts.client.session.start(opts.startOpts);
  // 2. Open a tab bound to it (updates useTabs hook state)
  const tab = await opts.openTab({
    sessionId: handle.sessionId,
    ...(opts.courseTitle !== undefined && { courseTitle: opts.courseTitle }),
  });
  // 3. Navigate to the tab
  await opts.navigate({ to: "/chat/$tabId", params: { tabId: tab.id } });
  return tab.id;
}
```

### Example 2: Course-detail entry point

**File**: `packages/ui/src/routes/course-detail.tsx:34-39`

```tsx
const handleStartSession = useCallback(async () => {
  await openSessionInTab({
    client,
    navigate,
    startOpts: { modeId: "teach", courseId: course.courseId },
    courseTitle: course.title,
    openTab,  // from useTabs()
  });
}, [client, navigate, course, openTab]);
```

### Example 3: Library "Continue" CTA

**File**: `packages/ui/src/routes/library.tsx:48-53`

```tsx
const handleOpenInTab = async (c: CourseSummary) => {
  await openSessionInTab({
    client,
    navigate,
    startOpts: { modeId: "teach", courseId: c.courseId as CourseId },
    courseTitle: c.title,
    openTab,
  });
};
```

### Example 4: Opening a tab from within the NewTabPicker modal

**File**: `packages/ui/src/components/new-tab-picker.tsx:56-69`

```tsx
const handleSubmit = async (e: FormEvent) => {
  // 1. Create session
  const handle = await client.session.start({ modeId, ...(courseId && { courseId }) });
  // 2. Open tab via parent's useTabs() hook instance (props.openTab, NOT client.tabs.open)
  const tab = await openTab({
    sessionId: handle.sessionId,
    courseTitle: selectedCourse?.title,
  });
  // 3. Parent navigates after onOpened()
  onOpened(tab.id);
};
```

Note: `NewTabPicker` takes `openTab` as a prop (from the shell's `useTabs()`) rather than
calling `client.tabs.open()` directly. This keeps the shell's in-memory tabs list in sync
without requiring a refresh round-trip.

## When to Use

- Any UI affordance that starts a session and should land the user in the chat workspace
- Course-detail "Start session", Library "Continue", Library "Use this pack", Assignment "Begin"

## When NOT to Use

- Reopening an already-existing closed tab — use `useTabs().reopenTab(tabId)` which
  calls `tabs.reopen` without creating a new session
- The configure route — it starts a configure session but stays in the configure route
  (doesn't navigate to `/chat`)

## Common Violations

- Calling only `session.start` + `navigate({ to: "/" })` without `tabs.open` — the
  session is created but has no tab, appears orphaned in the archive with no way back
- Calling `client.tabs.open()` directly instead of the `openTab` callback from `useTabs()` —
  the shell's in-memory state doesn't update, so the tab body doesn't render until
  the user manually refreshes
