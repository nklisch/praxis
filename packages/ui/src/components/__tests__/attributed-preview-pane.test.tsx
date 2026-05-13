import type { ComposedSegment, ComposedSystemPromptWithAttribution, PraxisClient } from "@praxis/core/types";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makeFakeClient } from "../../__tests__/helpers/fake-client.js";
import { PraxisClientProvider } from "../../context/client-context.js";
import {
  AttributedPreviewPane,
  reconstructBaseline,
} from "../attributed-preview-pane.js";

afterEach(() => cleanup());

// ── Fixtures ─────────────────────────────────────────────────────────────────

function makeSegment(overrides?: Partial<ComposedSegment>): ComposedSegment {
  return {
    fragmentId: "role.tutor",
    position: "role",
    source: "default",
    text: "You are a patient tutor.",
    customizable: true,
    ...overrides,
  };
}

function makeAttribution(
  segments: ComposedSegment[],
): ComposedSystemPromptWithAttribution {
  return {
    prompt: segments.map((s) => s.text).join("\n\n"),
    segments,
  };
}

function makeClient(
  previewFn: ReturnType<typeof vi.fn> = vi.fn().mockResolvedValue(
    makeAttribution([makeSegment()]),
  ),
): PraxisClient {
  return makeFakeClient({
    author: {
      previewPromptWithAttribution: previewFn,
      createCourse: vi.fn(),
      updateCourse: vi.fn(),
      editGate: vi.fn(),
      bootstrap: vi.fn(),
      createLesson: vi.fn(),
      updateLesson: vi.fn(),
      deleteLesson: vi.fn(),
      createGate: vi.fn(),
      updateGate: vi.fn(),
      deleteGate: vi.fn(),
      overrideGate: vi.fn(),
      getCourseSummary: vi.fn(),
      resetConcept: vi.fn(),
      clearMisconception: vi.fn(),
      exportMemory: vi.fn(),
      deleteAllMemory: vi.fn(),
      listConfiguratorActions: vi.fn(),
    } as PraxisClient["author"],
  });
}

function renderPane(
  props: { modeId: string; view: "composed" | "diff" },
  client: PraxisClient = makeClient(),
) {
  return render(
    <PraxisClientProvider client={client}>
      <AttributedPreviewPane {...props} />
    </PraxisClientProvider>,
  );
}

// ── reconstructBaseline — pure function tests ─────────────────────────────────

describe("reconstructBaseline", () => {
  it("drops global segments", () => {
    const segments: ComposedSegment[] = [
      makeSegment({ source: "default", fragmentId: "role.tutor", text: "Default role." }),
      makeSegment({ source: "global", fragmentId: "user-global", text: "User global." }),
    ];
    const { segments: result } = reconstructBaseline(segments);
    expect(result.every((s) => s.source !== "global")).toBe(true);
    expect(result).toHaveLength(1);
  });

  it("drops append segments", () => {
    const segments: ComposedSegment[] = [
      makeSegment({ source: "default", fragmentId: "role.tutor", text: "Default role." }),
      makeSegment({ source: "append", fragmentId: "user-append", text: "Appended text." }),
    ];
    const { segments: result } = reconstructBaseline(segments);
    expect(result.every((s) => s.source !== "append")).toBe(true);
    expect(result).toHaveLength(1);
  });

  it("reverts override segments: source becomes default, text becomes defaultText", () => {
    const segments: ComposedSegment[] = [
      makeSegment({
        source: "override",
        fragmentId: "role.tutor",
        text: "My custom override.",
        defaultText: "Original default role.",
      }),
    ];
    const { segments: result } = reconstructBaseline(segments);
    expect(result).toHaveLength(1);
    expect(result[0]?.source).toBe("default");
    expect(result[0]?.text).toBe("Original default role.");
  });

  it("reverts override segments using text as fallback when defaultText is absent", () => {
    const segments: ComposedSegment[] = [
      makeSegment({
        source: "override",
        fragmentId: "role.tutor",
        text: "My custom override.",
        // no defaultText
      }),
    ];
    const { segments: result } = reconstructBaseline(segments);
    expect(result[0]?.text).toBe("My custom override.");
    expect(result[0]?.source).toBe("default");
  });

  it("passes through default segments unchanged", () => {
    const seg = makeSegment({ source: "default", text: "Default text." });
    const { segments: result } = reconstructBaseline([seg]);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(seg);
  });

  it("passes through additional segments unchanged", () => {
    const seg = makeSegment({
      source: "additional",
      fragmentId: "course.context",
      text: "Course context.",
      customizable: false,
    });
    const { segments: result } = reconstructBaseline([seg]);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual(seg);
  });

  it("preserves render order", () => {
    const segments: ComposedSegment[] = [
      makeSegment({ source: "default", fragmentId: "a", text: "A" }),
      makeSegment({ source: "append", fragmentId: "b", text: "B" }),
      makeSegment({ source: "additional", fragmentId: "c", text: "C" }),
      makeSegment({ source: "global", fragmentId: "d", text: "D" }),
      makeSegment({
        source: "override",
        fragmentId: "e",
        text: "E-override",
        defaultText: "E-default",
      }),
    ];
    const { segments: result } = reconstructBaseline(segments);
    // B and D dropped; A, C, E remain in order; E text reverted
    expect(result.map((s) => s.fragmentId)).toEqual(["a", "c", "e"]);
  });

  it("prompt field equals segments.map(s => s.text).join('\\n\\n') after reconstruction", () => {
    const segments: ComposedSegment[] = [
      makeSegment({ source: "default", fragmentId: "a", text: "First segment." }),
      makeSegment({
        source: "override",
        fragmentId: "b",
        text: "Overridden.",
        defaultText: "Second default.",
      }),
      makeSegment({ source: "global", fragmentId: "c", text: "Global (dropped)." }),
    ];
    const { prompt, segments: result } = reconstructBaseline(segments);
    expect(prompt).toBe(result.map((s) => s.text).join("\n\n"));
  });
});

