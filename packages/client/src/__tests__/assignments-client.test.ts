import { brandId } from "@praxis/core/types";
import { describe, expect, it } from "vitest";
import { createPraxisClient } from "../client.js";
import type { ClientTransport } from "../transport/types.js";

const ASSIGNMENT_ID = brandId<"AssignmentId">("assign-1");
const COURSE_ID = brandId<"CourseId">("course-1");

function makeTransport(): {
  transport: ClientTransport;
  invokedChannels: Array<{ channel: string; args: unknown[] }>;
} {
  const invokedChannels: Array<{ channel: string; args: unknown[] }> = [];
  const transport: ClientTransport = {
    invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
      invokedChannels.push({ channel, args });
      return Promise.resolve(undefined as unknown as T);
    },
    stream<T>(channel: string, ...args: unknown[]): AsyncIterable<T> {
      return {
        [Symbol.asyncIterator]() {
          return { next: () => Promise.resolve({ done: true, value: undefined as T }) };
        },
      };
    },
  };
  return { transport, invokedChannels };
}

describe("AssignmentsClient", () => {
  it("get routes to praxis.assignments.get", async () => {
    const { transport, invokedChannels } = makeTransport();
    const client = createPraxisClient(transport);
    await client.assignments.get({ assignmentId: ASSIGNMENT_ID });
    expect(invokedChannels[0]?.channel).toBe("praxis.assignments.get");
    expect(invokedChannels[0]?.args[0]).toEqual({ assignmentId: ASSIGNMENT_ID });
  });

  it("list routes to praxis.assignments.list", async () => {
    const { transport, invokedChannels } = makeTransport();
    const client = createPraxisClient(transport);
    await client.assignments.list({ courseId: COURSE_ID });
    expect(invokedChannels[0]?.channel).toBe("praxis.assignments.list");
  });

  it("list with kind routes to praxis.assignments.list with kind", async () => {
    const { transport, invokedChannels } = makeTransport();
    const client = createPraxisClient(transport);
    await client.assignments.list({ courseId: COURSE_ID, kind: "quiz" });
    expect(invokedChannels[0]?.args[0]).toEqual({ courseId: COURSE_ID, kind: "quiz" });
  });

  it("recordResponse routes to praxis.assignments.recordResponse", async () => {
    const { transport, invokedChannels } = makeTransport();
    const client = createPraxisClient(transport);
    await client.assignments.recordResponse({
      assignmentId: ASSIGNMENT_ID,
      itemId: "item-1",
      response: "42",
    });
    expect(invokedChannels[0]?.channel).toBe("praxis.assignments.recordResponse");
  });

  it("getResponses routes to praxis.assignments.getResponses", async () => {
    const { transport, invokedChannels } = makeTransport();
    const client = createPraxisClient(transport);
    await client.assignments.getResponses({ assignmentId: ASSIGNMENT_ID });
    expect(invokedChannels[0]?.channel).toBe("praxis.assignments.getResponses");
  });

  it("submit routes to praxis.assignments.submit", async () => {
    const { transport, invokedChannels } = makeTransport();
    const client = createPraxisClient(transport);
    await client.assignments.submit({ assignmentId: ASSIGNMENT_ID });
    expect(invokedChannels[0]?.channel).toBe("praxis.assignments.submit");
    expect(invokedChannels[0]?.args[0]).toEqual({ assignmentId: ASSIGNMENT_ID });
  });

  it("client has assignments property", () => {
    const { transport } = makeTransport();
    const client = createPraxisClient(transport);
    expect(client.assignments).toBeDefined();
  });
});
