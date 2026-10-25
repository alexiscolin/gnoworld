import { afterEach, describe, expect, it } from "vitest";
import type { Rules } from "../roles/roles.ts";
import { openDatabase } from "../db.ts";
import type { Raw } from "./rawClient.ts";
import { cleanUp, guest, join, login, msgid, oper, say, start, stops, sync } from "./ergoKit.ts";
import { chatFor, RULES, TABLES } from "./ergoChat.ts";

// The chat over the real Ergo (3j to 3m): the bot hides, catches up, mutes, makes rooms and keeps them.

afterEach(cleanUp);

describe("the bot acts (3j)", { timeout: 40_000 }, () => {
  it("hides the flagged message by its own id for everyone in the room, its author an address, a clean one kept", async () => {
    const e = await start();
    const { verdicts } = await chatFor(e, []);
    const author = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
    const alice = await login(e, author);
    await join(alice, "#bubble");
    const bob = await login(e, "bob");
    await join(bob, "#bubble");
    const clean = await say(alice, "#bubble", "hello");
    const flagged = await say(alice, "#bubble", "I will hurt you");
    await bob.expect(new RegExp(` REDACT #bubble ${flagged} violence`));
    await alice.expect(
      new RegExp(
        `NOTICE ${author} :Your message in #bubble was hidden: violence\\. The rules: https://gno\\.world/rules`,
      ),
    );
    await expect.poll(() => verdicts().length).toBe(2);
    await sync(bob);
    expect(bob.lines().filter((line) => line.includes(` REDACT #bubble ${clean}`))).toEqual([]);
  });

  it("checks what it missed while its link was down, each message once, after a mark Ergo has erased", async () => {
    const e = await start();
    const asked: string[] = [];
    const db = openDatabase(":memory:", TABLES);
    const first = await chatFor(e, asked, { db });
    const verdicts = first.verdicts;
    stops.push(() => {
      db.close();
      return Promise.resolve();
    });
    const alice = await login(e, "alice");
    await join(alice, "#bubble");
    // The mark is a hidden line, which the REDACT takes out of Ergo's history.
    const hidden = await say(alice, "#bubble", "I will hurt you");
    await alice.expect(new RegExp(` REDACT #bubble ${hidden} `));
    await expect.poll(() => verdicts().length).toBe(1);
    // Its link down: the chat stopped, then started again on its database.
    await first.stop();
    await alice.expect(/:gnoworld!\S+ QUIT /);
    for (const text of ["one", "two", "three"]) alice.send(`PRIVMSG #bubble :${text}`);
    await sync(alice);
    await chatFor(e, asked, { db });
    await expect.poll(() => asked.toSorted(), { timeout: 15_000 }).toEqual(["I will hurt you", "one", "three", "two"]);
    expect(verdicts()).toHaveLength(4);
    await sync(alice);
    expect(asked).toHaveLength(4);
  });

  it("mutes an account hidden three times, others still speaking; a restart keeps, puts back or lifts it (3k)", async () => {
    const e = await start();
    const clock = { now: Date.now() };
    const db = openDatabase(":memory:", TABLES);
    const restart = (): ReturnType<typeof chatFor> => chatFor(e, [], { db, now: () => clock.now, tickMs: 50 });
    const first = await restart();
    const bob = await login(e, "bob");
    const alice = await login(e, "alice");
    const bobby = await login(e, "bobby");
    for (const c of [bob, alice, bobby]) await join(c, "#bubble");
    for (const n of [1, 2]) await say(bob, "#bubble", `I will hurt you ${String(n)}`);
    // Its echo not awaited: Ergo may send bob the mute before it, and expect reads on past what it matched.
    bob.send("PRIVMSG #bubble :I will hurt you 3");
    await bob.expect(/ MODE #bubble \+b m:bob/);
    bob.send("PRIVMSG #bubble :muted now");
    await bob.expect(/ 404 bob #bubble :Cannot send to channel/);
    bob.send("@+draft/react=x TAGMSG #bubble");
    await bob.expect(/ 404 bob #bubble :Cannot send to channel/);
    await say(alice, "#bubble", "alice speaks");
    await say(bobby, "#bubble", "bobby speaks");
    // A restart with the ban still in Ergo's list: put on again, bob stays muted.
    await first.stop();
    const second = await restart();
    bob.send("PRIVMSG #bubble :still muted");
    await bob.expect(/ 404 bob #bubble :Cannot send to channel/);
    // As if Ergo lost its list: the next start puts the live mute back.
    await second.stop();
    const chief = await oper(e, "chief");
    chief.send("SAMODE #bubble -b m:bob");
    await bob.expect(/ MODE #bubble -b m:bob/);
    const third = await restart();
    await bob.expect(/ MODE #bubble \+b m:bob/);
    // A start after the mute's end lifts it.
    await third.stop();
    clock.now += 5 * 60_000;
    await restart();
    // Closed once every chat has stopped: the cleanups run in turn.
    stops.push(() => {
      db.close();
      return Promise.resolve();
    });
    await bob.expect(/ MODE #bubble -b m:bob/);
    await say(bob, "#bubble", "speaking again");
  });

  it("hides an edit of another's line in Ergo, and keeps an own edit (3k)", async () => {
    const e = await start();
    const { verdicts } = await chatFor(e, []);
    const alice = await login(e, "alice");
    await join(alice, "#bubble");
    const bob = await login(e, "bob");
    await join(bob, "#bubble");
    const original = await say(alice, "#bubble", "hello");
    bob.send(`@+gnoworld/edit=${original} PRIVMSG #bubble :forged`);
    const forged = msgid(await bob.expect(/PRIVMSG #bubble :forged$/));
    await alice.expect(new RegExp(` REDACT #bubble ${forged} :an edit of a message that is not yours`));
    alice.send(`@+gnoworld/edit=${original} PRIVMSG #bubble :hello, fixed`);
    const fixed = msgid(await alice.expect(/PRIVMSG #bubble :hello, fixed$/));
    await expect.poll(() => verdicts().length).toBe(3);
    await sync(alice);
    expect(alice.lines().filter((line) => line.includes(` REDACT #bubble ${fixed}`))).toEqual([]);
  });

  it("makes a moderator's room in Ergo: an account speaks there, a guest reads, a plain account makes none (3l)", async () => {
    const e = await start();
    const { chat } = await chatFor(e, []);
    expect(chat.rooms.create("bubble", "garden")).toEqual({ made: "#bubble/garden" });
    const alice = await login(e, "alice");
    const watcher = await oper(e, "watcher");
    for (;;) {
      watcher.send("NAMES #bubble/garden");
      const names = await watcher.expect(/ (353|366) \S+ (= )?#bubble\/garden /);
      if (names.includes(" 353 ") && names.includes("gnoworld")) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    await join(alice, "#bubble/garden");
    await say(alice, "#bubble/garden", "hello garden");
    const gus = await guest(e, "gus");
    await join(gus, "#bubble/garden");
    gus.send("PRIVMSG #bubble/garden :hello from a guest");
    await gus.expect(/ 404 gus #bubble\/garden :Cannot send to channel \(\+M\)/);
    alice.send("JOIN #bubble/sneaky");
    await alice.expect(/ 403 alice #bubble\/sneaky :Only server operators can create new channels/);
  });

  it("makes a room again that Ergo lost, with its modes, and raises the alert for one it did not make (3l)", async () => {
    const e = await start();
    const db = openDatabase(":memory:", TABLES);
    db.prepare("INSERT INTO rooms (name, world, created_at) VALUES ('#bubble/garden', 'bubble', 0)").run();
    const chief = await oper(e, "chief");
    await join(chief, "#rogue");
    const lines: string[] = [];
    await chatFor(e, [], { db, lines });
    stops.push(() => {
      db.close();
      return Promise.resolve();
    });
    const gus = await guest(e, "gus");
    await join(gus, "#bubble/garden");
    gus.send("MODE #bubble/garden");
    await gus.expect(/ 324 gus #bubble\/garden \+\S*M/);
    await expect.poll(() => lines.filter((line) => line.includes('"unknown_room"'))).toHaveLength(1);
  });

  it("archives a room in Ergo: no one speaks there, a plain list leaves it out, a restart keeps both (3l)", async () => {
    const e = await start();
    const db = openDatabase(":memory:", TABLES);
    const first = await chatFor(e, [], { db });
    first.chat.rooms.create("bubble", "garden");
    const alice = await login(e, "alice");
    const watcher = await oper(e, "watcher");
    for (;;) {
      watcher.send("NAMES #bubble/garden");
      const names = await watcher.expect(/ (353|366) \S+ (= )?#bubble\/garden /);
      if (names.includes(" 353 ") && names.includes("gnoworld")) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    await join(alice, "#bubble/garden");
    await say(alice, "#bubble/garden", "before");
    expect(first.chat.rooms.archive("bubble", "garden")).toBe("archived");
    await alice.expect(/ MODE #bubble\/garden \+s/);
    alice.send("PRIVMSG #bubble/garden :after");
    await alice.expect(/ 404 alice #bubble\/garden :Cannot send to channel \(\+m\)/);
    const gus = await guest(e, "gus");
    const listed = async (): Promise<string> => {
      gus.send("LIST");
      await gus.expect(/ 323 /);
      return gus.lines().join("\n");
    };
    expect(await listed()).not.toContain("#bubble/garden");
    await first.stop();
    const chief = await oper(e, "chief");
    chief.send("SAMODE #bubble/garden -ms");
    await alice.expect(/ MODE #bubble\/garden -ms/);
    await chatFor(e, [], { db });
    stops.push(() => {
      db.close();
      return Promise.resolve();
    });
    await alice.expect(/ MODE #bubble\/garden \+s/);
    alice.send("PRIVMSG #bubble/garden :still archived");
    await alice.expect(/ 404 alice #bubble\/garden :Cannot send to channel \(\+m\)/);
  });

  describe("rooms by role on real Ergo (3m)", () => {
    const typed = (rules: Rules = RULES) =>
      new Map([
        [
          "bubble",
          {
            rules,
            moderators: new Set(["mod"]),
            groups: new Map([
              ["crew", new Set(["member"])],
              ["pens", new Set(["writer"])],
            ]),
            rooms: new Map([
              ["#bubble/news", { type: "announcement" as const, hidden: false }],
              ["#bubble/door", { type: "accounts" as const, hidden: true }],
              ["#bubble/crew", { type: "members" as const, readers: "crew", hidden: false }],
              ["#bubble/desk", { type: "members-write" as const, readers: "crew", writers: "pens", hidden: false }],
            ]),
          },
        ],
      ]);
    // Ergo, the chat with the typed rooms, and five people: a guest, a stranger, a member, a writer, a moderator.
    const escaped = (room: string) => room.replace("/", "\\/");
    // A room's invite list as an operator lists it: Ergo shows it to a channel operator or by SAMODE alone.
    const invitesOf = async ([nick, c]: [string, Raw], room: string): Promise<string[]> => {
      const mark = c.lines().length;
      c.send(`SAMODE ${room} I`);
      await c.expect(new RegExp(` 347 ${nick} ${escaped(room)} `));
      return c
        .lines()
        .slice(mark)
        .flatMap((line) => new RegExp(` 346 ${nick} ${escaped(room)} (\\S+)`).exec(line)?.slice(1) ?? []);
    };
    const typedRooms = async (more: { reconcileMs?: number; lines?: string[] } = {}) => {
      const e = await start();
      await chatFor(e, [], {
        worlds: typed(),
        reconcileMs: more.reconcileMs ?? 1000,
        ...(more.lines ? { lines: more.lines } : {}),
      });
      // Ready once both members rooms list their member: a hundred tries 50 ms apart.
      const lookout: [string, Raw] = ["lookout", await oper(e, "lookout")];
      for (let n = 0; ; n += 1) {
        const lists = [await invitesOf(lookout, "#bubble/crew"), await invitesOf(lookout, "#bubble/desk")];
        if (lists.every((list) => list.includes("member!*@*"))) break;
        if (n === 100) throw new Error("the members rooms never listed their member");
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      const gus = await guest(e, "gus");
      const people: [string, Raw][] = [["gus", gus]];
      for (const name of ["stranger", "member", "writer", "mod"]) people.push([name, await login(e, name)]);
      return { e, people };
    };
    // Joins: the room's names, or a refusal (473 invite only, 477 accounts only).
    const joins = async (c: Raw, nick: string, room: string): Promise<boolean> => {
      c.send(`JOIN ${room}`);
      return (await c.expect(new RegExp(` (366|473|477) ${nick} ${escaped(room)} `))).includes(" 366 ");
    };
    const speaks = async (c: Raw, nick: string, room: string): Promise<boolean> => {
      const text = `${nick} speaks`;
      c.send(`PRIVMSG ${room} :${text}`);
      return !(await c.expect(new RegExp(`(PRIVMSG ${escaped(room)} :${text}$| 404 ${nick} )`))).includes(" 404 ");
    };
    // Reads: the room's history holds a line said there, or Ergo answers nothing of it.
    const reads = async (c: Raw, nick: string, room: string): Promise<boolean> => {
      c.send(`CHATHISTORY LATEST ${room} * 10`);
      const answer = await c.expect(new RegExp(`(speaks$| FAIL CHATHISTORY | 403 ${nick} |BATCH -)`));
      return answer.endsWith("speaks");
    };
    // gus (a guest), stranger, member, writer, mod: [joins, speaks]; the type's voiced wait for their voice.
    const matrix = async (people: [string, Raw][], room: string, voiced: readonly string[] = []) => {
      const seen: [boolean, boolean][] = [];
      for (const [nick, c] of people) {
        const joined = await joins(c, nick, room);
        if (joined && voiced.includes(nick)) await c.expect(new RegExp(` MODE ${escaped(room)} \\+v ${nick}`));
        seen.push([joined, joined && (await speaks(c, nick, room))]);
      }
      return seen;
    };

    // One Ergo for the four types, each checked softly: a type that fails hides none of the others.
    it(
      "gives each type its people: who joins, who speaks, who reads its history, who sees it listed",
      { timeout: 20_000 },
      async () => {
        const { people } = await typedRooms();
        const client = (at: number): Raw => {
          const c = people[at]?.[1];
          if (c === undefined) throw new Error("no such client");
          return c;
        };
        const [gus, member] = [client(0), client(2)];
        // Announcement: open to all, its moderators alone speaking, a reaction refused.
        const news = [
          [true, false],
          [true, false],
          [true, false],
          [true, false],
          [true, true],
        ];
        expect.soft(await matrix(people, "#bubble/news", ["mod"]), "announcement").toEqual(news);
        member.send("@+draft/react=x TAGMSG #bubble/news");
        await member.expect(/ 404 member #bubble\/news /);
        // Accounts: no guest, every account speaking, in no list.
        const door = [
          [false, false],
          [true, true],
          [true, true],
          [true, true],
          [true, true],
        ];
        expect.soft(await matrix(people, "#bubble/door"), "accounts").toEqual(door);
        const mark = gus.lines().length;
        gus.send("LIST");
        await gus.expect(/ 323 /);
        expect.soft(gus.lines().slice(mark).join("\n"), "listed").not.toContain("#bubble/door");
        // Members: its members and moderators alone, and its history to them alone.
        const crew = [
          [false, false],
          [false, false],
          [true, true],
          [false, false],
          [true, true],
        ];
        expect.soft(await matrix(people, "#bubble/crew"), "members").toEqual(crew);
        const read = [];
        for (const [nick, c] of people) read.push(await reads(c, nick, "#bubble/crew"));
        expect.soft(read, "history").toEqual([false, false, true, false, true]);
        // Members-write: its readers in, its writers and moderators alone speaking.
        const desk = [
          [false, false],
          [false, false],
          [true, false],
          [true, true],
          [true, true],
        ];
        expect.soft(await matrix(people, "#bubble/desk", ["writer", "mod"]), "members-write").toEqual(desk);
      },
    );

    it("joins its closed rooms again after a restart, a member still in one, and hides there", async () => {
      const e = await start();
      const db = openDatabase(":memory:", TABLES);
      const restart = () =>
        chatFor(e, [], { worlds: typed({ ...RULES, bannedWords: ["spam"] }), db, reconcileMs: 300 });
      const first = await restart();
      const member = await login(e, "member");
      // In once the reconciler has put the member on the invite list: a hundred tries 50 ms apart.
      for (let n = 0; !(await joins(member, "member", "#bubble/crew")); n += 1) {
        if (n === 100) throw new Error("the member never got in");
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      // Whether the bot is in the closed room, as its member sees it.
      const botIn = async (): Promise<boolean> => {
        member.send("NAMES #bubble/crew");
        const names = await member.expect(/ (353|366) member [=@ ]*#bubble\/crew /);
        return / 353 member [=@] #bubble\/crew :.*gnoworld/.test(names);
      };
      // Gone, then back: the room kept its member and its flags, and the bot is the new chat's.
      await first.stop();
      await expect.poll(botIn, { timeout: 5000, interval: 50 }).toBe(false);
      await restart();
      await expect.poll(botIn, { timeout: 5000, interval: 50 }).toBe(true);
      const flagged = await say(member, "#bubble/crew", "buy spam");
      await member.expect(new RegExp(` REDACT #bubble/crew ${flagged} `));
      // Its list read without a channel operator's power: an operator's wildcard is taken off.
      const chief = await oper(e, "chief");
      chief.send("SAMODE #bubble/crew +I *!*@*");
      await expect.poll(() => invitesOf(["chief", chief], "#bubble/crew"), { timeout: 5000 }).not.toContain("*!*@*");
      // Closed once every chat has stopped: the cleanups run in turn.
      stops.push(() => {
        db.close();
        return Promise.resolve();
      });
    });

    it("undoes an operator's drift, a wildcard invite included, and asks nothing more once the rooms are so", async () => {
      const lines: string[] = [];
      const { e, people } = await typedRooms({ reconcileMs: 150, lines });
      const gus = people[0]?.[1];
      if (gus === undefined) throw new Error("no guest");
      // Settled: two passes in a row change nothing.
      const changed = () => lines.filter((line) => line.includes('"room_reconciled"')).length;
      await expect
        .poll(
          async () => {
            const before = changed();
            await new Promise((resolve) => setTimeout(resolve, 350));
            return changed() === before;
          },
          { timeout: 10_000 },
        )
        .toBe(true);
      const chief = await oper(e, "chief");
      chief.send("SAMODE #bubble/crew +I *!*@*");
      chief.send("SAMODE #bubble/crew -i");
      // Closed again, the wildcard gone: the room's modes as a guest reads them, its list as the chief does.
      const shut = async (): Promise<boolean> => {
        gus.send("MODE #bubble/crew");
        const modes = await gus.expect(/ 324 gus #bubble\/crew /);
        return / \+\S*i/.test(modes) && !(await invitesOf(["chief", chief], "#bubble/crew")).includes("*!*@*");
      };
      await expect.poll(shut, { timeout: 5000 }).toBe(true);
      expect(await joins(gus, "gus", "#bubble/crew")).toBe(false);
    });
  });

  it("holds a members room of 100 accounts, and its second pass asks nothing (3m)", { timeout: 60_000 }, async () => {
    const e = await start();
    const crew = Array.from({ length: 98 }, (_, n) => `crew${String(n)}`);
    const worlds = new Map([
      [
        "bubble",
        {
          rules: RULES,
          moderators: new Set(["mod"]),
          groups: new Map([["crew", new Set(crew)]]),
          rooms: new Map([["#bubble/crew", { type: "members" as const, readers: "crew", hidden: false }]]),
        },
      ],
    ]);
    const lines: string[] = [];
    await chatFor(e, [], { worlds, reconcileMs: 200, lines, team: new Set(["lead"]) });
    const chief = await oper(e, "chief");
    // Listed by SAMODE: Ergo shows a channel's invites to its operators alone.
    const invites = async (): Promise<number> => {
      const mark = chief.lines().length;
      chief.send("SAMODE #bubble/crew I");
      await chief.expect(/ 347 chief #bubble\/crew /);
      return chief
        .lines()
        .slice(mark)
        .filter((line) => line.includes(" 346 chief #bubble/crew ")).length;
    };
    await expect.poll(invites, { timeout: 20_000 }).toBe(100);
    const changed = () => lines.filter((line) => line.includes('"room_reconciled"')).length;
    const before = changed();
    // Two passes and more.
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(changed()).toBe(before);
    // Passes that kept running (F577): an invite taken off by hand comes back.
    chief.send("SAMODE #bubble/crew -I crew0");
    await expect.poll(invites, { timeout: 5000 }).toBe(100);
    expect(changed()).toBeGreaterThan(before);
  });
});
