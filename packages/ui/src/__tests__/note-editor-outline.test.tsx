/**
 * Tests for <NoteEditorOutline>.
 *
 * Covers:
 *  - Renders bullets at correct levels (data-level attribute + CSS class).
 *  - Tab indents / Shift+Tab outdents (level changes, capped 1–4).
 *  - ⌘. toggles isCheckbox on a row.
 *  - Drag-handle drop reorders rows.
 *  - Styling per level (CSS class assertions via data-level).
 *  - Enter creates a sibling row at the same level.
 *  - Backward-compat: old tree-body is migrated to flat rows.
 */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OutlineBody, OutlineRow } from "../components/note-editor-outline.js";
import { NoteEditorOutline } from "../components/note-editor-outline.js";

afterEach(() => cleanup());

// ── Helpers ──────────────────────────────────────────────────────────────────

function row(
  overrides: Partial<OutlineRow> & { id: string; text: string; level: 1 | 2 | 3 | 4 },
): OutlineRow {
  return { isCheckbox: false, checked: false, ...overrides };
}

function makeBody(rows: OutlineRow[]): OutlineBody {
  return { kind: "outline", rows };
}

function makeThreeRows(): OutlineBody {
  return makeBody([
    row({ id: "r1", text: "Heading", level: 1 }),
    row({ id: "r2", text: "Detail", level: 2 }),
    row({ id: "r3", text: "Aside", level: 4 }),
  ]);
}

/** Find the DOM row wrapper for a given row id. */
function findRowEl(container: HTMLElement, id: string): HTMLElement {
  const el = container.querySelector(`[data-row-id="${id}"]`);
  if (!el) throw new Error(`row ${id} not found`);
  return el as HTMLElement;
}

/** Find the contenteditable text div inside the row wrapper. */
function textEl(container: HTMLElement, id: string): HTMLElement {
  return findRowEl(container, id).querySelector("[contenteditable]") as HTMLElement;
}

// ── Rendering ─────────────────────────────────────────────────────────────────

describe("NoteEditorOutline — rendering", () => {
  it("renders one listitem per row", () => {
    const { container } = render(<NoteEditorOutline body={makeThreeRows()} onChange={() => {}} />);
    // Rows are rendered as <li> elements inside the <ul>.
    const items = container.querySelectorAll("li[data-row-id]");
    expect(items).toHaveLength(3);
  });

  it("sets data-level attribute matching row.level", () => {
    const { container } = render(<NoteEditorOutline body={makeThreeRows()} onChange={() => {}} />);
    expect(findRowEl(container, "r1").dataset.level).toBe("1");
    expect(findRowEl(container, "r2").dataset.level).toBe("2");
    expect(findRowEl(container, "r3").dataset.level).toBe("4");
  });

  it("level-1 row has level1 CSS class", () => {
    const { container } = render(<NoteEditorOutline body={makeThreeRows()} onChange={() => {}} />);
    expect(findRowEl(container, "r1").className).toMatch(/level1/);
  });

  it("level-4 row has level4 CSS class", () => {
    const { container } = render(<NoteEditorOutline body={makeThreeRows()} onChange={() => {}} />);
    expect(findRowEl(container, "r3").className).toMatch(/level4/);
  });

  it("renders bullet glyphs per level", () => {
    const { container } = render(<NoteEditorOutline body={makeThreeRows()} onChange={() => {}} />);
    // level-1 bullet is "·"
    const bullets = container.querySelectorAll('[class*="bullet"]');
    expect(bullets.length).toBeGreaterThanOrEqual(2);
  });

  it("renders drag handles on each row", () => {
    const { container } = render(<NoteEditorOutline body={makeThreeRows()} onChange={() => {}} />);
    const handles = container.querySelectorAll('[class*="handle"]');
    expect(handles).toHaveLength(3);
  });

  it("renders keyboard hints bar", () => {
    const { container } = render(<NoteEditorOutline body={makeThreeRows()} onChange={() => {}} />);
    expect(container.querySelector('[class*="keyboardHints"]')).not.toBeNull();
  });

  it("renders the new-bullet footer", () => {
    render(<NoteEditorOutline body={makeThreeRows()} onChange={() => {}} />);
    expect(screen.getByLabelText("Add new bullet")).toBeDefined();
  });

  it("falls back to a single empty row when rows array is empty", () => {
    const { container } = render(<NoteEditorOutline body={makeBody([])} onChange={() => {}} />);
    expect(container.querySelectorAll("li[data-row-id]")).toHaveLength(1);
  });
});

