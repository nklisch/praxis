import { describe, expect, it } from "vitest";
import { getRouteMeta, ROUTE_META } from "../components/route-meta.js";

describe("ROUTE_META", () => {
  it("has an entry for every non-chat route", () => {
    const expectedRoutes = [
      "courses",
      "packs",
      "workspace",
      "configure",
      "settings",
      "courseDetail",
      "courseMap",
    ];
    for (const route of expectedRoutes) {
      expect(ROUTE_META[route], `Missing ROUTE_META entry for "${route}"`).toBeDefined();
    }
  });

  it("each entry has required fields: ornament, kicker, title, deck", () => {
    for (const [key, meta] of Object.entries(ROUTE_META)) {
      expect(typeof meta.ornament, `${key}.ornament must be a string`).toBe("string");
      expect(meta.ornament.length, `${key}.ornament must be non-empty`).toBeGreaterThan(0);
      expect(typeof meta.kicker, `${key}.kicker must be a string`).toBe("string");
      expect(meta.kicker.length, `${key}.kicker must be non-empty`).toBeGreaterThan(0);
      expect(typeof meta.title, `${key}.title must be a string`).toBe("string");
      expect(typeof meta.deck, `${key}.deck must be a string`).toBe("string");
    }
  });
});

describe("getRouteMeta", () => {
  it("returns the correct entry for 'courses'", () => {
    const meta = getRouteMeta("courses");
    expect(meta.ornament).toBe("¶");
    expect(meta.kicker).toBe("COURSES");
    expect(meta.title).toBe("courses");
    expect(meta.deck).toBe("what you're learning");
  });

  it("returns the correct entry for 'packs'", () => {
    const meta = getRouteMeta("packs");
    expect(meta.ornament).toBe("§");
    expect(meta.kicker).toBe("PACKS");
  });

  it("returns the correct entry for 'workspace'", () => {
    const meta = getRouteMeta("workspace");
    expect(meta.kicker).toBe("WORKSPACE");
  });

  it("returns the correct entry for 'configure'", () => {
    const meta = getRouteMeta("configure");
    expect(meta.ornament).toBe("⁂");
  });

  it("returns the correct entry for 'settings'", () => {
    const meta = getRouteMeta("settings");
    expect(meta.kicker).toBe("SETTINGS");
  });

  it("returns the correct entry for 'courseDetail' (blank title/deck — dynamic)", () => {
    const meta = getRouteMeta("courseDetail");
    expect(meta.ornament).toBe("¶");
    expect(meta.kicker).toBe("COURSE");
    expect(meta.title).toBe("");
    expect(meta.deck).toBe("");
  });

  it("returns the correct entry for 'courseMap'", () => {
    const meta = getRouteMeta("courseMap");
    expect(meta.ornament).toBe("§");
    expect(meta.kicker).toBe("COURSE MAP");
  });

  it("throws for an unknown routeId", () => {
    expect(() => getRouteMeta("nonexistent" as string)).toThrow();
  });
});
