import { describe, expect, it, vi } from "vitest";
import { useTempDb } from "../../../../../tests/helpers/db-setup.js";
import {
  inMemorySecretStorage,
  noopDocumentScopes,
  noopLockService,
  noopLogger,
} from "../../../../../tests/helpers/mocks.js";
import { openDb } from "../../db/index.js";
import type {
  Engine,
  EngineEvent,
  EngineOpenOptions,
  EngineSession,
  IndexerOrchestrator,
  Mode,
} from "../../types/index.js";
import { SessionServiceImpl } from "../session-service.js";
import type { ServiceDeps } from "../types.js";

const dbCtx = useTempDb();

function makeTeachMode(): Mode {
  return {
    id: "teach",
    label: "Teach",
    displayName: "teach",
    description: "Open tutoring session.",
    requiredRole: "student",
    uiSurface: "chat",
    toolNames: [],
    promptFragments: [],
  };
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

async function collect(stream: AsyncIterable<EngineEvent>): Promise<EngineEvent[]> {
  const events: EngineEvent[] = [];
  for await (const event of stream) {
    events.push(event);
  }
  return events;
}

function makeService(
  engine: Engine,
  opts?: { indexerOrchestrator?: IndexerOrchestrator },
): SessionServiceImpl {
  const { db } = openDb({ path: dbCtx.dbPath });
  const deps: ServiceDeps = {
    db,
    log: noopLogger(),
    modes: new Map([["teach", makeTeachMode()]]),
    toolDefinitions: [],
    toolServices: {
      documentScopes: noopDocumentScopes(),
      artifacts: {
        evaluateAndPersistGates: vi.fn().mockResolvedValue({ unlockedGateIds: [] }),
      },
    } as unknown as ServiceDeps["toolServices"],
    lockService: noopLockService(),
    engineFactory: () => engine,
    secretStorage: inMemorySecretStorage(),
    ...(opts?.indexerOrchestrator !== undefined && {
      indexerOrchestrator: opts.indexerOrchestrator,
    }),
  };

  return new SessionServiceImpl(deps);
}

describe("SessionServiceImpl concurrency", () => {
  it("rejects a second same-session send while one turn is in flight", async () => {
    const sendStarted = deferred();
    const releaseSend = deferred();
    const send = vi.fn().mockImplementation(async function* () {
      sendStarted.resolve();
      await releaseSend.promise;
      yield { type: "final", usage: { inputTokens: 1, outputTokens: 1 } } satisfies EngineEvent;
    });
    const handle: EngineSession = {
      id: "engine-session-1",
      send,
      close: vi.fn().mockResolvedValue(undefined),
    };
    const engine: Engine = {
      id: "claude-code",
      kind: "looped",
      health: vi.fn(),
      open: vi.fn().mockImplementation(async (_opts: EngineOpenOptions) => handle),
    };
    const svc = makeService(engine);
    const session = await svc.start({ modeId: "teach" });

    const first = collect(svc.send(session.sessionId, "first"));
    await sendStarted.promise;

    const second = await collect(svc.send(session.sessionId, "second"));
    releaseSend.resolve();
    await first;

    expect(send).toHaveBeenCalledTimes(1);
    expect(second).toHaveLength(1);
    expect(second[0]).toMatchObject({
      type: "error",
      error: { code: "session.turn_in_flight" },
    });
  });
});