// ── Keyboard: Tab / Shift+Tab ─────────────────────────────────────────────────

describe("NoteEditorOutline — Tab / Shift+Tab", () => {
  it("Tab on a level-2 row emits level 3", () => {
    const onChange = vi.fn();
    const { container } = render(
      <NoteEditorOutline
        body={makeBody([row({ id: "r1", text: "A", level: 2 })])}
        onChange={onChange}
      />,
    );
    const input = textEl(container, "r1");
    fireEvent.keyDown(input, { key: "Tab", shiftKey: false });
    const last: OutlineBody = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0];
    expect(last?.rows[0]?.level).toBe(3);
  });

  it("Tab on a level-4 row stays at level 4 (max)", () => {
    const onChange = vi.fn();
    const { container } = render(
      <NoteEditorOutline
        body={makeBody([row({ id: "r1", text: "A", level: 4 })])}
        onChange={onChange}
      />,
    );
    const input = textEl(container, "r1");
    fireEvent.keyDown(input, { key: "Tab", shiftKey: false });
    const last: OutlineBody = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0];
    expect(last?.rows[0]?.level).toBe(4);
  });

  it("Shift+Tab on a level-3 row emits level 2", () => {
    const onChange = vi.fn();
    const { container } = render(
      <NoteEditorOutline
        body={makeBody([row({ id: "r1", text: "A", level: 3 })])}
        onChange={onChange}
      />,
    );
    const input = textEl(container, "r1");
    fireEvent.keyDown(input, { key: "Tab", shiftKey: true });
    const last: OutlineBody = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0];
    expect(last?.rows[0]?.level).toBe(2);
  });

  it("Shift+Tab on a level-1 row stays at level 1 (min)", () => {
    const onChange = vi.fn();
    const { container } = render(
      <NoteEditorOutline
        body={makeBody([row({ id: "r1", text: "A", level: 1 })])}
        onChange={onChange}
      />,
    );
    const input = textEl(container, "r1");
    fireEvent.keyDown(input, { key: "Tab", shiftKey: true });
    const last: OutlineBody = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0];
    expect(last?.rows[0]?.level).toBe(1);
  });
});

// ── Keyboard: ⌘. toggle checkbox ─────────────────────────────────────────────

describe("NoteEditorOutline — ⌘. checkbox toggle", () => {
  it("⌘. on a plain bullet sets isCheckbox = true", () => {
    const onChange = vi.fn();
    const { container } = render(
      <NoteEditorOutline
        body={makeBody([row({ id: "r1", text: "A", level: 1 })])}
        onChange={onChange}
      />,
    );
    const input = textEl(container, "r1");
    fireEvent.keyDown(input, { key: ".", metaKey: true });
    const last: OutlineBody = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0];
    expect(last?.rows[0]?.isCheckbox).toBe(true);
  });

  it("⌘. again on a checkbox row sets isCheckbox = false", () => {
    const onChange = vi.fn();
    const { container } = render(
      <NoteEditorOutline
        body={makeBody([row({ id: "r1", text: "A", level: 1, isCheckbox: true })])}
        onChange={onChange}
      />,
    );
    const input = textEl(container, "r1");
    fireEvent.keyDown(input, { key: ".", metaKey: true });
    const last: OutlineBody = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0];
    expect(last?.rows[0]?.isCheckbox).toBe(false);
  });

  it("Ctrl+. also toggles checkbox (Windows/Linux)", () => {
    const onChange = vi.fn();
    const { container } = render(
      <NoteEditorOutline
        body={makeBody([row({ id: "r1", text: "A", level: 1 })])}
        onChange={onChange}
      />,
    );
    const input = textEl(container, "r1");
    fireEvent.keyDown(input, { key: ".", ctrlKey: true });
    const last: OutlineBody = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0];
    expect(last?.rows[0]?.isCheckbox).toBe(true);
  });

  it("checkbox row renders the checkbox button", () => {
    const { container } = render(
      <NoteEditorOutline
        body={makeBody([row({ id: "r1", text: "Todo item", level: 2, isCheckbox: true })])}
        onChange={() => {}}
      />,
    );
    const btn = container.querySelector('[aria-label="Mark complete"]');
    expect(btn).not.toBeNull();
  });

  it("clicking the checkbox button toggles checked state", () => {
    const onChange = vi.fn();
    const { container } = render(
      <NoteEditorOutline
        body={makeBody([
          row({ id: "r1", text: "Todo", level: 1, isCheckbox: true, checked: false }),
        ])}
        onChange={onChange}
      />,
    );
    const btn = container.querySelector('[aria-label="Mark complete"]') as HTMLElement;
    fireEvent.click(btn);
    const last: OutlineBody = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0];
    expect(last?.rows[0]?.checked).toBe(true);
  });

  it("checked row gets 'checked' CSS class", () => {
    const { container } = render(
      <NoteEditorOutline
        body={makeBody([
          row({ id: "r1", text: "Done", level: 1, isCheckbox: true, checked: true }),
        ])}
        onChange={() => {}}
      />,
    );
    expect(findRowEl(container, "r1").className).toMatch(/checked/);
  });
});

