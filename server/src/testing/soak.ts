// The check's soak (slice 3's plan, 3i), run by soak.test.ts in a process of its own with --expose-gc:
// 100,000 messages through the queue and the checker, half from accounts never seen again (addresses are
// free), a fake provider answering at once, and the heap after a collection at each of 10 checkpoints,
// printed as JSON. LEAK=1 keeps every message, the control that shows the bound can fail.
import { openDatabase } from "@gnoworld/service/db";
import { logger } from "@gnoworld/service/log";
import { LOGIN_TABLES } from "../login/login.ts";
import { makeChecker, VERDICT_TABLES } from "../moderation/check.ts";
import { makeQueue } from "../moderation/queue.ts";
import { STRIKE_TABLES } from "../moderation/strikes.ts";
import { answer } from "./answers.ts";

const PEPPER = "a-pepper-of-forty-characters-0123456789";
const log = logger(PEPPER, () => true);
// The verdicts' index by account as main opens them: a line's rate reads it (3k).
const db = openDatabase(":memory:", [LOGIN_TABLES, VERDICT_TABLES, STRIKE_TABLES]);
const nothing = answer();
const check = makeChecker({
  db,
  rulesOf: () => ({ bannedWords: ["spam"], linksPerMessage: 3, mentionsPerMessage: 5, linksForNewAccount: 2 }),
  provider: () => Promise.resolve(nothing),
  thresholds: {},
  pepper: PEPPER,
  log,
});
const queue = makeQueue({
  run: async (said: Parameters<typeof check>[0]) => {
    await check(said);
  },
  cap: 20_000,
  log,
});
const gc = Reflect.get(globalThis, "gc") as () => void;
const heaps: number[] = [];
const kept: unknown[] = [];
for (let checkpoint = 0; checkpoint < 10; checkpoint += 1) {
  for (let n = 0; n < 10_000; n += 1) {
    const msgid = `m${String(checkpoint)}-${String(n)}`;
    const account = n % 2 === 0 ? `a${String(n % 500)}` : `fresh-${msgid}`;
    const said = { room: "#bubble", account, msgid, text: "hi there, a message of some length" };
    if (process.env["LEAK"] === "1") kept.push(said);
    queue.push(said);
  }
  await queue.idle();
  gc();
  heaps.push(process.memoryUsage().heapUsed);
}
queue.stop();
db.close();
process.stdout.write(JSON.stringify(heaps));
