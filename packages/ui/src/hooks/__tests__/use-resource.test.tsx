import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useResource } from "../use-resource.js";

describe("useResource", () => {
  it("loads data on mount", async () => {
    const loader = vi.fn<() => Promise<string[]>>().mockResolvedValue(["item-1", "item-2"]);
    const { result } = renderHook(() => useResource(loader));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toEqual(["item-1", "item-2"]);
    expect(result.current.error).toBeNull();
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("sets loading true during fetch then false on success", async () => {
    let resolve: (v: string[]) => void = () => {};
    const loader = vi.fn(
      () =>
        new Promise<string[]>((res) => {
          resolve = res;
        }),
    );
    const { result } = renderHook(() => useResource(loader));

    expect(result.current.loading).toBe(true);

    await act(async () => {
      resolve(["hello"]);
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.data).toEqual(["hello"]);
  });

  it("surfaces error.message on rejection", async () => {
    const loader = vi.fn<() => Promise<string[]>>().mockRejectedValue(new Error("fetch failed"));
    const { result } = renderHook(() => useResource(loader));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe("fetch failed");
    expect(result.current.data).toBeUndefined();
  });

  it("surfaces stringified non-Error rejections", async () => {
    const loader = vi.fn<() => Promise<string[]>>().mockRejectedValue("string error");
    const { result } = renderHook(() => useResource(loader));

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });

    expect(result.current.error).toBe("string error");
  });

  it("refresh re-runs the loader", async () => {
    const loader = vi.fn<() => Promise<string[]>>().mockResolvedValue(["first"]);
    const { result } = renderHook(() => useResource(loader));

    await waitFor(() => expect(result.current.loading).toBe(false));

    loader.mockResolvedValueOnce(["second"]);

    await act(async () => {
      await result.current.refresh();
    });

    expect(loader).toHaveBeenCalledTimes(2);
    expect(result.current.data).toEqual(["second"]);
  });

  it("setData updates data with a direct value (optimistic update)", async () => {
    const loader = vi.fn<() => Promise<string[]>>().mockResolvedValue(["a", "b", "c"]);
    const { result } = renderHook(() => useResource(loader));

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.setData(["a", "b"]);
    });

    expect(result.current.data).toEqual(["a", "b"]);
  });

  it("setData supports updater function (optimistic remove)", async () => {
    const loader = vi.fn<() => Promise<string[]>>().mockResolvedValue(["a", "b", "c"]);
    const { result } = renderHook(() => useResource(loader));

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.setData((prev) => (prev ?? []).filter((x) => x !== "b"));
    });

    expect(result.current.data).toEqual(["a", "c"]);
  });

  it("setData works before first load (prev is undefined)", async () => {
    let resolve: (v: string[]) => void = () => {};
    const loader = vi.fn(
      () =>
        new Promise<string[]>((res) => {
          resolve = res;
        }),
    );
    const { result } = renderHook(() => useResource(loader));

    act(() => {
      result.current.setData((prev) => [...(prev ?? []), "early"]);
    });

    expect(result.current.data).toEqual(["early"]);

    await act(async () => {
      resolve(["loaded"]);
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    // After load completes, data is the loaded value
    expect(result.current.data).toEqual(["loaded"]);
  });
});
