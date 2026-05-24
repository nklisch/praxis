/**
 * Tests for <SourcePicker> — 3-tab source selector for /course-create.
 *
 * Verifies:
 * - Pack tab is the landing (active) tab by default.
 * - Upload tab carries a "create your own" tag.
 * - Tab switching via the Or-bar links.
 * - Tab switching via the tab buttons.
 * - Pack selection calls onPackSelect.
 * - Paste submission calls onPasteSubmit with the typed text.
 * - Or-bar names the OTHER two source options for each active tab.
 */
import type { PackSummaryClient } from "@praxis/core/types";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SourcePicker } from "../components/source-picker.js";

afterEach(() => cleanup());

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const SAMPLE_PACK: PackSummaryClient = {
  id: "math.algebra-1",
  version: "1.0.0",
  name: "Algebra 1",
  subject: "math",
  gradeLevel: "9-12",
  conceptCount: 42,
  edgeCount: 60,
  imported: false,
};

function renderPicker(overrides?: Partial<Parameters<typeof SourcePicker>[0]>) {
  const defaults: Parameters<typeof SourcePicker>[0] = {
    packs: [SAMPLE_PACK],
    packsLoading: false,
    packsError: null,
    onPackSelect: vi.fn(),
    onBrowse: vi.fn(),
    onPasteSubmit: vi.fn(),
    ...overrides,
  };
  return render(<SourcePicker {...defaults} />);
}

// ─── Tab defaults ─────────────────────────────────────────────────────────────

describe("SourcePicker — landing tab", () => {
  it("renders Pack as the landing (active) tab by default", () => {
    renderPicker();
    const packTab = screen.getByRole("tab", { name: /pack/i });
    expect(packTab).toBeDefined();
    expect(packTab.getAttribute("aria-selected")).toBe("true");
  });

  it("renders pack list content when Pack tab is active", () => {
    renderPicker();
    expect(screen.getByText("Algebra 1")).toBeDefined();
    expect(screen.getByRole("button", { name: /use pack algebra 1/i })).toBeDefined();
  });

  it("Upload tab carries a 'create your own' tag", () => {
    renderPicker();
    // The tag is inside the Upload tab button.
    const uploadTab = screen.getByRole("tab", { name: /upload/i });
    expect(uploadTab.textContent).toMatch(/create your own/i);
  });
});

// ─── Tab switching ────────────────────────────────────────────────────────────

describe("SourcePicker — tab switching", () => {
  it("switches to Upload tab on click, shows drop zone", () => {
    renderPicker();
    fireEvent.click(screen.getByRole("tab", { name: /upload/i }));
    const uploadTab = screen.getByRole("tab", { name: /upload/i });
    expect(uploadTab.getAttribute("aria-selected")).toBe("true");
    // Upload pane content
    expect(screen.getByRole("button", { name: /browse files/i })).toBeDefined();
  });

  it("switches to Paste tab on click, shows paste textarea", () => {
    renderPicker();
    fireEvent.click(screen.getByRole("tab", { name: /paste/i }));
    const pasteTab = screen.getByRole("tab", { name: /paste/i });
    expect(pasteTab.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("textbox", { name: /paste source text/i })).toBeDefined();
  });

  it("calls onTabChange when switching tabs", () => {
    const onTabChange = vi.fn();
    renderPicker({ onTabChange });
    fireEvent.click(screen.getByRole("tab", { name: /upload/i }));
    expect(onTabChange).toHaveBeenCalledWith("upload");
  });
});

// ─── Or — bar ─────────────────────────────────────────────────────────────────

describe("SourcePicker — Or-bar", () => {
  it("shows the OTHER two source options when Pack tab is active", () => {
    renderPicker();
    // Pack is active → Or-bar should name upload and paste alternatives
    const orBar = screen.getByText(/Or —/);
    expect(orBar).toBeDefined();
    expect(screen.getByRole("button", { name: /upload your own files/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /paste source text/i })).toBeDefined();
  });

  it("switches to target tab when an Or-bar link is clicked", () => {
    renderPicker();
    // Pack is active; click the "paste source text" Or-bar link
    fireEvent.click(screen.getByRole("button", { name: /paste source text/i }));
    const pasteTab = screen.getByRole("tab", { name: /paste/i });
    expect(pasteTab.getAttribute("aria-selected")).toBe("true");
  });

  it("shows the other two options when Upload tab is active", () => {
    renderPicker({ activeTab: "upload" });
    expect(screen.getByRole("button", { name: /pick a canonical pack/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /paste source text/i })).toBeDefined();
  });

  it("shows the other two options when Paste tab is active", () => {
    renderPicker({ activeTab: "paste" });
    expect(screen.getByRole("button", { name: /pick a canonical pack/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /upload your own files/i })).toBeDefined();
  });
});

// ─── Pack selection ───────────────────────────────────────────────────────────

describe("SourcePicker — pack selection", () => {
  it("calls onPackSelect with the pack when 'Use this pack' is clicked", () => {
    const onPackSelect = vi.fn();
    renderPicker({ onPackSelect });
    fireEvent.click(screen.getByRole("button", { name: /use pack algebra 1/i }));
    expect(onPackSelect).toHaveBeenCalledWith(SAMPLE_PACK);
  });

  it("shows loading state when packsLoading is true", () => {
    renderPicker({ packs: [], packsLoading: true });
    expect(screen.getByText(/loading packs/i)).toBeDefined();
  });

  it("shows empty state when packs list is empty", () => {
    renderPicker({ packs: [], packsLoading: false });
    expect(screen.getByText(/no packs available/i)).toBeDefined();
  });

  it("shows error message when packsError is set", () => {
    renderPicker({ packs: [], packsLoading: false, packsError: "Network error" });
    expect(screen.getByText("Network error")).toBeDefined();
  });
});

// ─── Paste submission ─────────────────────────────────────────────────────────

describe("SourcePicker — paste submission", () => {
  it("calls onPasteSubmit with the textarea content on 'Save as source'", async () => {
    const onPasteSubmit = vi.fn();
    renderPicker({ onPasteSubmit });

    // Switch to Paste tab
    fireEvent.click(screen.getByRole("tab", { name: /paste/i }));

    const textarea = screen.getByRole("textbox", { name: /paste source text/i });
    fireEvent.change(textarea, { target: { value: "This is my pasted syllabus." } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /save as source/i }));
    });

    expect(onPasteSubmit).toHaveBeenCalledWith("This is my pasted syllabus.");
  });

  it("does not call onPasteSubmit when paste content is empty", async () => {
    const onPasteSubmit = vi.fn();
    renderPicker({ onPasteSubmit });

    fireEvent.click(screen.getByRole("tab", { name: /paste/i }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /save as source/i }));
    });

    expect(onPasteSubmit).not.toHaveBeenCalled();
  });

  it("disables the Save button when pasteSubmitting is true", () => {
    renderPicker({ activeTab: "paste", pasteSubmitting: true });
    const saveBtn = screen.getByRole("button", { name: /saving/i });
    expect(saveBtn).toBeDefined();
    expect(saveBtn.hasAttribute("disabled")).toBe(true);
  });
});
