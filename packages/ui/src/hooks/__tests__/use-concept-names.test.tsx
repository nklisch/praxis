import type { CourseId, PraxisClient } from "@praxis/core/types";
import { brandId } from "@praxis/core/types";
import { renderHook, waitFor } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { makeFakeClient } from "../../__tests__/helpers/fake-client.js";
import { PraxisClientProvider } from "../../context/client-context.js";
import { useConceptNames } from "../use-concept-names.js";

function wrapper(
  client: PraxisClient,
): (props: { children: React.ReactNode }) => React.ReactElement {
  return ({ children }) => <PraxisClientProvider client={client}>{children}</PraxisClientProvider>;
}

const COURSE_ID = brandId<"CourseId">("course-1");

const fakeConcepts = [
  {
    id: "c1",
    graphId: "g.c1",
    name: "Variables",
    description: "named placeholders",
    aliases: [],
    standardsTags: [],
  },
  {
    id: "c2",
    graphId: "g.c2",
    name: "Constants",
    description: "fixed values",
    aliases: ["literal"],
    standardsTags: [],
  },
];

describe("useConceptNames", () => {
  it("returns the concepts loaded from client.artifacts.concepts", async () => {
    const client = makeFakeClient({
      artifacts: {
        concepts: vi.fn().mockResolvedValue(fakeConcepts),
      } as unknown as PraxisClient["artifacts"],
    });

    const { result } = renderHook(() => useConceptNames(COURSE_ID), { wrapper: wrapper(client) });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.concepts).toHaveLength(2);
    expect(result.current.getName("c1")).toBe("Variables");
  });

  it("getName returns the id itself for unknown ids (fallback)", async () => {
    const client = makeFakeClient({
      artifacts: {
        concepts: vi.fn().mockResolvedValue(fakeConcepts),
      } as unknown as PraxisClient["artifacts"],
    });

    const { result } = renderHook(() => useConceptNames(COURSE_ID), { wrapper: wrapper(client) });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.getName("missing-id")).toBe("missing-id");
    expect(result.current.getById("missing-id")).toBeNull();
  });

  it("undefined courseId resolves to empty state without firing IPC", async () => {
    const spy = vi.fn();
    const client = makeFakeClient({
      artifacts: {
        concepts: spy,
      } as unknown as PraxisClient["artifacts"],
    });

    const { result } = renderHook(() => useConceptNames(undefined), { wrapper: wrapper(client) });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.concepts).toEqual([]);
    expect(result.current.getName("anything")).toBe("anything");
    expect(spy).not.toHaveBeenCalled();
  });

  it("changing courseId triggers a refetch", async () => {
    const spy = vi.fn().mockResolvedValue(fakeConcepts);
    const client = makeFakeClient({
      artifacts: {
        concepts: spy,
      } as unknown as PraxisClient["artifacts"],
    });

    const { result, rerender } = renderHook(({ id }) => useConceptNames(id), {
      initialProps: { id: COURSE_ID as CourseId | undefined },
      wrapper: wrapper(client),
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(spy).toHaveBeenCalledTimes(1);

    const otherCourse = brandId<"CourseId">("course-2");
    rerender({ id: otherCourse });
    await waitFor(() => expect(spy).toHaveBeenCalledTimes(2));
    expect(spy).toHaveBeenLastCalledWith(otherCourse);
  });
});
