import { Address } from "@gnoworld/schemas";
import { openDatabase } from "@gnoworld/service/db";
import { serverLinks } from "../login/linkRoutes.ts";
import { migrations } from "../migrations.ts";
import { cliFile, cliKey } from "../testing/cliSigner.ts";
import { wallet } from "../testing/signer.ts";
import type { Send } from "@gnoworld/service/net";
import { afterEach, describe, expect, it, vi } from "vitest";
import { asOf, makeMayModerate, type MayModerateOptions } from "./mayModerate.ts";
import { makeOwners } from "./owners.ts";
import { isTeam, mayCreateRoom, spared, type Roles } from "./roles.ts";
import { staffOf } from "../rooms/types.ts";

// Part 4 of the owners' moderation (docs/plans/owners-moderation.md, section 3's "Part 4" and 6): the one place that gives an owner's right.
// A right is the roles file's (`moderates`, unchanged) or the holder of the room's namespace being the account or one of its identity, read
// on the world's own chain. Each test is named after the fault it catches (the security review's traps, 1 to 9, and F13831).
const ALICE = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
const MOD = Address.parse("g1m68zzc430znqyxzv6jsfz45hgccacx3mk6qajw");
const OWNER = Address.parse("g1zgldsmn6ck6w4p325xd3j8y779ky6fpjnz3uh9");
const TEAM = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
const STRANGER = Address.parse("g1mpkp5lm8lwpm0pym4388836d009zfe4maxlqsq");
const PEPPER = "a-pepper-of-forty-characters-0123456789";
const VISITOR = "203.0.113.7";
const REALM_ROOM = "#acme-feed";
const ROLES: Roles = {
  team: new Set([TEAM]),
  trusted: new Set(),
  worlds: new Map([
    [
      "bubble",
      {
        moderators: new Set([MOD]),
        rules: { linksPerMessage: 3, mentionsPerMessage: 3, linksForNewAccount: 0, bannedWords: [] },
      },
    ],
  ]),
};