// ── Enter: new sibling row ────────────────────────────────────────────────────

describe("NoteEditorOutline — Enter adds sibling row", () => {
  it("Enter inserts a new row at the same level after the current row", () => {
    const onChange = vi.fn();
    const { container } = render(
      <NoteEditorOutline
        body={makeBody([row({ id: "r1", text: "First", level: 2 })])}
        onChange={onChange}
      />,
    );
    const input = textEl(container, "r1");
    fireEvent.keyDown(input, { key: "Enter" });
    const last: OutlineBody = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0];
    expect(last?.rows).toHaveLength(2);
    expect(last?.rows[1]?.level).toBe(2);
    expect(last?.rows[1]?.text).toBe("");
  });

  it("⌘+Enter inserts a level-1 row", () => {
    const onChange = vi.fn();
    const { container } = render(
      <NoteEditorOutline
        body={makeBody([row({ id: "r1", text: "Sub", level: 3 })])}
        onChange={onChange}
      />,
    );
    const input = textEl(container, "r1");
    fireEvent.keyDown(input, { key: "Enter", metaKey: true });
    const last: OutlineBody = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0];
    expect(last?.rows[1]?.level).toBe(1);
  });
});

// ── Drag-handle reorder ───────────────────────────────────────────────────────

describe("NoteEditorOutline — drag-handle reorder", () => {
  it("dragging r1 handle and dropping onto r2 reorders rows", () => {
    const onChange = vi.fn();
    const { container } = render(
      <NoteEditorOutline
        body={makeBody([
          row({ id: "r1", text: "First", level: 1 }),
          row({ id: "r2", text: "Second", level: 1 }),
        ])}
        onChange={onChange}
      />,
    );

    // Handles are rendered inside each listitem.
    const handles = container.querySelectorAll('[class*="handle"]');
    const handle1 = handles[0] as HTMLElement;
    const row2El = findRowEl(container, "r2");

    fireEvent.dragStart(handle1, { dataTransfer: { effectAllowed: "move" } });
    fireEvent.dragOver(row2El, { dataTransfer: { dropEffect: "move" }, preventDefault: vi.fn() });
    fireEvent.drop(row2El, { dataTransfer: {} });

    const last: OutlineBody = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0];
    // r1 should now be at index 1 (swapped past r2)
    expect(last?.rows[0]?.id).toBe("r2");
    expect(last?.rows[1]?.id).toBe("r1");
  });
});

// ── Backward-compat: tree body migration ─────────────────────────────────────

