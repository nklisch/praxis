import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { useTheme } from "../use-theme.js";

// We need a real (or simulated) localStorage for these tests.
// jsdom provides one by default in the vitest environment.

const STORAGE_KEY = "praxis.theme.preference";

beforeEach(() => {
  localStorage.clear();
  // Reset data-theme attribute between tests.
  delete document.documentElement.dataset.theme;
});

afterEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe("useTheme", () => {
  it('defaults to "auto" when no stored preference', () => {
    const { result } = renderHook(() => useTheme());
    expect(result.current.pref).toBe("auto");
  });

  it("removes data-theme attribute for auto on mount", () => {
    document.documentElement.dataset.theme = "dark"; // pre-existing
    renderHook(() => useTheme());
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it("setPref(light) sets data-theme=light and persists to storage", () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setPref("light");
    });

    expect(result.current.pref).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("light");
  });

  it("setPref(dark) sets data-theme=dark and persists to storage", () => {
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setPref("dark");
    });

    expect(result.current.pref).toBe("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("dark");
  });

  it("setPref(auto) removes data-theme attribute and persists to storage", () => {
    document.documentElement.dataset.theme = "dark";
    const { result } = renderHook(() => useTheme());

    act(() => {
      result.current.setPref("dark");
    });
    act(() => {
      result.current.setPref("auto");
    });

    expect(result.current.pref).toBe("auto");
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(localStorage.getItem(STORAGE_KEY)).toBe("auto");
  });

  it("storage roundtrip: a new hook instance reads the previously stored value", () => {
    // First instance stores "dark"
    const { result: first } = renderHook(() => useTheme());
    act(() => {
      first.current.setPref("dark");
    });

    // Second instance reads it back
    const { result: second } = renderHook(() => useTheme());
    expect(second.current.pref).toBe("dark");
  });

  it("restores data-theme on mount when storage has explicit value", () => {
    localStorage.setItem(STORAGE_KEY, "light");
    renderHook(() => useTheme());
    expect(document.documentElement.dataset.theme).toBe("light");
  });
});
