import { spawnSync } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import type { AddressInfo } from "node:net";
import { join as joinPath } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { compose, LINE_BYTES, relayOf } from "@gnoworld/core";
import type { Address } from "@gnoworld/schemas";
import { z } from "zod";
import { authServer } from "../ergo/auth.ts";
import { ircLink, type Said } from "../irc/link.ts";
import { openDatabase } from "../db.ts";
import { logger } from "../log.ts";
import { LOGIN_TABLES, makeLogin, NONCE_HOST } from "../login/login.ts";
import { makeTickets, TICKET_TABLES } from "../login/ticket.ts";
import { startErgo, type Ergo } from "./ergo.ts";
import { wallet } from "./signer.ts";
import { rawClient, type Raw } from "./rawClient.ts";

import {
  ADDRESS,
  cleanUp,
  finish,
  guest,
  hello,
  history,
  join,
  kept,
  keptFolder,
  lobby,
  logged,
  login,
  moderated,
  open,
  oper,
  ORIGIN,
  OTHERPW_HASH,
  replayed,
  sasl,
  say,
  start,
  stops,
  sync,
  wsConnect,
  wsRaw,
  type Ws,
} from "./ergoKit.ts";

// Every expectation comes from .claude/tmp/ergo-spike/RESULTS.md, section 3 (Ergo v2.19.1, run for real).

afterEach(cleanUp);

