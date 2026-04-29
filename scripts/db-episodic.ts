import { openDb } from "@praxis/core/db";
import { episodicEvents, sessions } from "@praxis/memory/schema";
import { desc, eq } from "drizzle-orm";

const { db } = openDb({ readonly: true });
const recentSessions = db.select().from(sessions).orderBy(desc(sessions.startedAt)).limit(10).all();

for (const sess of recentSessions) {
  console.log(
    `\n## Session ${sess.id}  (${sess.engineId} / ${sess.modeId})  ${sess.startedAt.toISOString()}`,
  );
  const events = db
    .select()
    .from(episodicEvents)
    .where(eq(episodicEvents.sessionId, sess.id))
    .orderBy(episodicEvents.ts)
    .all();
  for (const e of events) {
    const ev = e.eventJson as { type: string };
    console.log(`  [${e.ts.toISOString()}]  turn=${e.turnIndex}  ${ev.type}`);
  }
}