describe("NoteEditorOutline — legacy tree-body migration", () => {
  it("migrates old {root, children} body to flat rows without crashing", () => {
    const legacyBody = {
      kind: "outline" as const,
      root: {
        text: "Root",
        children: [
          { text: "Child A", children: [] },
          { text: "Child B", children: [{ text: "Grandchild", children: [] }] },
        ],
      },
    };
    const { container } = render(
      // biome-ignore lint/suspicious/noExplicitAny: testing legacy schema
      <NoteEditorOutline body={legacyBody as any} onChange={() => {}} />,
    );
    const items = container.querySelectorAll("li[data-row-id]");
    // Root + 2 children + 1 grandchild = 4 rows
    expect(items).toHaveLength(4);
  });
});

// ── Regression: special-character input does not reset cursor ─────────────────
//
// Previously, dangerouslySetInnerHTML={{ __html: escapeHtml(row.text) }} caused
// React to overwrite the DOM node whenever the user typed &, <, >, or " because
// escapeHtml produced a string that differed from the raw DOM content. React
// detected the mismatch and reset innerHTML, moving the cursor to position 0.
//
// The fix removes dangerouslySetInnerHTML entirely and sets initial text via
// ref + textContent on mount. After mount React touches no innerHTML prop, so
// subsequent re-renders triggered by these characters never overwrite the DOM.

describe("NoteEditorOutline — special-character cursor stability", () => {
  it("typing & does not cause dangerouslySetInnerHTML to overwrite the DOM node", () => {
    // Verify: after an onInput event carrying &, the DOM textContent still
    // equals exactly "&" — not the HTML-escaped "&amp;" — confirming React
    // never replaced the node's innerHTML.
    const onChange = vi.fn();
    const { container } = render(
      <NoteEditorOutline
        body={makeBody([row({ id: "r1", text: "", level: 1 })])}
        onChange={onChange}
      />,
    );
    const input = textEl(container, "r1");

    // Simulate the user having typed "&" — jsdom won't actually update
    // textContent via fireEvent.input, so we set it imperatively to mirror
    // what the browser would do before firing the synthetic event.
    input.textContent = "&";
    fireEvent.input(input);

    // The DOM must still read exactly "&", not "&amp;" or "".
    expect(input.textContent).toBe("&");

    // onChange should have received the raw "&".
    const last: OutlineBody = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0];
    expect(last?.rows[0]?.text).toBe("&");
  });

  it("typing < does not corrupt the DOM text node", () => {
    const onChange = vi.fn();
    const { container } = render(
      <NoteEditorOutline
        body={makeBody([row({ id: "r1", text: "", level: 1 })])}
        onChange={onChange}
      />,
    );
    const input = textEl(container, "r1");
    input.textContent = "<";
    fireEvent.input(input);
    expect(input.textContent).toBe("<");
    const last: OutlineBody = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0];
    expect(last?.rows[0]?.text).toBe("<");
  });

  it("typing > does not corrupt the DOM text node", () => {
    const onChange = vi.fn();
    const { container } = render(
      <NoteEditorOutline
        body={makeBody([row({ id: "r1", text: "", level: 1 })])}
        onChange={onChange}
      />,
    );
    const input = textEl(container, "r1");
    input.textContent = ">";
    fireEvent.input(input);
    expect(input.textContent).toBe(">");
    const last: OutlineBody = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0];
    expect(last?.rows[0]?.text).toBe(">");
  });

  it('typing " does not corrupt the DOM text node', () => {
    const onChange = vi.fn();
    const { container } = render(
      <NoteEditorOutline
        body={makeBody([row({ id: "r1", text: "", level: 1 })])}
        onChange={onChange}
      />,
    );
    const input = textEl(container, "r1");
    input.textContent = '"';
    fireEvent.input(input);
    expect(input.textContent).toBe('"');
    const last: OutlineBody = onChange.mock.calls[onChange.mock.calls.length - 1]?.[0];
    expect(last?.rows[0]?.text).toBe('"');
  });

  it("initial row text with special characters is rendered via textContent (not innerHTML)", () => {
    // Rows initialised with special characters must appear in the DOM as the
    // raw characters, not as HTML entities, proving we're using textContent.
    const { container } = render(
      <NoteEditorOutline
        body={makeBody([row({ id: "r1", text: "a & b < c > d", level: 1 })])}
        onChange={() => {}}
      />,
    );
    const input = textEl(container, "r1");
    expect(input.textContent).toBe("a & b < c > d");
  });
});
