import { afterEach, describe, expect, it } from "vitest";
import { hideFor } from "./ergoHide.ts";
import { AUTHOR } from "./ergoPins.ts";
import { cleanUp, join, login, say, start } from "./ergoKit.ts";

// An owner's hide over the real Ergo (F13332): a right in #bubble/games is none over the lines of #bubble.
afterEach(cleanUp);

describe("an owner hides a line", { timeout: 40_000 }, () => {
  it("hides no line of another room: its own room named with #bubble's id is refused, the line kept", async () => {
    const e = await start();
    const t = await hideFor(e);
    const alice = await login(e, AUTHOR);
    await join(alice, "#bubble");
    const id = await say(alice, "#bubble", "said in the main room");
    const response = await t.hide("#bubble/games", [id]);
    expect([response.status, await response.json()]).toEqual([404, { error: "not_found" }]);
    expect(await t.chat.line("#bubble", id)).toMatchObject({
      room: "#bubble",
      msgid: id,
      text: "said in the main room",
    });
  });

  it("hides a line of the room its right is in, through the link's REDACT", async () => {
    const e = await start();
    const t = await hideFor(e);
    const alice = await login(e, AUTHOR);
    await join(alice, "#bubble/games");
    const id = await say(alice, "#bubble/games", "a line to take out");
    expect((await t.hide("#bubble/games", [id])).status).toBe(200);
    await alice.expect(new RegExp(` REDACT #bubble/games ${id}`));
  });
});
