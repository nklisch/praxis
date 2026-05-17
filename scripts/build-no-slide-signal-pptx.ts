/**
 * scripts/build-no-slide-signal-pptx.ts — one-shot fixture builder.
 *
 * Produces packages/tools/src/runtime/ingestion/__tests__/fixtures/no-slide-signal.pptx,
 * a minimal but valid PPTX whose single slide contains only a `<p:contentPart>`
 * (digital ink) shape. officeparser's `p:spTree` walker only emits "slide"
 * nodes when at least one child has extractable content (a:r text, p:pic image,
 * p:graphicFrame chart). p:contentPart is not in that list, so ast.content
 * has zero "slide"-type nodes — `tryChunkBySlide` returns null, triggering
 * the `ast.toText() + chunkMarkdown` fallback in PptxIngestor.
 *
 * Run with: pnpm tsx scripts/build-no-slide-signal-pptx.ts
 *
 * The fixture is committed; CI never runs this script.
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import JSZip from "jszip";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const SAMPLE_PPTX = join(
  REPO_ROOT,
  "packages/tools/src/runtime/ingestion/__tests__/fixtures/sample.pptx",
);
const OUT_PATH = join(
  REPO_ROOT,
  "packages/tools/src/runtime/ingestion/__tests__/fixtures/no-slide-signal.pptx",
);

// Replace slide1.xml's spTree with content that officeparser ignores
// (a p:contentPart digital-ink shape — no a:r, no p:pic, no p:graphicFrame).
// We keep the slide layout/master references intact so the file is still a
// valid PPTX that opens in PowerPoint Online.
const NO_SIGNAL_SLIDE_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr><p:contentPart r:id="rIdContentPart"/></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;

async function main(): Promise<void> {
  const sampleBytes = await readFile(SAMPLE_PPTX);
  const sample = await JSZip.loadAsync(sampleBytes);

  const out = new JSZip();

  // Copy the existing PPTX scaffolding (relationships, theme, layouts,
  // master, content types) — everything except slide content. We keep
  // only slide1; presentation.xml.rels and presentation.xml in sample.pptx
  // reference 9 slides — we rewrite those two below.
  const KEEP_PREFIXES = [
    "[Content_Types].xml",
    "_rels/",
    "docProps/",
    "ppt/_rels/",
    "ppt/theme/",
    "ppt/slideLayouts/",
    "ppt/slideMasters/",
    "ppt/presProps.xml",
    "ppt/viewProps.xml",
    "ppt/tableStyles.xml",
  ];

  for (const [path, entry] of Object.entries(sample.files)) {
    if (entry.dir) continue;
    const matches = KEEP_PREFIXES.some((p) => path.startsWith(p) || path === p);
    if (!matches) continue;
    const data = await entry.async("nodebuffer");
    out.file(path, data);
  }

  // Write a single replacement slide1.xml with no extractable content.
  out.file("ppt/slides/slide1.xml", NO_SIGNAL_SLIDE_XML);
  // Minimal slide1 rels referencing the slide layout.
  out.file(
    "ppt/slides/_rels/slide1.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`,
  );

  // Rewrite ppt/presentation.xml to reference only slide1.
  const presentationXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" saveSubsetFonts="1"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst><p:sldSize cx="9144000" cy="6858000" type="screen4x3"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`;
  out.file("ppt/presentation.xml", presentationXml);

  // Rewrite ppt/_rels/presentation.xml.rels to reference only the kept files.
  const presentationRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/></Relationships>`;
  out.file("ppt/_rels/presentation.xml.rels", presentationRels);

  // Rewrite [Content_Types].xml to list only the kept parts. Minimal set:
  // default extensions for rels and xml, then explicit overrides for each
  // kept file under ppt/ that needs a content type.
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpeg" ContentType="image/jpeg"/><Default Extension="png" ContentType="image/png"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
  out.file("[Content_Types].xml", contentTypes);

  // Drop slideLayouts beyond 1 and slideMasters beyond 1 to keep the file tiny.
  // Iterate files and remove non-slideLayout1 / non-slideMaster1.
  for (const path of Object.keys(out.files)) {
    if (
      path.startsWith("ppt/slideLayouts/") &&
      !path.startsWith("ppt/slideLayouts/_rels/slideLayout1.xml.rels") &&
      !path.endsWith("/slideLayout1.xml") &&
      path !== "ppt/slideLayouts/slideLayout1.xml"
    ) {
      delete out.files[path];
    }
    if (
      path.startsWith("ppt/slideMasters/") &&
      !path.startsWith("ppt/slideMasters/_rels/slideMaster1.xml.rels") &&
      !path.endsWith("/slideMaster1.xml") &&
      path !== "ppt/slideMasters/slideMaster1.xml"
    ) {
      delete out.files[path];
    }
  }

  // Fix slideMaster1.xml.rels and slideLayout1.xml.rels to only reference
  // slideLayout1/slideMaster1 (drop other refs).
  out.file(
    "ppt/slideMasters/_rels/slideMaster1.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>`,
  );
  out.file(
    "ppt/slideLayouts/_rels/slideLayout1.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`,
  );

  // Update slideMaster1.xml to reference only slideLayout1 (remove other ids).
  const masterPath = "ppt/slideMasters/slideMaster1.xml";
  const masterEntry = out.files[masterPath];
  if (masterEntry) {
    const masterXml = await masterEntry.async("string");
    // Replace the entire sldLayoutIdLst block with one referencing layout 1.
    const fixed = masterXml.replace(
      /<p:sldLayoutIdLst>[\s\S]*?<\/p:sldLayoutIdLst>/,
      '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>',
    );
    out.file(masterPath, fixed);
  }

  // Set the docProps title so the fallback path can resolve a meaningful title.
  out.file(
    "docProps/core.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>fallback fixture</dc:title></cp:coreProperties>`,
  );

  const bytes = await out.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  await writeFile(OUT_PATH, bytes);
  console.log(`wrote ${bytes.length} bytes → ${OUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