interface Setup {
  // The Earth's public rooms' makers, who moderate their own room alone.
  makers?: Record<string, Address>;
  // null: nobody holds it; "failed": the read gave no answer; "fails": it rejected.
  holder?: Address | null | "failed" | "fails";
  members?: Record<string, readonly Address[]>;
  namespaces?: Record<string, string>;
}
function setup({
  makers = {},
  holder = OWNER,
  members = {},
  namespaces = { [REALM_ROOM]: "acme", "#bubble": "bubble-ns" },
}: Setup = {}) {
  const reads: [string, string][] = [];
  const asked = { identityOf: [] as Address[], namespaceOf: [] as string[] };
  const state = { holder, members };
  const read: MayModerateOptions["identityOf"] = (address) => {
    asked.identityOf.push(address);
    return state.members[address] ?? [address];
  };
  const options: MayModerateOptions = {
    staff: (room, who) => staffOf(ROLES, room, who),
    maker: (room, who) => makers[room] === who,
    placeOf: (room) => {
      asked.namespaceOf.push(room);
      const namespace = namespaces[room];
      if (namespace === undefined) return undefined;
      return {
        namespace,
        owner: (name, visitor) => {
          reads.push([name, visitor]);
          if (state.holder === "fails") return Promise.reject(new Error("down"));
          return Promise.resolve(state.holder === "failed" ? undefined : state.holder);
        },
      };
    },
    identityOf: read,
  };
  return { may: makeMayModerate(options), reads, asked, state };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("the roles file's right", () => {
  it("gives a world's moderator the staff right, and reads no owner (no read when the file already says yes)", async () => {
    const t = setup();
    expect(await t.may(MOD, "#bubble", VISITOR)).toEqual({ as: "staff" });
    expect(await t.may(TEAM, REALM_ROOM, VISITOR)).toEqual({ as: "staff" });
    expect(t.reads).toEqual([]);
  });

  it("leaves a moderator of one world with no right in a room the file does not list, and reads that room's owner", async () => {
    const t = setup({ holder: null });
    expect(await t.may(MOD, REALM_ROOM, VISITOR)).toBe(false);
    expect(t.reads).toHaveLength(1);
  });
});

describe("the staff right is today's pin rule", () => {
  it("is given to a world's moderator in a sub-room of a roles-file world, and as a maker to the maker of an Earth room, with no read", async () => {
    const t = setup({ makers: { "#earth/club": ALICE } });
    expect(await t.may(MOD, "#bubble/crew", VISITOR)).toEqual({ as: "staff" });
    expect(await t.may(ALICE, "#earth/club", VISITOR)).toEqual({ as: "maker" });
    expect(await t.may(STRANGER, "#earth/club", VISITOR)).toBe(false);
    expect(t.reads).toEqual([]);
  });
});

describe("the owner is read on the room's own chain (H3)", () => {
  it("asks the reader the room's place names, so a holder on one chain has no right on a world of another", async () => {
    const asked: string[] = [];
    const chain = (name: string, holder: Address | undefined) => () => {
      asked.push(name);
      return Promise.resolve(holder);
    };
    const may = makeMayModerate({
      staff: () => false,
      maker: () => false,
      placeOf: (room) => ({
        namespace: "acme",
        owner: room === "#one" ? chain("first", OWNER) : chain("second", undefined),
      }),
      identityOf: (address) => [address],
    });
    expect(await may(OWNER, "#one", VISITOR)).toEqual({ as: "owner", owner: OWNER });
    expect(await may(OWNER, "#two", VISITOR)).toBe(false);
    expect(asked).toEqual(["first", "second"]);
  });
});

describe("an owner's right", () => {
  it("is given to the holder of the room's namespace, who is named in the right", async () => {
    const t = setup({ holder: OWNER });
    expect(await t.may(OWNER, REALM_ROOM, VISITOR)).toEqual({ as: "owner", owner: OWNER });
    expect(t.reads.map(([namespace]) => namespace)).toEqual(["acme"]);
  });

  it("is given to an account linked to the holder, the holder named and not the account", async () => {
    const t = setup({ holder: OWNER, members: { [ALICE]: [ALICE, OWNER] } });
    expect(await t.may(ALICE, REALM_ROOM, VISITOR)).toEqual({ as: "owner", owner: OWNER });
  });

  it("is given to a free address by its own address alone (identityOf of a free address is itself)", async () => {
    const t = setup({ holder: ALICE });
    expect(await t.may(ALICE, REALM_ROOM, VISITOR)).toEqual({ as: "owner", owner: ALICE });
  });

  it("is refused to an account of nobody's identity when another holds the namespace", async () => {
    const t = setup({ holder: OWNER });
    expect(await t.may(ALICE, REALM_ROOM, VISITOR)).toBe(false);
  });

  it("is refused to a linked account of another identity than the holder's", async () => {
    const t = setup({ holder: OWNER, members: { [ALICE]: [ALICE, STRANGER] } });
    expect(await t.may(ALICE, REALM_ROOM, VISITOR)).toBe(false);
  });

  it("is lost after an unlink: the identity is read at each check, never kept", async () => {
    const t = setup({ holder: OWNER, members: { [ALICE]: [ALICE, OWNER] } });
    expect(await t.may(ALICE, REALM_ROOM, VISITOR)).not.toBe(false);
    t.state.members = {};
    expect(await t.may(ALICE, REALM_ROOM, VISITOR)).toBe(false);
  });

  it("is refused when the holder is undefined, nobody and a failed read alike, and a rejected read refuses too", async () => {
    expect(await setup({ holder: null }).may(ALICE, REALM_ROOM, VISITOR)).toBe(false);
    expect(await setup({ holder: "failed" }).may(ALICE, REALM_ROOM, VISITOR)).toBe(false);
    expect(await setup({ holder: "fails" }).may(ALICE, REALM_ROOM, VISITOR)).toBe(false);
  });
});

describe("the namespace comes from the server alone", () => {
  it("reads no owner for a room the server cannot place (the Earth, an unknown room) and refuses", async () => {
    const t = setup({ holder: ALICE });
    expect(await t.may(ALICE, "#earth", VISITOR)).toBe(false);
    expect(await t.may(ALICE, "#unknown", VISITOR)).toBe(false);
    expect(t.reads).toEqual([]);
  });

  it("is not made by a room named like an address: the namespace asked is the server's, so a self-granting room reads nothing", async () => {
    const t = setup({ holder: ALICE });
    expect(await t.may(ALICE, `#${ALICE}`, VISITOR)).toBe(false);
    expect(t.asked.namespaceOf).toEqual([`#${ALICE}`]);
    expect(t.reads).toEqual([]);
  });

  it("asks the namespace of the room alone, never of anything else the caller holds", async () => {
    const t = setup({ holder: OWNER });
    await t.may(OWNER, REALM_ROOM, VISITOR);
    expect(t.asked.namespaceOf).toEqual([REALM_ROOM]);
  });
});

describe("what is no account", () => {
  it.each([["alice"], [""], ["g1short"], [`${ALICE} `]])(
    "gives %j no right, with no read and no identity asked",
    async (who) => {
      const t = setup({ holder: ALICE });
      expect(await t.may(who, REALM_ROOM, VISITOR)).toBe(false);
      expect(t.reads).toEqual([]);
      expect(t.asked.identityOf).toEqual([]);
    },
  );
});

describe("the read's visitor key", () => {
  it("holds the account and the visitor's /64 together, so neither alone spends another's reads (F13831)", async () => {
    const t = setup({ holder: OWNER });
    await t.may(ALICE, REALM_ROOM, "2001:db8:1:2::/64");
    await t.may(STRANGER, REALM_ROOM, "2001:db8:1:2::/64");
    await t.may(ALICE, REALM_ROOM, "2001:db8:9:9::/64");
    const keys = t.reads.map(([, key]) => key);
    expect(new Set(keys).size).toBe(3);
    expect(keys[0]).toContain(ALICE);
    expect(keys[0]).toContain("2001:db8:1:2::/64");
    expect(keys[1]).toContain(STRANGER);
  });
});

describe("an owner is no staff", () => {
  it("leaves isTeam, staffOf, spared and mayCreateRoom false for an address that holds a namespace or is linked to the team", async () => {
    const t = setup({ holder: OWNER, members: { [ALICE]: [ALICE, TEAM], [OWNER]: [OWNER] } });
    expect(await t.may(ALICE, REALM_ROOM, VISITOR)).toBe(false);
    expect(await t.may(OWNER, REALM_ROOM, VISITOR)).toEqual({ as: "owner", owner: OWNER });
    for (const who of [ALICE, OWNER]) {
      expect(isTeam(ROLES, who)).toBe(false);
      expect(spared(ROLES)(who)).toBe(false);
      expect(staffOf({ team: ROLES.team, worlds: new Map() }, "#bubble", who)).toBe(false);
      expect(mayCreateRoom(ROLES, who, "bubble")).toBe(false);
    }
  });
});

describe("the chain's outage", () => {
  it("refuses at 5 s when the chain never answers, with the real reader and a transport that hangs", async () => {
    vi.useFakeTimers();
    const hung: Send = () => new Promise(() => undefined);
    const owner = makeOwners({ send: hung, rpc: "https://rpc.test", now: () => Date.now() }).lookup;
    const may = makeMayModerate({
      staff: () => false,
      maker: () => false,
      placeOf: () => ({ namespace: "acme-world", owner }),
      identityOf: (address) => [address],
    });
    const result = may(ALICE, REALM_ROOM, VISITOR);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await result).toBe(false);
  });
});