// ── Component: composed mode ──────────────────────────────────────────────────

describe("AttributedPreviewPane — composed mode", () => {
  it("shows loading indicator while IPC is pending", async () => {
    let resolveIpc!: (v: ComposedSystemPromptWithAttribution) => void;
    const pendingFn = vi.fn(
      () =>
        new Promise<ComposedSystemPromptWithAttribution>((res) => {
          resolveIpc = res;
        }),
    );
    renderPane({ modeId: "teach", view: "composed" }, makeClient(pendingFn));

    // While IPC hasn't resolved, the loading indicator should show.
    expect(document.querySelector("[aria-label='Refreshing preview']")).toBeNull();
    // The pane with just "…" shows during initial load (current===null path).
    const pane = document.querySelector("div");
    expect(pane?.textContent).toContain("…");

    // Clean up by resolving.
    resolveIpc(makeAttribution([makeSegment()]));
  });

  it("renders each segment with source-coded class", async () => {
    const segments: ComposedSegment[] = [
      makeSegment({ source: "default", fragmentId: "role.tutor", text: "Default text." }),
      makeSegment({
        source: "override",
        fragmentId: "role.tutor",
        text: "Override text.",
        defaultText: "Default text.",
      }),
      makeSegment({ source: "append", fragmentId: "user-append", text: "Appended." }),
      makeSegment({ source: "global", fragmentId: "user-global", text: "Global." }),
      makeSegment({
        source: "additional",
        fragmentId: "course.context",
        text: "Additional.",
        customizable: false,
      }),
    ];

    const client = makeClient(vi.fn().mockResolvedValue(makeAttribution(segments)));
    renderPane({ modeId: "teach", view: "composed" }, client);

    await waitFor(() => {
      // Segments are rendered once IPC resolves.
      expect(screen.getByText("Default text.")).toBeDefined();
    });

    // Check that each segment span has a class reflecting its source.
    const spans = document.querySelectorAll("pre span");
    const classLists = Array.from(spans).map((el) => el.className);

    expect(classLists.some((c) => c.includes("sourceDefault"))).toBe(true);
    expect(classLists.some((c) => c.includes("sourceOverride"))).toBe(true);
    expect(classLists.some((c) => c.includes("sourceAppend"))).toBe(true);
    expect(classLists.some((c) => c.includes("sourceGlobal"))).toBe(true);
    expect(classLists.some((c) => c.includes("sourceAdditional"))).toBe(true);
  });

  it("title attr on each span carries source · fragmentId", async () => {
    const seg = makeSegment({
      source: "override",
      fragmentId: "role.tutor",
      text: "Override text.",
      defaultText: "Default text.",
    });
    const client = makeClient(vi.fn().mockResolvedValue(makeAttribution([seg])));
    renderPane({ modeId: "teach", view: "composed" }, client);

    await waitFor(() => {
      expect(screen.getByText("Override text.")).toBeDefined();
    });

    const span = document.querySelector("pre span");
    expect(span?.getAttribute("title")).toBe("override · role.tutor");
  });
});

// ── Component: diff mode ──────────────────────────────────────────────────────