describe("guests and rooms", { timeout: 20_000 }, () => {
  it("refuses a guest speaking in a +M room, and lets an account speak", async () => {
    const e = await start();
    const chief = await lobby(e);
    await moderated(chief, "#lobby", true);
    const alice = await login(e, "alice");
    await join(alice, "#lobby");
    const gus = await guest(e, "gus");
    await join(gus, "#lobby");
    gus.send("PRIVMSG #lobby :hello from guest");
    await gus.expect(/ 404 gus #lobby :Cannot send to channel \(\+M\)/);
    alice.send("PRIVMSG #lobby :hello from alice");
    await gus.expect(/account=alice.* PRIVMSG #lobby :hello from alice/);
    await sync(alice);
    expect(logged(alice)).not.toContain("hello from guest");
  });

  it("makes a new room +CMint, closed until the server opens it, and lets a client join 100 rooms", async () => {
    const e = await start();
    const chief = await lobby(e);
    expect(logged(chief)).toMatch(/ 005 .* CHANLIMIT=#:100 /);
    await join(chief, "#fresh");
    chief.send("MODE #fresh");
    await chief.expect(/ 324 chief #fresh \+CMint(\s|$)/);
    chief.send("MODE #lobby");
    await chief.expect(/ 324 chief #lobby \+CMnt(\s|$)/);
  });

  it("lets a guest read the history of a room it joined, not of one it did not", async () => {
    const e = await start();
    await lobby(e);
    const alice = await login(e, "alice");
    await join(alice, "#lobby");
    const gus = await guest(e, "gus");
    await join(gus, "#lobby");
    await say(alice, "#lobby", "history-1");
    history(gus, "#lobby");
    await gus.expect(/BATCH \+\S+ chathistory #lobby/);
    await gus.expect(replayed("PRIVMSG #lobby :history-1$"));
    const outsider = await guest(e, "gus2");
    history(outsider, "#lobby");
    await outsider.expect(/FAIL CHATHISTORY INVALID_TARGET LATEST #lobby :Messages could not be retrieved/);
  });

  it("keeps a room's history across a restart", { timeout: 40_000 }, async () => {
    const e = await start({ dir: keptFolder() });
    const chief = await lobby(e);
    chief.send("CS REGISTER #lobby");
    await chief.expect(/successfully registered/);
    const alice = await login(e, "alice");
    await join(alice, "#lobby");
    await say(alice, "#lobby", "persist-marker-1");
    await sync(alice);
    const { dir } = e;
    await e.stop();

    const again = await start({ dir });
    const reader = await login(again, "bob");
    await join(reader, "#lobby");
    history(reader, "#lobby");
    await reader.expect(replayed("PRIVMSG #lobby :persist-marker-1$"));
    const gus = await guest(again, "gus");
    await join(gus, "#lobby");
    history(gus, "#lobby");
    await gus.expect(replayed("PRIVMSG #lobby :persist-marker-1$"));
  });

  it("keeps no direct message across a restart: none is stored until slice 4 (3e)", { timeout: 40_000 }, async () => {
    const e = await start({ dir: keptFolder() });
    const alice = await login(e, "alice");
    const bob = await login(e, "bob");
    alice.send("PRIVMSG bob :dm-marker-2");
    await bob.expect(/PRIVMSG bob :dm-marker-2$/);
    await sync(alice);
    await sync(bob);
    const { dir } = e;
    await e.stop();

    const again = await start({ dir });
    const reader = await login(again, "bob");
    history(reader, "alice");
    const [, batch = ""] =
      /BATCH \+(\S+) chathistory alice/.exec(await reader.expect(/BATCH \+\S+ chathistory alice/)) ?? [];
    await reader.expect(new RegExp(`BATCH -${batch}$`));
    expect(logged(reader)).not.toContain("dm-marker-2");
  });
});

describe("logins and the auth script", { timeout: 30_000 }, () => {
  it("refuses registering an account, by NickServ or by REGISTER, and SAREGISTER to a non-oper", async () => {
    const e = await start();
    const x = await guest(e, "newacct");
    x.send("NS REGISTER newacct pw123");
    await x.expect(/NOTICE newacct :This command has been disabled by the server administrators/);
    x.send("REGISTER newacct * pw123");
    await x.expect(/FAIL REGISTER DISALLOWED newacct :Account registration is disabled/);
    x.send("NS SAREGISTER newacct pw123");
    expect(await x.expect(/NOTICE newacct :Command restricted/)).toContain("Command restricted");
  });

  it("ignores PASS account:password, which logs nobody in", async () => {
    const e = await start();
    const c = await open(e);
    c.send("CAP LS 302");
    c.send("CAP END");
    c.send("PASS alice:pw");
    c.send("NICK yy");
    c.send("USER u 0 * :y");
    await c.expect(/ 376 | 422 /);
    c.send("WHOIS yy");
    await c.expect(/ 318 /);
    expect(logged(c)).not.toMatch(/ (900|330) /);
  });

  it("refuses a wrong or empty passphrase, and an autocreated account has no password to change", async () => {
    const e = await start();
    await login(e, "alice");
    for (const passphrase of ["wrongpw", ""]) {
      const c = await open(e);
      await hello(c);
      expect(await sasl(c, "alice", passphrase)).toContain(" 904 ");
    }
    const carol = await login(e, "carol");
    carol.send("NS PASSWD pw newpw newpw");
    await carol.expect(/NOTICE carol :Your account credentials are managed externally and cannot be changed here/);
  });

  it("logs a guest in through the script when it gives NS IDENTIFY, and forces its nick", async () => {
    const e = await start();
    // While dave's own connection is open, a second client of the account is refused its nick.
    const dave = await login(e, "dave");
    const early = await guest(e, "dave3");
    early.send("NS IDENTIFY dave pw");
    expect(await early.expect(/ 433 dave3 dave /)).toContain("Nickname is already in use");
    await early.expect(/try logging out and logging back in with SASL/);
    await dave.close();
    const g = await guest(e, "dave2");
    g.send("NS IDENTIFY dave pw");
    await g.expect(/NOTICE dave :You're now logged in as dave/);
    await sync(g);
    expect(logged(g)).toMatch(/:dave2!\S+ NICK dave/);
    expect(logged(g)).toMatch(/:dave!\S+ ACCOUNT dave/);
  });

  it("sends the script one JSON line: account name, passphrase and ip", async () => {
    const e = await start();
    await login(e, "frank");
    expect(e.authInput()).toEqual(['{"accountName":"frank","passphrase":"pw","ip":"127.0.0.1"}']);
  });

  it("answers 904 when the script says no, errors, prints garbage or crashes, and logs why", async () => {
    const e = await start();
    // An account that exists: for one that does not, the reply is "Account does not exist".
    await (await login(e, "frank")).close();
    const cases: [string, string | undefined][] = [
      ["nope", undefined],
      ["err", "Authentication process reported error: boom"],
      ["garbage", "invalid character 'o' in literal null"],
      ["crash", "exit status 3"],
    ];
    for (const [passphrase, why] of cases) {
      const c = await open(e);
      await hello(c);
      expect(await sasl(c, "frank", passphrase)).toContain(
        "904 * :SASL authentication failed: Invalid account credentials",
      );
      if (why !== undefined) {
        await vi.waitFor(() => {
          expect(e.log()).toContain(why);
        });
      }
    }
    // An account never seen: the same refusals tell it does not exist, and none creates it.
    for (const [passphrase] of cases) {
      const c = await open(e);
      await hello(c);
      expect(await sasl(c, `new-${passphrase}`, passphrase)).toContain(
        "904 * :SASL authentication failed: Account does not exist",
      );
      expect(logged(c)).not.toMatch(/ 900 /);
    }
  });

  it("makes the client wait the whole script timeout, then answers 904", { timeout: 15_000 }, async () => {
    const e = await start({ authTimeout: "1s" });
    const c = await open(e);
    await hello(c);
    const started = Date.now();
    expect(await sasl(c, "frank", "slow")).toContain(" 904 ");
    const waited = Date.now() - started;
    expect(waited).toBeGreaterThanOrEqual(1000);
    await vi.waitFor(() => {
      expect(e.log()).toContain("Operation timed out");
    });
  });

  it("refuses a new account with 904 when the script file is absent, and logs the failed exec", async () => {
    const e = await start({ authScript: "absent" });
    const c = await open(e);
    await hello(c);
    expect(await sasl(c, "henry", "pw")).toContain("904 * :SASL authentication failed: Account does not exist");
    await vi.waitFor(() => {
      expect(e.log()).toContain("no such file or directory");
    });
  });

  it("lets the script return another account name, which wins; an empty one keeps the SASL name", async () => {
    const e = await start();
    const c = await open(e);
    await hello(c);
    await sasl(c, "grace", "rename");
    expect(logged(c)).toContain("900 * * renamed-grace :You are now logged in as renamed-grace");
    await finish(c, "renamed-grace");
    c.send("WHOIS renamed-grace");
    await c.expect(/ 330 renamed-grace renamed-grace renamed-grace :is logged in as/);
    c.send("NICK grace");
    await c.expect(/ 400 \S+ NICK :You must use your account name as your nickname/);
    const hank = await login(e, "hank", { pass: "empty" });
    expect(logged(hank)).toContain("900 * * hank :You are now logged in as hank");
  });

  it("keeps the passphrase out of the log at the default log types", async () => {
    const e = await start();
    const c = await open(e);
    await hello(c);
    await sasl(c, "loguser", "S3cretPhrase!");
    await finish(c, "loguser");
    c.send(`OPER admin ${e.operPassword}`);
    await c.expect(/ 381 /);
    const marker = await open(e);
    await hello(marker);
    await sasl(marker, "markeruser", "err");
    await vi.waitFor(() => {
      expect(e.log()).toContain("boom");
    });
    const text = e.log();
    expect(text).not.toContain("S3cretPhrase!");
    expect(text).not.toContain(Buffer.from("\0loguser\0S3cretPhrase!").toString("base64"));
    expect(text).not.toContain(e.operPassword);
  });

  it("writes the passphrase, its base64, PASS and the oper password in clear at log type *", async () => {
    const e = await start({ logTypes: "*" });
    const c = await open(e);
    c.send("PASS loguser:S3cretPass");
    await hello(c);
    await sasl(c, "loguser", "S3cretPhrase!");
    c.send(`OPER admin ${e.operPassword}`);
    await vi.waitFor(() => {
      expect(e.log()).toContain("AUTHENTICATE AGxvZ3VzZXIAUzNjcmV0UGhyYXNlIQ==");
      expect(e.log()).toContain("PASS loguser:S3cretPass");
      expect(e.log()).toContain(`OPER admin ${e.operPassword}`);
    });
  });

  it("hands the script the SASL name without a @clientid suffix", async () => {
    const e = await start();
    await login(e, "a@b", { nick: "atuser" });
    expect(e.authInput()[0]).toContain('"accountName":"a"');
  });

  it("holds an address of 40 characters as a logged-in nick, and a guest to 32", async () => {
    const e = await start();
    const c = await login(e, ADDRESS);
    expect(logged(c)).toContain("NICKLEN=32");
    expect(logged(c)).toContain(` 001 ${ADDRESS} `);
    c.send(`WHOIS ${ADDRESS}`);
    await c.expect(new RegExp(` 330 ${ADDRESS} ${ADDRESS} ${ADDRESS} :is logged in as`));
    for (const length of [33, 40]) {
      const nick = ADDRESS.slice(0, length);
      const g = await open(e);
      await hello(g);
      expect(await finish(g, nick, / 432 /)).toContain(` 432 * ${nick} :Erroneous nickname`);
    }
  });

  it("accepts letters, digits, - and _ in an account name and refuses ., #, : and non-ASCII", async () => {
    const e = await start();
    for (const name of ["AliceCase", "1abc", "a-b", "a_b", "a", "G1ABC"]) {
      const c = await login(e, name);
      expect(logged(c)).toContain(`900 * * ${name} :You are now logged in as ${name}`);
    }
    for (const name of ["a.b", "#abc", "a:b", "café"]) {
      const c = await open(e);
      await hello(c);
      expect(await sasl(c, name, "pw")).toContain("904 * :SASL authentication failed: Unknown");
      expect(await finish(c, name, / 432 /)).toContain(` 432 * ${name} :Erroneous nickname`);
    }
  });
});

describe("history and tags", { timeout: 30_000 }, () => {
  const room = async (names: string[]): Promise<{ e: Ergo; chief: Raw; members: Raw[] }> => {
    const e = await start();
    const chief = await lobby(e);
    const members: Raw[] = [];
    for (const name of names) {
      const c = await login(e, name);
      await join(c, "#lobby");
      members.push(c);
    }
    return { e, chief, members };
  };

  it("relays and replays client tags on a PRIVMSG, but not to a client without message-tags", async () => {
    const { e, members } = await room(["alice", "obs"]);
    const [alice, obs] = members;
    if (alice === undefined || obs === undefined) throw new Error("missing members");
    const id = await say(alice, "#lobby", "original message");
    const tags = [`+reply=${id}`, `+gnoworld/edit=${id}`, "+gnoworld/x=y"];
    alice.send(`@${tags.join(";")} PRIVMSG #lobby :edited text`);
    const live = await obs.expect(/PRIVMSG #lobby :edited text/);
    const late = await login(e, "late");
    await join(late, "#lobby");
    history(late, "#lobby");
    const replay = await late.expect(replayed("PRIVMSG #lobby :edited text"));
    for (const tag of tags) {
      expect(live).toContain(tag);
      expect(replay).toContain(tag);
    }
    const plain = await login(e, "plain", { caps: "sasl server-time batch draft/chathistory" });
    await join(plain, "#lobby");
    history(plain, "#lobby");
    expect(await plain.expect(/PRIVMSG #lobby :edited text/)).not.toContain("+reply");
  });

  it("stores reaction TAGMSGs but not +typing, and a client without event-playback sees a fake chat line", async () => {
    const { e, members } = await room(["alice"]);
    const [alice] = members;
    if (alice === undefined) throw new Error("missing member");
    const id = await say(alice, "#lobby", "original message");
    alice.send(`@+draft/react=%F0%9F%91%8D;+draft/reply=${id} TAGMSG #lobby`);
    alice.send(`@+react=x;+reply=${id} TAGMSG #lobby`);
    alice.send("@+typing=active TAGMSG #lobby");
    await sync(alice);
    const late = await login(e, "late");
    await join(late, "#lobby");
    history(late, "#lobby");
    await late.expect(/BATCH -/);
    const stored = late.lines().filter((l) => replayed(" TAGMSG #lobby").test(l));
    expect(stored).toHaveLength(2);
    expect(stored.join("\n")).toContain("+draft/react=%F0%9F%91%8D");
    expect(stored.join("\n")).toContain("+react=x");
    expect(stored.join("\n")).not.toContain("+typing");
    const noPlayback = await login(e, "noep", { caps: "sasl message-tags server-time batch draft/chathistory" });
    await join(noPlayback, "#lobby");
    history(noPlayback, "#lobby");
    await noPlayback.expect(/:HistServ!HistServ@localhost PRIVMSG #lobby :alice sent a TAGMSG/);
  });

  it("stops a non-voiced account and guest sending in a +m room, a reaction TAGMSG included, until +v", async () => {
    const { e, chief, members } = await room(["alice", "obs"]);
    const [alice, obs] = members;
    if (alice === undefined || obs === undefined) throw new Error("missing members");
    const gus = await guest(e, "gus");
    await join(gus, "#lobby");
    chief.send("MODE #lobby +m");
    await alice.expect(/MODE #lobby \+m/);
    alice.send("PRIVMSG #lobby :speak under +m");
    await alice.expect(/ 404 alice #lobby :Cannot send to channel \(\+m\)/);
    alice.send("@+draft/react=x TAGMSG #lobby");
    await alice.expect(/ 404 alice #lobby :Cannot send to channel \(\+m\)/);
    gus.send("@+typing=active TAGMSG #lobby");
    await gus.expect(/ 404 gus #lobby :Cannot send to channel \(\+m\)/);
    await sync(obs);
    expect(logged(obs)).not.toMatch(/ TAGMSG #lobby/);
    chief.send("MODE #lobby +v alice");
    await alice.expect(/MODE #lobby \+v alice/);
    alice.send("@+draft/react=y TAGMSG #lobby");
    await obs.expect(/TAGMSG #lobby/);
  });

  it("drops server-owned tags a client sends, and refuses a client batch tag", async () => {
    const { e, members } = await room(["alice", "obs"]);
    const [alice, obs] = members;
    if (alice === undefined || obs === undefined) throw new Error("missing members");
    const forged = ["account=bob", "msgid=FAKEMSGID", "time=2001-01-01T00:00:00.000Z", "draft/bot", "label=lab1"];
    for (const [i, tag] of forged.entries()) {
      alice.send(`@${tag} PRIVMSG #lobby :t${String(i)}`);
      const line = await obs.expect(new RegExp(`PRIVMSG #lobby :t${String(i)}$`));
      expect(line).toContain("account=alice");
      expect(line).not.toContain(tag);
    }
    // A guest may speak here: the room opened by an operator, whatever Ergo's default.
    await moderated(await oper(e, "op"), "#lobby", false);
    const gus = await guest(e, "gus");
    await join(gus, "#lobby");
    gus.send("@account=alice PRIVMSG #lobby :guest forging");
    expect(await obs.expect(/PRIVMSG #lobby :guest forging$/)).not.toContain("account=");
    alice.send("@batch=zz PRIVMSG #lobby :batched");
    await alice.expect(/FAIL BATCH MULTILINE_INVALID :Incorrect batch tag sent/);
    const seen = obs.lines().length;
    alice.send("@account=bob TAGMSG #lobby");
    await sync(alice);
    await sync(obs);
    expect(obs.lines().slice(seen).join("\n")).not.toContain("TAGMSG");
  });
});

describe("moderation", { timeout: 40_000 }, () => {
  it("refuses an account creating a room, and lets an oper create and register one", async () => {
    const e = await start();
    const chief = await lobby(e);
    const bob = await login(e, "bob");
    bob.send("JOIN #newroom");
    await bob.expect(/ 403 bob #newroom :Only server operators can create new channels/);
    await join(bob, "#lobby");
    chief.send("JOIN #made-by-oper");
    await chief.expect(/ 353 .* #made-by-oper :.*@chief/);
    bob.send("CS REGISTER #lobby");
    await bob.expect(/You must be an oper on the channel to register it/);
    chief.send("CS REGISTER #lobby");
    await chief.expect(/Channel #lobby successfully registered/);
  });

  it("lets an author, a channel op and an oper with history redact, not a member or a half-op", async () => {
    const e = await start();
    const chief = await lobby(e);
    const names = ["alice", "bob", "dan", "eve"];
    const [alice, bob, dan, eve] = await Promise.all(names.map((n) => login(e, n)));
    if (alice === undefined || bob === undefined || dan === undefined || eve === undefined) throw new Error("login");
    for (const c of [alice, bob, dan, eve]) await join(c, "#lobby");
    chief.send("MODE #lobby +h dan");
    await dan.expect(/MODE #lobby \+h dan/);
    chief.send("MODE #lobby +o eve");
    await eve.expect(/MODE #lobby \+o eve/);
    const opr = await oper(e, "opr");
    await join(opr, "#lobby");
    const outsider = await oper(e, "outsider");

    const allowed = async (actor: Raw, name: string, text: string): Promise<void> => {
      const id = await say(alice, "#lobby", text);
      actor.send(`REDACT #lobby ${id} :test`);
      await alice.expect(new RegExp(`:${name}!\\S+ REDACT #lobby ${id} test`));
    };
    const forbidden = async (actor: Raw, author: Raw, text: string): Promise<void> => {
      const id = await say(author, "#lobby", text);
      actor.send(`REDACT #lobby ${id} :test`);
      await actor.expect(
        new RegExp(`FAIL REDACT REDACT_FORBIDDEN #lobby ${id} :You are not authorized to delete this message`),
      );
    };
    await allowed(alice, "alice", "own");
    await forbidden(bob, alice, "by a member");
    await forbidden(dan, alice, "by a half-op");
    await allowed(eve, "eve", "by an op");
    await allowed(chief, "chief", "by a founder oper");
    await allowed(opr, "opr", "by an oper in the room");
    await allowed(outsider, "outsider", "by an oper outside the room");
    await forbidden(alice, bob, "another author");
  });

  it("tells members who redacted, tells a client without the cap nothing, and drops it from history", async () => {
    const e = await start();
    const chief = await lobby(e);
    const [alice, bob] = await Promise.all([login(e, "alice"), login(e, "bob")]);
    await join(alice, "#lobby");
    await join(bob, "#lobby");
    const plain = await guest(e, "nocap", "message-tags server-time batch draft/chathistory");
    await join(plain, "#lobby");
    const gone = await say(alice, "#lobby", "to be redacted");
    await say(alice, "#lobby", "kept");
    await sync(plain);
    const seen = plain.lines().length;
    chief.send(`REDACT #lobby ${gone} :spam`);
    await bob.expect(new RegExp(`account=chief.* :chief!\\S+ REDACT #lobby ${gone} spam`));
    await sync(chief);
    await sync(plain);
    expect(plain.lines().slice(seen)).toEqual([expect.stringMatching(/PONG/)]);
    history(bob, "#lobby");
    await bob.expect(replayed("PRIVMSG #lobby :kept$"));
    await sync(bob);
    expect(logged(bob)).not.toMatch(replayed("PRIVMSG #lobby :to be redacted$"));
  });

  it("mutes an account with the m: extban, stored as m:bob!*@*, for messages and reactions, others still speak", async () => {
    const e = await start();
    const chief = await lobby(e);
    const [bob, obs] = await Promise.all([login(e, "bob"), login(e, "obs")]);
    await join(bob, "#lobby");
    await join(obs, "#lobby");
    chief.send("MODE #lobby +b m:bob");
    await chief.expect(/MODE #lobby \+b m:bob/);
    chief.send("MODE #lobby b");
    await chief.expect(/ 367 chief #lobby m:bob!\*@\* /);
    expect(logged(chief)).toContain("EXTBAN=,m");
    bob.send("PRIVMSG #lobby :muted words");
    await bob.expect(/ 404 bob #lobby :Cannot send to channel \(\+b\)/);
    bob.send("@+draft/react=x TAGMSG #lobby");
    await bob.expect(/ 404 bob #lobby :Cannot send to channel \(\+b\)/);
    await say(obs, "#lobby", "obs still speaks");
    await bob.expect(/PRIVMSG #lobby :obs still speaks$/);
  });

  it("lets +I with an account name, a 40-character address included, into an invite-only room", async () => {
    const e = await start();
    const chief = await oper(e, "chief");
    await join(chief, "#inv");
    chief.send("MODE #inv");
    await chief.expect(/ 324 chief #inv \+\S*i/);
    const bob = await login(e, "bob");
    const address = await login(e, ADDRESS);
    for (const [c, account] of [
      [bob, "bob"],
      [address, ADDRESS],
    ] as const) {
      c.send("JOIN #inv");
      await c.expect(/ 473 \S+ #inv /);
      chief.send(`MODE #inv +I ${account}`);
      await chief.expect(new RegExp(`MODE #inv \\+I ${account}`));
      await join(c, "#inv");
    }
  });

  it("holds a ban list at 100 for MODE, an oper included, and lets SAMODE go past", async () => {
    const e = await start();
    const chief = await lobby(e);
    const listed = async (): Promise<number> => {
      const from = chief.lines().length;
      chief.send("MODE #lobby b");
      await chief.expect(/ 368 /);
      return chief
        .lines()
        .slice(from)
        .filter((l) => l.includes(" 367 ")).length;
    };
    for (let i = 0; i < 100; i++) chief.send(`MODE #lobby +b m:x${String(i)}!*@*`);
    chief.send("MODE #lobby +b m:x100!*@*");
    await chief.expect(/ 478 chief #lobby b :Channel list is full/);
    expect(await listed()).toBe(100);
    expect(logged(chief)).toContain("MAXLIST=beI:100");
    chief.send("SAMODE #lobby +b m:y0!*@*");
    await chief.expect(/MODE #lobby \+b m:y0/);
    expect(await listed()).toBe(101);
  });

  it("takes 150 AMODE entries on a channel, 151 with the founder, with no cap", { timeout: 90_000 }, async () => {
    const e = await start();
    const chief = await lobby(e);
    chief.send("CS REGISTER #lobby");
    await chief.expect(/successfully registered/);
    const names = Array.from({ length: 150 }, (_, i) => `am${String(i).padStart(3, "0")}`);
    for (let i = 0; i < names.length; i += 25) {
      await Promise.all(
        names.slice(i, i + 25).map(async (name) => {
          const c = await open(e);
          c.send("CAP REQ :sasl");
          await c.expect(/ACK/);
          expect(await sasl(c, name, "pw")).toContain(" 903 ");
          await c.close();
        }),
      );
    }
    for (const name of names) chief.send(`CS AMODE #lobby +v ${name}`);
    let confirmed = 0;
    while (confirmed++ < names.length) await chief.expect(/Successfully set persistent mode \+v/, 10_000);
    chief.send("CS AMODE #lobby");
    await chief.expect(/Channel #lobby has 151 persistent modes set/, 10_000);
  });

  it("lets an oper with chanreg register 17 channels, past the 15 an account holds", { timeout: 60_000 }, async () => {
    const e = await start();
    const chief = await oper(e, "chief");
    const owner = await login(e, "owner");
    for (let i = 0; i < 17; i++) {
      const channel = `#r${String(i)}`;
      await join(chief, channel);
      chief.send(`CS REGISTER ${channel}`);
      await chief.expect(new RegExp(`Channel ${channel} successfully registered`));
    }
    // The control: an account opped in 16 channels registers 15 of them, and is refused the 16th.
    for (let i = 0; i < 16; i++) {
      const channel = `#a${String(i)}`;
      await join(chief, channel);
      chief.send(`MODE ${channel} -i`);
      await chief.expect(new RegExp(`MODE ${channel} -i`));
      await join(owner, channel);
      chief.send(`MODE ${channel} +o owner`);
      await owner.expect(new RegExp(`MODE ${channel} \\+o owner`));
      owner.send(`CS REGISTER ${channel}`);
      await owner.expect(
        i < 15
          ? new RegExp(`Channel ${channel} successfully registered`)
          : /You have already registered the maximum number of channels/,
      );
    }
  });
});

describe("operators and listeners", { timeout: 30_000 }, () => {
  it("lets an oper log in on the plain and the WebSocket listener alike", async () => {
    const e = await start();
    const plain = await guest(e, "plop");
    plain.send(`OPER admin ${e.operPassword}`);
    await plain.expect(/ 381 plop :You are now an IRC operator/);
    const ws = await wsConnect(e.wsPort, { protocols: ["text.ircv3.net"] });
    if (ws === undefined) throw new Error("the WebSocket did not open");
    const viaWs = wsRaw(ws);
    await hello(viaWs);
    await finish(viaWs, "wsop");
    viaWs.send(`OPER admin ${e.operPassword}`);
    expect(await viaWs.expect(/ 381 wsop /)).toContain("You are now an IRC operator");
  });

  it("takes the oper password from the environment as a bcrypt hash, and the old one stops working", async () => {
    const e = await start({ env: { ERGO__OPERS__ADMIN__PASSWORD: OTHERPW_HASH } });
    const c = await guest(e, "oo");
    c.send(`OPER admin ${e.operPassword}`);
    await c.expect(/ 491 /);
    // Another client: Ergo makes one wait 10 s before its next OPER.
    const d = await guest(e, "pp");
    d.send("OPER admin otherpw");
    expect(await d.expect(/ 381 /)).toContain("You are now an IRC operator");
  });

  it("accepts a WebSocket only from an allowed origin when the list is set", async () => {
    const e = await start({ origins: [ORIGIN] });
    expect(await wsConnect(e.wsPort, { headers: { Origin: ORIGIN } })).toBeDefined();
    expect(await wsConnect(e.wsPort, { headers: { Origin: "http://evil.example" } })).toBeUndefined();
    expect(await wsConnect(e.wsPort)).toBeUndefined();
  });

  it("accepts every origin, and none, when the list is empty", async () => {
    const e = await start();
    expect(await wsConnect(e.wsPort)).toBeDefined();
    expect(await wsConnect(e.wsPort, { headers: { Origin: "http://evil.example" } })).toBeDefined();
  });

  it("sends an Origin from Node's WebSocket only through the headers option, subprotocol optional", async () => {
    const e = await start({ origins: [ORIGIN] });
    expect(await wsConnect(e.wsPort, { protocols: ["text.ircv3.net"] })).toBeUndefined();
    const full = await wsConnect(e.wsPort, { protocols: ["text.ircv3.net"], headers: { Origin: ORIGIN } });
    if (full === undefined) throw new Error("the WebSocket did not open");
    expect(full.protocol).toBe("text.ircv3.net");
    const viaWs = wsRaw(full);
    viaWs.send("NICK nodeguest");
    viaWs.send("USER u 0 * :n");
    await viaWs.expect(/ 001 /);
    const bare = await wsConnect(e.wsPort, { headers: { Origin: ORIGIN } });
    expect(bare?.protocol).toBe("");
  });

  describe("the address Ergo gives the script", () => {
    const viaWs = async (e: Ergo, headers: Record<string, string>): Promise<Raw> => {
      const ws = await wsConnect(e.wsPort, { protocols: ["text.ircv3.net"], headers });
      if (ws === undefined) throw new Error("the WebSocket did not open");
      const c = wsRaw(ws);
      await hello(c);
      await sasl(c, "xffuser", "pw");
      await finish(c, "xffuser");
      return c;
    };

    it("takes X-Forwarded-For from a trusted peer, the entry next to it when there are two", async () => {
      const e = await start();
      const c = await viaWs(e, { "X-Forwarded-For": "203.0.113.9" });
      c.send("WHOIS xffuser");
      await c.expect(/ 338 xffuser xffuser \S+@203\.0\.113\.9 203\.0\.113\.9 /);
      expect(e.authInput()[0]).toContain('"ip":"203.0.113.9"');
      const two = await start();
      await viaWs(two, { "X-Forwarded-For": "198.51.100.1, 203.0.113.9" });
      expect(two.authInput()[0]).toContain('"ip":"203.0.113.9"');
    });

    it("ignores X-Forwarded-For from a peer that is not trusted", async () => {
      const e = await start({ proxyFrom: ["192.0.2.1"] });
      await viaWs(e, { "X-Forwarded-For": "203.0.113.9" });
      expect(e.authInput()[0]).toContain('"ip":"127.0.0.1"');
    });

    it("takes a PROXY line from a trusted peer, and drops the connection of one that is not", async () => {
      const e = await start();
      const c = await open(e);
      c.send(`PROXY TCP4 198.51.100.7 127.0.0.1 40000 ${String(e.port)}`);
      await hello(c);
      await sasl(c, "proxyuser", "pw");
      expect(e.authInput()[0]).toContain('"ip":"198.51.100.7"');
      const strict = await start({ proxyFrom: ["192.0.2.1"] });
      const d = await open(strict);
      d.send(`PROXY TCP4 198.51.100.7 127.0.0.1 40000 ${String(strict.port)}`);
      d.send("CAP LS 302");
      await expect(d.expect(/CAP|NOTICE| 001 /, 5000)).rejects.toThrow(/closed/);
    });
  });
});

describe("the helper", { timeout: 30_000 }, () => {
  it("starts two Ergos in parallel without a clash", async () => {
    const [a, b] = await Promise.all([start(), start()]);
    expect(new Set([a.port, a.wsPort, b.port, b.wsPort, a.dir, b.dir]).size).toBe(6);
    for (const [e, nick] of [
      [a, "first"],
      [b, "second"],
    ] as const) {
      const c = await guest(e, nick);
      expect(logged(c)).toContain(` 001 ${nick} `);
    }
  });

  it("fails at once, with Ergo's log, when Ergo exits instead of listening", { timeout: 10_000 }, async () => {
    const started = Date.now();
    await expect(startErgo({ env: { ERGO__OPERS__ADMIN__PASSWORD: "nothash" } })).rejects.toThrow(
      /invalid password hash/,
    );
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it("listens on loopback only: its rendered listeners name 127.0.0.1 alone, and those answer", async () => {
    // From another address of the machine the sandbox lets a connection time out rather than be
    // refused, which proves nothing: the listeners Ergo was given are the proof.
    const e = await start();
    const ports = [e.port, e.wsPort];
    const listeners = readFileSync(joinPath(e.dir, "ircd.yaml"), "utf8").match(/^\s+"[^"]*:\d+":/gm) ?? [];
    expect(listeners.map((line) => line.trim())).toEqual(ports.map((p) => `"127.0.0.1:${String(p)}":`));
    for (const port of ports) await (await rawClient(port)).close();
  });

  it("leaves no folder behind when Ergo cannot start at all", () => {
    const tmp = keptFolder();
    const script = `import { startErgo } from ${JSON.stringify(new URL("ergo.ts", import.meta.url).href)};
await startErgo().then(() => process.exit(2), () => process.exit(0));`;
    const run = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      env: { ...process.env, GNOWORLD_TOOLS: "/nonexistent", TMPDIR: tmp },
      encoding: "utf8",
      timeout: 20_000,
    });
    expect(run.status).toBe(0);
    expect(readdirSync(tmp)).toEqual([]);
  });

  it("frees its ports and removes its folder when stopped, and stopping twice is fine", async () => {
    const e = await start();
    await e.stop();
    await e.stop();
    await expect(rawClient(e.port)).rejects.toThrow(/ECONNREFUSED/);
    expect(existsSync(e.dir)).toBe(false);
  });

  it("keeps a folder it was given, so a test can start again on the same history", async () => {
    const e = await start({ dir: keptFolder() });
    await e.stop();
    const again = await start({ dir: e.dir });
    await again.stop();
    expect(existsSync(e.dir)).toBe(true);
  });

  it("fails what waits on an Ergo that crashes, at once, and still stops cleanly", async () => {
    const e = await start();
    const waiting = (await guest(e, "waiter")).expect(/never sent/, 20_000);
    process.kill(e.pid, "SIGKILL");
    const started = Date.now();
    await expect(waiting).rejects.toThrow(/closed/);
    expect(Date.now() - started).toBeLessThan(5000);
    await expect(e.stop()).resolves.toBeUndefined();
  });

  it("leaves no Ergo running when a test process ends without stopping it", async () => {
    const script = `import { startErgo } from ${JSON.stringify(new URL("ergo.ts", import.meta.url).href)};
const e = await startErgo();
process.stdout.write(JSON.stringify({ pid: e.pid, dir: e.dir }));
process.exit(0);`;
    const run = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      encoding: "utf8",
      timeout: 20_000,
    });
    const { pid, dir } = z.object({ pid: z.number().int().positive(), dir: z.string() }).parse(JSON.parse(run.stdout));
    await vi.waitFor(() => {
      expect(() => process.kill(pid, 0)).toThrow(/ESRCH/);
    });
    expect(existsSync(dir)).toBe(false);
  });
});

describe("logging in through the server (3d)", { timeout: 30_000 }, () => {
  // The server's half for real: the login, its tickets and the auth handler, which Ergo's script reaches.
  const server = async () => {
    const db = openDatabase(":memory:", [LOGIN_TABLES, TICKET_TABLES, NONCE_HOST]);
    const login = makeLogin(db, { chains: ["onyx-1"], now: Date.now });
    const tickets = makeTickets(db, { now: Date.now });
    const auth = authServer(db, { log: logger("a-pepper-of-forty-characters-0123456789", () => true) });
    auth.listen(0, "127.0.0.1");
    await once(auth, "listening");
    const { port } = auth.address() as AddressInfo;
    const stop = async (): Promise<void> => {
      auth.close();
      await once(auth, "close");
    };
    stops.push(async () => {
      if (auth.listening) await stop();
      db.close();
    });
    // One signature, then a session: what the browser holds after the login over HTTP.
    const signIn = async (): Promise<{ address: Address; token: string }> => {
      const who = wallet();
      const made = login.challenge("onyx-1", "gnoworld.test");
      if (typeof made === "string") throw new Error(made);
      const done = await login.verify(
        { nonce: made.nonce, address: who.address, proof: who.sign("onyx-1", made.text) },
        () => true,
        "gnoworld.test",
      );
      if (typeof done === "string") throw new Error(done);
      return { address: who.address, token: done.token };
    };
    const ticketOf = (token: string): string => {
      const address = login.session(token);
      if (address === undefined) throw new Error("no session");
      return tickets.mint(address);
    };
    return { port, stop, signIn, ticketOf, tickets };
  };

  const enter = async (e: Ergo, account: string, ticket: string): Promise<Raw> => {
    const c = await open(e);
    await hello(c);
    expect(await sasl(c, account, ticket)).toContain(" 903 ");
    await finish(c, account);
    return c;
  };

  it("logs a person in with a ticket, their nick their address", async () => {
    const s = await server();
    const e = await start({ authScript: { forward: s.port } });
    const me = await s.signIn();
    const c = await enter(e, me.address, s.ticketOf(me.token));
    c.send("WHOIS " + me.address);
    await c.expect(new RegExp(` 330 \\S+ ${me.address} ${me.address} `));
  });

  it("reconnects three times with a fresh ticket each, and no new signature", async () => {
    const s = await server();
    const e = await start({ authScript: { forward: s.port } });
    const me = await s.signIn();
    for (let n = 0; n < 3; n += 1) {
      const c = await enter(e, me.address, s.ticketOf(me.token));
      await c.close();
    }
  });

  it("lets a guest read and not speak in a +M room, and an account in by ticket speak", async () => {
    const s = await server();
    const e = await start({ authScript: { forward: s.port } });
    const chief = await s.signIn();
    const op = await enter(e, chief.address, s.ticketOf(chief.token));
    op.send(`OPER admin ${e.operPassword}`);
    await op.expect(/ 381 /);
    await join(op, "#lobby");
    op.send("SAMODE #lobby -i");
    await op.expect(/ MODE #lobby -i/);
    await moderated(op, "#lobby", true);
    const me = await s.signIn();
    const c = await enter(e, me.address, s.ticketOf(me.token));
    await join(c, "#lobby");
    const gus = await guest(e, "gus");
    await join(gus, "#lobby");
    gus.send("PRIVMSG #lobby :hello from guest");
    await gus.expect(/ 404 gus #lobby :Cannot send to channel \(\+M\)/);
    c.send("PRIVMSG #lobby :hello from an account");
    await gus.expect(new RegExp(`account=${me.address}.* PRIVMSG #lobby :hello from an account`));
  });

  it("refuses a spent ticket and another account's, and one ticket twice at once logs in once", async () => {
    const s = await server();
    const e = await start({ authScript: { forward: s.port } });
    const [me, other] = [await s.signIn(), await s.signIn()];
    const ticket = s.ticketOf(me.token);
    await enter(e, me.address, ticket);
    const again = await open(e);
    await hello(again);
    expect(await sasl(again, me.address, ticket)).toContain(" 904 ");
    const theirs = await open(e);
    await hello(theirs);
    expect(await sasl(theirs, me.address, s.ticketOf(other.token))).toContain(" 904 ");
    const twice = s.ticketOf(other.token);
    const both = await Promise.all([open(e), open(e)]);
    await Promise.all(both.map((c) => hello(c)));
    const answers = await Promise.all(both.map((c) => sasl(c, other.address, twice)));
    expect(answers.map((line) => / 90(\d) /.exec(line)?.[1]).toSorted()).toEqual(["3", "4"]);
  });

  it("lets nobody in while the server is down, and a guest still reads", async () => {
    const s = await server();
    const e = await start({ authScript: { forward: s.port } });
    const chief = await s.signIn();
    const op = await enter(e, chief.address, s.ticketOf(chief.token));
    op.send(`OPER admin ${e.operPassword}`);
    await op.expect(/ 381 /);
    await join(op, "#lobby");
    op.send("SAMODE #lobby -i");
    await op.expect(/ MODE #lobby -i/);
    const me = await s.signIn();
    const ticket = s.ticketOf(me.token);
    await s.stop();
    const c = await open(e);
    await hello(c);
    expect(await sasl(c, me.address, ticket)).toContain(" 904 ");
    const gus = await guest(e, "gus");
    await join(gus, "#lobby");
    op.send("PRIVMSG #lobby :still here");
    await gus.expect(/PRIVMSG #lobby :still here/);
  });
});

describe("the server's IRC link (3h)", { timeout: 40_000 }, () => {
  const linked = (e: Ergo, rooms: readonly string[]) => {
    const said: Said[] = [];
    const link = ircLink({
      host: "127.0.0.1",
      port: e.port,
      password: e.operPassword,
      rooms: () => rooms,
      onMessage: (message) => said.push(message),
      log: logger("a-pepper-of-forty-characters-0123456789", () => true),
      retryMs: () => 200,
    });
    stops.push(() => link.stop());
    return said;
  };
  // A client sees the bot in a room once NAMES lists it there.
  const inRoom = async (c: Raw, room: string): Promise<string> => {
    for (;;) {
      c.send(`NAMES ${room}`);
      const names = await c.expect(new RegExp(` (353|366) \\S+ (= )?${room} `));
      if (names.includes(" 353 ") && / :.*@?gnoworld\b/.test(names)) return names;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  };

  it("logs a wrong operator password as refused at its login, before any OPER, and joins nothing", async () => {
    const e = await start();
    const lines: string[] = [];
    const link = ircLink({
      host: "127.0.0.1",
      port: e.port,
      password: "a-wrong-operator-password-of-32-chars",
      rooms: () => ["#bubble"],
      onMessage: () => undefined,
      log: logger("a-pepper-of-forty-characters-0123456789", (line) => lines.push(line)),
      retryMs: () => 60_000,
    });
    stops.push(() => link.stop());
    await expect
      .poll(() => lines.filter((line) => line.includes('"event":"irc_refused"') && line.includes('"error":"sasl"')), {
        timeout: 10_000,
      })
      .toHaveLength(1);
    const gus = await guest(e, "gus");
    gus.send("JOIN #bubble");
    await gus.expect(/ 403 gus #bubble /);
  });

  it("logs in as an operator, makes its rooms and reads an account's message, never a direct one", async () => {
    const e = await start();
    const said = linked(e, ["#earth", "#bubble"]);
    const alice = await login(e, "alice");
    const watcher = await oper(e, "watcher");
    await inRoom(watcher, "#bubble");
    // Opened as the server opens an open room: Ergo makes it invite-only.
    watcher.send("SAMODE #bubble -i");
    await watcher.expect(/ MODE #bubble -i/);
    await join(alice, "#bubble");
    alice.send("PRIVMSG gnoworld :a direct message");
    alice.send("PRIVMSG #bubble :hello from alice");
    await expect
      .poll(() => said.map(({ room, account, text }) => [room, account, text]))
      .toEqual([["#bubble", "alice", "hello from alice"]]);
    expect(said[0]?.msgid).toMatch(/^\w+$/);
  });

  it("sits in 101 rooms, past the 100 Ergo allows a client", async () => {
    const e = await start();
    const rooms = Array.from({ length: 101 }, (_, n) => `#room-${String(n)}`);
    linked(e, rooms);
    const gus = await oper(e, "gus");
    await inRoom(gus, "#room-100");
    gus.send("LIST");
    await gus.expect(/ 323 /);
    expect(logged(gus).match(/ 322 gus #room-\d+ 1 /g)).toHaveLength(101);
  });

  it("keeps its nick: once it has logged in, a guest cannot take gnoworld, even while the bot is away", async () => {
    const e = await start();
    const link = ircLink({
      host: "127.0.0.1",
      port: e.port,
      password: e.operPassword,
      rooms: () => ["#bubble"],
      onMessage: () => undefined,
      log: logger("a-pepper-of-forty-characters-0123456789", () => true),
      retryMs: () => 60_000,
    });
    stops.push(() => link.stop());
    await inRoom(await oper(e, "gus"), "#bubble");
    await link.stop();
    const squatter = await open(e);
    await hello(squatter);
    await finish(squatter, "gnoworld", / 433 /);
  });

  it("gets ready as a second session of its account while its last one lingers (the max review)", async () => {
    const e = await start();
    const session = (): string[] => {
      const lines: string[] = [];
      const link = ircLink({
        host: "127.0.0.1",
        port: e.port,
        password: e.operPassword,
        rooms: () => ["#bubble"],
        onMessage: () => undefined,
        log: logger("a-pepper-of-forty-characters-0123456789", (line) => lines.push(line)),
        retryMs: () => 60_000,
      });
      stops.push(() => link.stop());
      return lines;
    };
    const ready = (lines: string[]) => () => lines.filter((line) => line.includes('"event":"irc_ready"')).length;
    await expect.poll(ready(session()), { timeout: 10_000 }).toBe(1);
    const second = session();
    await expect.poll(ready(second), { timeout: 10_000 }).toBe(1);
    expect(second.join("\n")).not.toContain("irc_refused");
  });

  it("comes back to its rooms when Ergo restarts", async () => {
    const dir = mkdtempSync(joinPath(tmpdir(), "gnoworld-ergo-again-"));
    kept.push(dir);
    const first = await start({ dir });
    linked(first, ["#bubble"]);
    const gus = await oper(first, "gus");
    await inRoom(gus, "#bubble");
    await first.stop();
    const again = await start({ dir, ports: [first.port, first.wsPort], operPassword: first.operPassword });
    // An operator holds its rooms as their op: Ergo shows it with an @.
    expect(await inRoom(await oper(again, "gus2"), "#bubble")).toMatch(/ :(.* )?@gnoworld\b/);
  });
});

describe("the template's limits and privacy (slice 3's max review)", { timeout: 30_000 }, () => {
  // The composer's budget (core's compose, 4c): Ergo relays an account's line of exactly it, under its nick, user
  // and cloak, and refuses one byte more rather than cut it (allow-truncation off).
  it("relays an account's line of the composer's whole budget, 510 bytes relayed, and refuses one byte more", async () => {
    const e = await start();
    const chief = await lobby(e);
    const member = await login(e, ADDRESS);
    await join(member, "#lobby");
    const head = "PRIVMSG #lobby :";
    const budget = LINE_BYTES - relayOf(ADDRESS);
    const text = (bytes: number) => "a".repeat(bytes - head.length);
    expect(compose("#lobby", text(budget), ADDRESS)).toMatchObject({
      kind: "line",
      line: head + text(budget),
      left: 0,
    });
    member.send(head + text(budget));
    const seen = await chief.expect(/PRIVMSG #lobby :a+$/);
    expect(Buffer.byteLength(seen.replace(/^@\S+ /, ""))).toBe(LINE_BYTES);
    expect(compose("#lobby", text(budget + 1), ADDRESS)).toStrictEqual({ kind: "long", over: 1 });
    member.send(head + text(budget + 1));
    await member.expect(/ 417 /);
  });

  // A visitor reaching Ergo through web: its address in X-Forwarded-For, from a trusted peer (loopback).
  const visitor = (e: Ergo, address: string): Promise<Ws | undefined> =>
    wsConnect(e.wsPort, { protocols: ["text.ircv3.net"], headers: { "X-Forwarded-For": address } });
  const registered = async (e: Ergo, address: string, nick: string): Promise<Raw> => {
    const ws = await visitor(e, address);
    if (ws === undefined) throw new Error(`the WebSocket from ${address} did not open`);
    const c = wsRaw(ws);
    c.send(`NICK ${nick}`);
    c.send(`USER u 0 * :${nick}`);
    await c.expect(/ 001 /);
    return c;
  };

  it("paces an account's burst past its first lines: fakelag", async () => {
    const e = await start();
    const chief = await lobby(e);
    const alice = await login(e, "alice");
    await join(alice, "#lobby");
    for (let n = 0; n < 30; n++) alice.send(`PRIVMSG #lobby :burst ${String(n)}`);
    await chief.expect(/PRIVMSG #lobby :burst 0$/);
    // Unpaced, all 30 arrive within milliseconds; paced, five and then two a second.
    await new Promise((resolve) => setTimeout(resolve, 2000));
    expect((logged(chief).match(/PRIVMSG #lobby :burst \d+$/gm) ?? []).length).toBeLessThan(15);
  });

  it("paces not the bot's operator class: its 30 lines all arrive at once (nofakelag)", async () => {
    const e = await start();
    const chief = await lobby(e);
    const alice = await login(e, "alice");
    await join(alice, "#lobby");
    for (let n = 0; n < 30; n++) chief.send(`PRIVMSG #lobby :unpaced ${String(n)}`);
    await alice.expect(/PRIVMSG #lobby :unpaced 29$/, 1000);
  });

  it("refuses a 17th connection from one visitor's address, not another's: ip-limits", async () => {
    const e = await start();
    for (let n = 0; n < 16; n++) await registered(e, "203.0.113.7", `crowd${String(n)}`);
    const last = await visitor(e, "203.0.113.7");
    if (last === undefined) throw new Error("the 17th WebSocket did not open");
    const c = wsRaw(last);
    c.send("NICK crowd16");
    c.send("USER u 0 * :crowd16");
    expect(await c.expect(/^ERROR /)).toContain("Too many clients from your network");
    await registered(e, "203.0.113.8", "elsewhere");
  });

  it("answers a fourth SASL try on one connection within a minute with a wait: login-throttling", async () => {
    const e = await start();
    const c = await open(e);
    await hello(c);
    for (let n = 0; n < 3; n++) expect(await sasl(c, "alice", "wrong")).toContain(" 904 ");
    // The right password too: the throttle is read before the password.
    expect(await sasl(c, "alice", "pw")).toMatch(/ 904 .*Please wait/);
  });

  it("shows a visitor's address to no other client, in no line, and not in Ergo's log: ip-cloaking", async () => {
    const e = await start();
    await lobby(e);
    const ws = await visitor(e, "198.51.100.23");
    if (ws === undefined) throw new Error("the WebSocket did not open");
    const alice = wsRaw(ws);
    await hello(alice);
    expect(await sasl(alice, "alice", "pw")).toContain(" 903 ");
    await finish(alice, "alice");
    await join(alice, "#lobby");
    await say(alice, "#lobby", "hello from afar");
    const gus = await guest(e, "gus");
    await join(gus, "#lobby");
    gus.send("WHOIS alice");
    gus.send("WHO #lobby");
    history(gus, "#lobby");
    await gus.expect(/BATCH -/);
    await sync(gus);
    expect(logged(gus)).toContain("hello from afar");
    expect(logged(gus)).not.toContain("198.51.100.23");
    expect(e.log()).not.toContain("198.51.100.23");
  });

  it("names no member of a room a guest cannot join, to that guest: default-user-modes +i", async () => {
    const e = await start();
    const chief = await lobby(e);
    await join(chief, "#club");
    chief.send("SAMODE #club +i");
    const carol = await login(e, "carol");
    chief.send("SAJOIN carol #club");
    await carol.expect(/ 366 carol #club /);
    const gus = await guest(e, "gus");
    gus.send("NAMES #club");
    gus.send("WHOIS carol");
    gus.send("WHO *");
    await sync(gus);
    expect(logged(gus)).not.toMatch(/ 353 .*carol/);
    expect(logged(gus)).not.toMatch(/ 319 gus carol /);
    expect(logged(gus)).not.toMatch(/ 352 gus \S+ \S+ \S+ \S+ carol /);
    chief.send("NAMES #club");
    await chief.expect(/ 353 .*carol/);
  });

  it("gives the bot's operator class no power over accounts: NickServ PASSWD refused", async () => {
    const e = await start();
    await login(e, "victim");
    const chief = await oper(e, "chief");
    chief.send("PRIVMSG NickServ :PASSWD victim ownedpass1234");
    await chief.expect(/NickServ.* NOTICE chief :Insufficient privileges/);
    chief.send("KILL victim :no power");
    await chief.expect(/ 481 chief /);
  });

  it("lets an account join 100 rooms, and refuses the 101st (405): max-channels-per-client", async () => {
    const e = await start();
    const chief = await oper(e, "chief");
    const rooms = Array.from({ length: 101 }, (_, n) => `#r${String(n)}`);
    for (const part of [rooms.slice(0, 50), rooms.slice(50)]) chief.send(`JOIN ${part.join(",")}`);
    await chief.expect(/ 366 chief #r100 /);
    for (const room of rooms) chief.send(`MODE ${room} -i`);
    await chief.expect(/ MODE #r100 -i/);
    const alice = await login(e, "alice");
    for (const part of [rooms.slice(0, 50), rooms.slice(50)]) alice.send(`JOIN ${part.join(",")}`);
    await alice.expect(/ 366 alice #r99 /);
    expect(await alice.expect(/ 405 alice /)).toContain(" #r100 ");
  });

  it("refuses a line past Ergo's length rather than cutting it: allow-truncation false", async () => {
    const e = await start();
    await lobby(e);
    const alice = await login(e, "alice");
    await join(alice, "#lobby");
    alice.send(`PRIVMSG #lobby :${"x".repeat(480)}`);
    await alice.expect(/ 417 alice /);
  });

  it("stores a removed reaction beside the reaction, so a replay takes it back: +draft/unreact", async () => {
    const e = await start();
    await lobby(e);
    const alice = await login(e, "alice");
    await join(alice, "#lobby");
    const id = await say(alice, "#lobby", "original message");
    alice.send(`@+draft/react=x;+draft/reply=${id} TAGMSG #lobby`);
    alice.send(`@+draft/unreact=x;+draft/reply=${id} TAGMSG #lobby`);
    await sync(alice);
    const late = await login(e, "late");
    await join(late, "#lobby");
    history(late, "#lobby");
    await late.expect(/BATCH -/);
    const stored = late.lines().filter((l) => replayed(" TAGMSG #lobby").test(l));
    expect(stored.join("\n")).toContain("+draft/react=x");
    expect(stored.join("\n")).toContain("+draft/unreact=x");
  });
});
