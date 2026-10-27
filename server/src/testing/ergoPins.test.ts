import { afterEach, describe, expect, it } from "vitest";
import { answer } from "./answers.ts";
import { AUTHOR, gate, MOD, pinsFor } from "./ergoPins.ts";
import { cleanUp, join, login, say, start, sync } from "./ergoKit.ts";

// Slice 4's 4d, pins, over the real Ergo (docs/plans/slice-4.md §7): a moderator pins a line by its id, the server
// reads its text from Ergo, a deleted or hidden line leaves the pins, and they outlast the chat's own restart.
afterEach(cleanUp);

describe("a moderator pins a line", { timeout: 40_000 }, () => {
  it("keeps the line as Ergo holds it, whatever the page said, and shows it to a guest", async () => {
    const e = await start();
    const { list, pin } = await pinsFor(e);
    const alice = await login(e, AUTHOR);
    await join(alice, "#bubble");
    const id = await say(alice, "#bubble", "Welcome. Be kind.");
    const response = await pin("#bubble", id);
    expect(response.status).toBe(200);
    const [pinned] = (await list("#bubble")).pins;
    expect(pinned).toMatchObject({ id, account: AUTHOR, text: "Welcome. Be kind." });
    expect(pinned?.time).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
    // A guest reads it and may not pin; the author is no moderator.
    expect((await list("#bubble")).may).toBe(false);
    expect((await list("#bubble", "mod")).may).toBe(true);
    expect((await pin("#bubble", id, "author")).status).toBe(403);
  });

  it("pins nothing for a line Ergo does not hold, nor for another room's line", async () => {
    const e = await start();
    const { list, pin } = await pinsFor(e);
    const alice = await login(e, AUTHOR);
    await join(alice, "#bubble");
    const id = await say(alice, "#bubble", "said in the main room");
    expect((await pin("#bubble", "no-such-line")).status).toBe(404);
    // Its id is real, its room is not the one it was said in: Ergo's AROUND finds nothing there.
    expect((await pin("#bubble/games", id)).status).toBe(404);
    expect((await list("#bubble")).pins).toEqual([]);
  });

  // A room the link is not in is not asked: Ergo would answer an empty batch for a channel it does not hold, which
  // reads as a line gone. The moderator is told it could not be asked.
  it("says Ergo could not be asked, not that the line is gone, for a room the link is not in", async () => {
    const e = await start();
    const { pin } = await pinsFor(e);
    const response = await pin("#bubble/elsewhere", "any-line");
    expect([response.status, await response.json()]).toEqual([503, { error: "not_ready" }]);
  });

  it("drops the pin when its author deletes the line, for every reader", async () => {
    const e = await start();
    const { list, pin } = await pinsFor(e);
    const alice = await login(e, AUTHOR);
    await join(alice, "#bubble");
    const id = await say(alice, "#bubble", "I will take this back");
    await pin("#bubble", id);
    expect((await list("#bubble")).pins).toHaveLength(1);
    alice.send(`REDACT #bubble ${id}`);
    await alice.expect(new RegExp(` REDACT #bubble ${id}`));
    await sync(alice);
    await expect.poll(async () => (await list("#bubble")).pins, { timeout: 10_000 }).toEqual([]);
  });

  // The bot's own hide comes back to it as a REDACT of its own: a pin made while the line's check was held goes with
  // the hide (4d's R1). Pinning after the hide is another case, below.
  it("drops the pin when the bot hides the line after it was pinned", async () => {
    const e = await start();
    const held = gate();
    const provider = (text: string) =>
      text.includes("hurt")
        ? held.open.then(() => answer({ violence: true }, { violence: 0.99 }))
        : Promise.resolve(answer());
    const { list, pin } = await pinsFor(e, { provider });
    const alice = await login(e, AUTHOR);
    await join(alice, "#bubble");
    const id = await say(alice, "#bubble", "I will hurt you");
    expect((await pin("#bubble", id)).status).toBe(200);
    expect((await list("#bubble")).pins.map((each) => each.id)).toEqual([id]);
    held.release();
    await alice.expect(new RegExp(` REDACT #bubble ${id} `), 10_000);
    await expect.poll(async () => (await list("#bubble")).pins, { timeout: 10_000 }).toEqual([]);
  });

  // The author's edit replaces the line; the pin held the older text, which the author may have taken back (R6). Another
  // account's edit of it, which the bot would refuse as a correction, is no one's to unpin it by.
  it("drops the pin when its author edits the line, and keeps it for another account's edit", async () => {
    const e = await start();
    const { list, pin } = await pinsFor(e);
    const alice = await login(e, AUTHOR);
    const moderator = await login(e, MOD);
    await join(alice, "#bubble");
    await join(moderator, "#bubble");
    const id = await say(alice, "#bubble", "first words");
    await pin("#bubble", id);
    moderator.send(`@+gnoworld/edit=${id} PRIVMSG #bubble :someone else's correction`);
    await sync(moderator);
    await say(alice, "#bubble", "a line after, so the bot has heard the edit");
    await sync(alice);
    expect((await list("#bubble")).pins.map((each) => each.id)).toEqual([id]);
    alice.send(`@+gnoworld/edit=${id} PRIVMSG #bubble :second words`);
    await expect.poll(async () => (await list("#bubble")).pins, { timeout: 10_000 }).toEqual([]);
  });

  it("cannot pin a line the bot already hid", async () => {
    const e = await start();
    const { list, pin } = await pinsFor(e);
    const alice = await login(e, AUTHOR);
    await join(alice, "#bubble");
    const hidden = await say(alice, "#bubble", "I will hurt you");
    await alice.expect(new RegExp(` REDACT #bubble ${hidden} `), 10_000);
    expect((await pin("#bubble", hidden)).status).toBe(404);
    expect((await list("#bubble")).pins).toEqual([]);
  });

  it("holds its pins across the chat's restart on the same database", async () => {
    const e = await start();
    const first = await pinsFor(e);
    const alice = await login(e, AUTHOR);
    await join(alice, "#bubble");
    const id = await say(alice, "#bubble", "keep this one");
    await first.pin("#bubble", id);
    const { db } = first;
    await first.stop();
    const again = await pinsFor(e, { db });
    expect((await again.list("#bubble")).pins.map((each) => each.id)).toEqual([id]);
  });

  // Ergo keeps no event for a REDACT and replays none: a delete made while the chat was down is seen only by asking
  // Ergo for each pin again once the link is back in the room (4d's R5, docs/decisions.md, 2026-10-27).
  it("drops a pin whose line its author deleted while the chat was down, and keeps the others", async () => {
    const e = await start();
    const first = await pinsFor(e);
    const alice = await login(e, AUTHOR);
    await join(alice, "#bubble");
    const [gone, kept] = [await say(alice, "#bubble", "taken back later"), await say(alice, "#bubble", "stays")];
    await first.pin("#bubble", gone);
    await first.pin("#bubble", kept);
    const { db } = first;
    await first.stop();
    alice.send(`REDACT #bubble ${gone}`);
    await alice.expect(new RegExp(` REDACT #bubble ${gone}`));
    const again = await pinsFor(e, { db });
    await expect
      .poll(async () => (await again.list("#bubble")).pins.map((each) => each.id), { timeout: 10_000 })
      .toEqual([kept]);
  });
});
