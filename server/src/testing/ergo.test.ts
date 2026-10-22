import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as joinPath } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { startErgo, type Ergo, type ErgoOptions } from "./ergo.ts";
import { rawClient, type Raw } from "./rawClient.ts";

// Every expectation comes from .claude/tmp/ergo-spike/RESULTS.md, section 3 (Ergo v2.19.1, run for real).

const CAPS =
  "message-tags server-time account-tag echo-message batch labeled-response sasl draft/chathistory " +
  "draft/event-playback draft/message-redaction account-notify extended-join multi-prefix draft/metadata-2 standard-replies";
const ORIGIN = "http://localhost:3000";
const ADDRESS = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
// The bcrypt hash `ergo genpasswd` printed for the passphrase "otherpw".
const OTHERPW_HASH = "$2a$04$ETom.QBtLC14tZ.OOsG0..gz5atMe0Y3vJRPjCNYAMRwXQVTZtyxq";

// Node's WebSocket takes a second argument the standard does not have: headers (so an Origin) and protocols.
interface WsEvent {
  data?: unknown;
}
interface Ws {
  protocol: string;
  send: (data: string) => void;
  close: () => void;
  addEventListener: (type: string, listener: (event: WsEvent) => void) => void;
}
interface WsOptions {
  headers?: Record<string, string>;
  protocols?: string[];
}
type WsConstructor = new (url: string, options?: WsOptions) => Ws;
const NodeWebSocket = (globalThis as unknown as { WebSocket: WsConstructor }).WebSocket;

const ergos: Ergo[] = [];
const clients: Raw[] = [];
const sockets: Ws[] = [];
let pings = 0;

const kept: string[] = [];
// A folder of the test's own, which Ergo keeps across a stop; the test removes it.
const keptFolder = (): string => {
  const dir = mkdtempSync(joinPath(tmpdir(), "gnoworld-ergo-kept-"));
  kept.push(dir);
  return dir;
};

