# `sample.pptx` — test fixture

## Source and license

Copied verbatim from the [`officeparser` test suite](https://github.com/harshankur/officeParser/blob/master/test/files/test.pptx)
(commit at time of import: `master` HEAD on 2026-05-11). `officeparser` is
MIT-licensed; redistribution requires the copyright notice, reproduced here:

> MIT License — Copyright (c) 2019 Harsh Ankur

Full license text: [`officeparser/LICENSE`](https://github.com/harshankur/officeParser/blob/master/LICENSE).

## Contents

89 KB. Structure (from `unzip -l`):

- **9 slides** (`ppt/slides/slide1.xml` … `slide9.xml`).
- **4 slides have speaker notes** (`ppt/notesSlides/notesSlide1.xml` …
  `notesSlide4.xml`) — slides 1, 2, 3, 4 have notes; 5-9 do not.
- **1 embedded image**: `ppt/media/image1.png` (~18 KB).
- Standard PPTX scaffolding: layouts, masters, theme, content types,
  relationships.

## Use in tests

The unit tests (`pptx-ingestor.test.ts`) mock `officeparser` and don't read
this file directly — they verify orchestration logic against synthetic AST
shapes. This fixture is for **integration tests** that exercise the full
parse path against a real `.pptx`.

When adding an integration test, gate it behind `PRAXIS_RUN_SLOW_TESTS` per
the `slow-test-gating` pattern in `CLAUDE.md`:

```typescript
describe.skipIf(!process.env.PRAXIS_RUN_SLOW_TESTS)("PptxIngestor against real fixture", () => {
  it("parses sample.pptx end-to-end", async () => {
    const ingestor = new PptxIngestor();
    const result = await ingestor.parse(
      join(__dirname, "fixtures", "sample.pptx"),
    );
    expect(result.chunks.length).toBeGreaterThan(0);
    expect(result.chunks.some((c) => c.page === 1)).toBe(true);
    // …assert on known content
  }, 120_000);
});
```

## Do not edit

This fixture is treated as immutable test data. If a different shape is
needed (e.g. testing a PPTX with no embedded images, or with charts),
generate a new fixture under a distinct name rather than modifying this one.