describe("a link to the team grants no role (trap 1, with real links)", () => {
  it("leaves a key linked to a team member out of isTeam, spared, staffOf and mayCreateRoom, and with no staff right", async () => {
    const db = openDatabase(":memory:", migrations);
    const [lead, key] = [wallet(), cliKey()];
    const roles: Roles = { ...ROLES, team: new Set([lead.address]) };
    const at = Date.now();
    const links = serverLinks(db, {
      now: () => at,
      chainId: "onyx-1",
      secret: PEPPER,
    });
    const made = links.startLink({
      by: lead.address,
      kind: "cli",
      subject: key.address,
      host: "gnoworld.test",
      signedAt: at,
    });
    if (typeof made === "string") throw new Error(made);
    const done = await links.finishLink({
      kind: "cli",
      nonce: made.nonce,
      by: lead.address,
      address: key.address,
      file: cliFile(key, made.text),
      host: "gnoworld.test",
      signedAt: at,
    });
    expect(typeof done).toBe("object");
    expect(links.identityOf(key.address)).toContain(lead.address);
    const may = makeMayModerate({
      staff: (room, who) => staffOf(roles, room, who),
      maker: () => false,
      placeOf: () => undefined,
      identityOf: links.identityOf,
    });
    expect(await may(key.address, "#bubble", VISITOR)).toBe(false);
    expect(await may(lead.address, "#bubble", VISITOR)).toEqual({ as: "staff" });
    expect(isTeam(roles, key.address)).toBe(false);
    expect(spared(roles)(key.address)).toBe(false);
    expect(staffOf(roles, "#bubble", key.address)).toBe(false);
    expect(mayCreateRoom(roles, key.address, "bubble")).toBe(false);
    db.close();
  });
});

describe("judging a target: the right, or the read that could not tell (rights review, low)", () => {
  it("says failed, not no, when the owner read gave no answer or rejected, and no only when nobody holds the namespace", async () => {
    expect(await setup({ holder: "failed" }).may.judge(ALICE, REALM_ROOM, VISITOR)).toBe("failed");
    expect(await setup({ holder: "fails" }).may.judge(ALICE, REALM_ROOM, VISITOR)).toBe("failed");
    expect(await setup({ holder: null }).may.judge(ALICE, REALM_ROOM, VISITOR)).toBe(false);
    expect(await setup({ holder: OWNER }).may.judge(ALICE, REALM_ROOM, VISITOR)).toBe(false);
  });

  it("gives the rights as `may` does, and answers a room with no place as no, with no read", async () => {
    const t = setup({ holder: OWNER });
    expect(await t.may.judge(OWNER, REALM_ROOM, VISITOR)).toEqual({ as: "owner", owner: OWNER });
    expect(await t.may.judge(MOD, "#bubble", VISITOR)).toEqual({ as: "staff" });
    expect(await t.may.judge(ALICE, "#earth", VISITOR)).toBe(false);
  });
});

describe("asOf, the log's words for a right (the mutants of slice 13)", () => {
  it("gives an owner's address with the owner's and nothing else with a staff's or a maker's: no key of undefined", () => {
    expect(asOf({ as: "owner", owner: OWNER })).toStrictEqual({ as: "owner", owner: OWNER });
    expect(asOf({ as: "staff" })).toStrictEqual({ as: "staff" });
    expect(asOf({ as: "maker" })).toStrictEqual({ as: "maker" });
  });
});