afterEach(async () => {
  for (const ws of sockets.splice(0)) ws.close();
  await Promise.all(clients.splice(0).map((c) => c.close()));
  await Promise.all(ergos.splice(0).map((e) => e.stop()));
  for (const dir of kept.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const start = async (options?: ErgoOptions): Promise<Ergo> => {
  const e = await startErgo(options);
  ergos.push(e);
  return e;
};

const open = async (e: Ergo): Promise<Raw> => {
  const c = await rawClient(e.port);
  clients.push(c);
  return c;
};

const wsConnect = (port: number, options?: WsOptions): Promise<Ws | undefined> =>
  new Promise((resolve) => {
    const ws = new NodeWebSocket(`ws://127.0.0.1:${String(port)}/`, options);
    sockets.push(ws);
    ws.addEventListener("open", () => {
      resolve(ws);
    });
    ws.addEventListener("close", () => {
      resolve(undefined);
    });
    ws.addEventListener("error", () => {
      resolve(undefined);
    });
  });

// The same interface as rawClient, over a WebSocket: one IRC line per message.
const wsRaw = (ws: Ws): Raw => {
  const all: string[] = [];
  let next = 0;
  ws.addEventListener("message", (event) => {
    if (typeof event.data === "string") all.push(event.data);
  });
  return {
    send: (line) => {
      ws.send(line);
    },
    expect: async (pattern, ms = 2000) => {
      const end = Date.now() + ms;
      for (;;) {
        while (next < all.length) {
          const line = all[next++];
          if (line !== undefined && pattern.test(line)) return line;
        }
        if (Date.now() > end) throw new Error(`no line matched ${String(pattern)}: ${all.join("\n")}`);
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    },
    lines: () => [...all],
    close: () => {
      ws.close();
      return Promise.resolve();
    },
  };
};

// A line sent and answered proves the server handled everything sent before it on this connection.
const sync = async (c: Raw): Promise<void> => {
  const token = `sync${String(++pings)}`;
  c.send(`PING ${token}`);
  await c.expect(new RegExp(`PONG .*${token}`));
};

const hello = async (c: Raw, caps = CAPS): Promise<void> => {
  c.send("CAP LS 302");
  c.send(`CAP REQ :${caps}`);
  await c.expect(/CAP \S+ ACK /);
};

const sasl = async (c: Raw, account: string, passphrase: string): Promise<string> => {
  c.send("AUTHENTICATE PLAIN");
  await c.expect(/AUTHENTICATE \+/);
  c.send(`AUTHENTICATE ${Buffer.from(`\0${account}\0${passphrase}`).toString("base64")}`);
  return c.expect(/ (903|904) /);
};

// Registered (the MOTD's end, or its absence), unless the test waits for a refusal.
const finish = (c: Raw, nick: string, done = / 376 | 422 /): Promise<string> => {
  c.send("CAP END");
  c.send(`NICK ${nick}`);
  c.send(`USER u 0 * :${nick}`);
  return c.expect(done);
};

const login = async (
  e: Ergo,
  account: string,
  { pass = "pw", nick = account, caps = CAPS }: { pass?: string; nick?: string; caps?: string } = {},
): Promise<Raw> => {
  const c = await open(e);
  await hello(c, caps);
  expect(await sasl(c, account, pass)).toContain(" 903 ");
  await finish(c, nick);
  return c;
};

const guest = async (e: Ergo, nick: string, caps = CAPS): Promise<Raw> => {
  const c = await open(e);
  await hello(c, caps);
  await finish(c, nick);
  return c;
};

const oper = async (e: Ergo, name: string): Promise<Raw> => {
  const c = await login(e, name);
  c.send(`OPER admin ${e.operPassword}`);
  await c.expect(/ 381 /);
  return c;
};

const join = async (c: Raw, channel: string): Promise<void> => {
  c.send(`JOIN ${channel}`);
  await c.expect(new RegExp(` 366 \\S+ ${channel} `));
};

// An oper (who may create a channel) sits in #lobby.
const lobby = async (e: Ergo): Promise<Raw> => {
  const chief = await oper(e, "chief");
  await join(chief, "#lobby");
  return chief;
};

const msgid = (line: string): string => {
  const found = /msgid=(\w+)/.exec(line);
  if (found?.[1] === undefined) throw new Error(`no msgid in ${line}`);
  return found[1];
};

// Sends a PRIVMSG and returns its msgid, read from the echo.
const say = async (c: Raw, target: string, text: string): Promise<string> => {
  c.send(`PRIVMSG ${target} :${text}`);
  return msgid(await c.expect(new RegExp(`PRIVMSG ${target} :${text}$`)));
};

const history = (c: Raw, target: string): void => {
  c.send(`CHATHISTORY LATEST ${target} * 50`);
};

// A line replayed from history carries a batch tag; the live one does not.
const replayed = (what: string): RegExp => new RegExp(`^@\\S*batch=\\S* .*${what}`);

const logged = (c: Raw): string => c.lines().join("\n");

describe("guests and rooms", { timeout: 20_000 }, () => {
  it("refuses a guest speaking in a +M room, and lets an account speak", async () => {
    const e = await start();
    const chief = await lobby(e);
    chief.send("MODE #lobby +M");
    await chief.expect(/MODE #lobby \+M/);
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

  it("keeps a room's history and a direct message across a restart", { timeout: 40_000 }, async () => {
    const e = await start({ dir: keptFolder() });
    const chief = await lobby(e);
    chief.send("CS REGISTER #lobby");
    await chief.expect(/successfully registered/);
    const alice = await login(e, "alice");
    await join(alice, "#lobby");
    const bob = await login(e, "bob");
    await say(alice, "#lobby", "persist-marker-1");
    alice.send("PRIVMSG bob :dm-marker-1");
    await sync(alice);
    await sync(bob);
    const { dir } = e;
    await e.stop();

    const again = await start({ dir });
    const reader = await login(again, "bob");
    await join(reader, "#lobby");
    history(reader, "#lobby");
    await reader.expect(replayed("PRIVMSG #lobby :persist-marker-1$"));
    history(reader, "alice");
    await reader.expect(replayed("PRIVMSG bob :dm-marker-1$"));
    const gus = await guest(again, "gus");
    await join(gus, "#lobby");
    history(gus, "#lobby");
    await gus.expect(replayed("PRIVMSG #lobby :persist-marker-1$"));
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
    chief.send("MODE #inv +i");
    await chief.expect(/MODE #inv \+i/);
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
    const chief = await oper(e, "chief");
    const waiting = (await guest(e, "waiter")).expect(/never sent/, 20_000);
    chief.send("DEBUG CRASHSERVER");
    const confirm = /To confirm, run this command: \/DEBUG CRASHSERVER (\S+)/.exec(
      await chief.expect(/To confirm/),
    )?.[1];
    chief.send(`DEBUG CRASHSERVER ${confirm ?? ""}`);
    const started = Date.now();
    await expect(waiting).rejects.toThrow(/closed/);
    expect(Date.now() - started).toBeLessThan(5000);
    await expect(e.stop()).resolves.toBeUndefined();
  });

  it("leaves no Ergo running when a test process ends without stopping it", async () => {
    const script = `import { startErgo } from ${JSON.stringify(new URL("ergo.ts", import.meta.url).href)};
const e = await startErgo();
process.stdout.write(String(e.pid));
process.exit(0);`;
    const run = spawnSync(process.execPath, ["--input-type=module", "-e", script], {
      encoding: "utf8",
      timeout: 20_000,
    });
    const pid = Number(run.stdout);
    expect(pid).toBeGreaterThan(0);
    await vi.waitFor(() => {
      expect(() => process.kill(pid, 0)).toThrow(/ESRCH/);
    });
  });
});