describe("AttributedPreviewPane — diff mode", () => {
  it("renders two columns labelled Default and Current", async () => {
    const client = makeClient();
    renderPane({ modeId: "teach", view: "diff" }, client);

    await waitFor(() => {
      expect(screen.getByText("Default")).toBeDefined();
      expect(screen.getByText("Current")).toBeDefined();
    });
  });

  it("baseline column omits global and append segments", async () => {
    const segments: ComposedSegment[] = [
      makeSegment({ source: "default", fragmentId: "role.tutor", text: "Default role." }),
      makeSegment({ source: "global", fragmentId: "user-global", text: "Global text." }),
      makeSegment({ source: "append", fragmentId: "user-append", text: "Appended text." }),
    ];
    const client = makeClient(vi.fn().mockResolvedValue(makeAttribution(segments)));
    renderPane({ modeId: "teach", view: "diff" }, client);

    await waitFor(() => {
      expect(screen.getByText("Default")).toBeDefined();
    });

    // The current column should show "Global text." and "Appended text."
    // The default column should NOT show them.
    const cols = document.querySelectorAll("[class*='diffCol']");
    expect(cols.length).toBe(2);

    const defaultColText = cols[0]?.textContent ?? "";
    expect(defaultColText).not.toContain("Global text.");
    expect(defaultColText).not.toContain("Appended text.");
    expect(defaultColText).toContain("Default role.");
  });

  it("baseline column shows defaultText where an override existed", async () => {
    const segments: ComposedSegment[] = [
      makeSegment({
        source: "override",
        fragmentId: "role.tutor",
        text: "My override.",
        defaultText: "Original default.",
      }),
    ];
    const client = makeClient(vi.fn().mockResolvedValue(makeAttribution(segments)));
    renderPane({ modeId: "teach", view: "diff" }, client);

    await waitFor(() => {
      expect(screen.getByText("Default")).toBeDefined();
    });

    const cols = document.querySelectorAll("[class*='diffCol']");
    const defaultColText = cols[0]?.textContent ?? "";
    const currentColText = cols[1]?.textContent ?? "";

    expect(defaultColText).toContain("Original default.");
    expect(currentColText).toContain("My override.");
  });
});

// ── View-prop switching — no re-fetch ─────────────────────────────────────────

describe("AttributedPreviewPane — view-prop switching", () => {
  it("does not re-fetch when only view prop changes", async () => {
    const previewFn = vi.fn().mockResolvedValue(makeAttribution([makeSegment()]));
    const client = makeClient(previewFn);

    const { rerender } = render(
      <PraxisClientProvider client={client}>
        <AttributedPreviewPane modeId="teach" view="composed" />
      </PraxisClientProvider>,
    );

    await waitFor(() => {
      expect(previewFn).toHaveBeenCalledTimes(1);
    });

    // Switch to diff view.
    rerender(
      <PraxisClientProvider client={client}>
        <AttributedPreviewPane modeId="teach" view="diff" />
      </PraxisClientProvider>,
    );

    // Should still be exactly 1 call — switching view does not trigger re-fetch.
    await waitFor(() => {
      expect(previewFn).toHaveBeenCalledTimes(1);
    });

    // Switch back to composed.
    rerender(
      <PraxisClientProvider client={client}>
        <AttributedPreviewPane modeId="teach" view="composed" />
      </PraxisClientProvider>,
    );

    await waitFor(() => {
      expect(previewFn).toHaveBeenCalledTimes(1);
    });
  });
});

// ── Stale-effect protection ────────────────────────────────────────────────────

describe("AttributedPreviewPane — stale-effect protection", () => {
  it("does not surface stale data when modeId changes rapidly", async () => {
    let resolveTeach!: (v: ComposedSystemPromptWithAttribution) => void;
    let resolveQuiz!: (v: ComposedSystemPromptWithAttribution) => void;

    const teachResponse = makeAttribution([
      makeSegment({ text: "TEACH CONTENT", fragmentId: "teach.role" }),
    ]);
    const quizResponse = makeAttribution([
      makeSegment({ text: "QUIZ CONTENT", fragmentId: "quiz.role" }),
    ]);

    const previewFn = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<ComposedSystemPromptWithAttribution>((res) => {
            resolveTeach = res;
          }),
      )
      .mockImplementationOnce(
        () =>
          new Promise<ComposedSystemPromptWithAttribution>((res) => {
            resolveQuiz = res;
          }),
      );

    const client = makeClient(previewFn);

    const { rerender } = render(
      <PraxisClientProvider client={client}>
        <AttributedPreviewPane modeId="teach" view="composed" />
      </PraxisClientProvider>,
    );

    // Immediately switch to quiz before teach resolves.
    rerender(
      <PraxisClientProvider client={client}>
        <AttributedPreviewPane modeId="quiz" view="composed" />
      </PraxisClientProvider>,
    );

    // Resolve quiz first.
    resolveQuiz(quizResponse);

    // Then resolve teach (stale).
    resolveTeach(teachResponse);

    // Final render should show quiz content, not stale teach content.
    await waitFor(() => {
      expect(screen.getByText("QUIZ CONTENT")).toBeDefined();
    });

    expect(screen.queryByText("TEACH CONTENT")).toBeNull();
  });
});
