import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { inspect } from "node:util";
import { Address, toAddress } from "@gnoworld/schemas";
import fc from "fast-check";
import { afterAll, describe, expect, it } from "vitest";
import { isTeam, isTrusted, loadRoles, mayCreateRoom, moderates, type Roles, spared } from "./roles.ts";

const TEAM = Address.parse("g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5");
const TRUSTED = Address.parse("g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv");
const EARTH_MOD = Address.parse("g1zgldsmn6ck6w4p325xd3j8y779ky6fpjnz3uh9");
const BUBBLE_MOD = Address.parse("g1m68zzc430znqyxzv6jsfz45hgccacx3mk6qajw");
// Valid, and in no list of the file.
const STRANGER = Address.parse("g1uauvt7txunf9zeu2qyrzv0pa5uvwjlq90r3qpa");
const RULES = { bannedWords: ["spam"], linksPerMessage: 3, mentionsPerMessage: 5, linksForNewAccount: 2 };
const FILE = {
  team: [TEAM],
  trusted: [TRUSTED],
  worlds: [
    { slug: "earth", moderators: [EARTH_MOD], rules: RULES },
    { slug: "bubble", moderators: [BUBBLE_MOD], rules: RULES },
  ],
};

const dir = mkdtempSync(join(tmpdir(), "gnoworld-roles-"));
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});
let files = 0;
const written = (content: string): string => {
  const path = join(dir, `roles-${String((files += 1))}.json`);
  writeFileSync(path, content);
  return path;
};
// Loaded in each test, never at import or in a hook: StrykerJS judges only code a test runs.
const rolesFile = written(JSON.stringify(FILE));
const load = (): Roles => loadRoles(rolesFile);

// The whole error as a crash would print it: message, stack and causes.
const failure = (content: string): string => {
  const path = written(content);
  try {
    loadRoles(path);
  } catch (error) {
    return inspect(error, { depth: 5 });
  }
  throw new Error("loadRoles accepted the file");
};
const world = (patch: object): string => JSON.stringify({ ...FILE, worlds: [{ ...FILE.worlds[0], ...patch }] });

describe("loadRoles", () => {
  it("reads the file's rules for each world", () => {
    const roles = load();
    expect(roles.worlds.get("earth")?.rules).toEqual(RULES);
    expect([...roles.worlds.keys()]).toEqual(["earth", "bubble"]);
  });

  it("reads the file the server ships, with the Earth among its worlds", () => {
    expect(loadRoles(fileURLToPath(new URL("../../roles.json", import.meta.url))).worlds.has("earth")).toBe(true);
  });

  it("takes the smallest values each field allows", () => {
    const smallest = { ...RULES, bannedWords: [], linksPerMessage: 0, mentionsPerMessage: 0, linksForNewAccount: 0 };
    const file = {
      team: [],
      trusted: [],
      worlds: [
        { slug: "a1", moderators: [], rules: smallest },
        { slug: "a-b", moderators: [], rules: RULES },
        { slug: "earth-two", moderators: [], rules: RULES },
        { slug: "a-bc-de", moderators: [], rules: RULES },
      ],
    };
    expect([...loadRoles(written(JSON.stringify(file))).worlds.keys()]).toEqual(["a1", "a-b", "earth-two", "a-bc-de"]);
  });

  it("stops on a missing file, naming it", () => {
    expect(() => loadRoles(join(dir, "absent.json"))).toThrow(/^roles file .*absent\.json: unreadable$/);
    // The cause stays, for whoever reads the crash: the path is no secret.
    let thrown: unknown;
    try {
      loadRoles(join(dir, "absent.json"));
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toMatchObject({ cause: { code: "ENOENT" } });
  });

  it.each([
    ["not JSON, which JSON.parse quotes", "planted-value"],
    ["an unknown key at the top", JSON.stringify({ ...FILE, "planted-value": [TEAM] })],
    ["an unknown key in a world", world({ owner: "planted-value" })],
    ["an unknown key in the rules", world({ rules: { ...RULES, "planted-value": 1 } })],
    ["a missing list", JSON.stringify({ team: [TEAM], worlds: FILE.worlds })],
    ["an address in upper case", JSON.stringify({ ...FILE, trusted: [TRUSTED.toUpperCase().replace("G1", "g1")] })],
    ["a look-alike address", JSON.stringify({ ...FILE, trusted: ["g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tw"] })],
    ["an address twice in a list", JSON.stringify({ ...FILE, team: [TEAM, TEAM] })],
    ["an address twice among the trusted", JSON.stringify({ ...FILE, trusted: [TRUSTED, TRUSTED] })],
    ["a team member listed as trusted", JSON.stringify({ ...FILE, trusted: [TRUSTED, TEAM] })],
    ["a team member listed as a moderator", world({ moderators: [EARTH_MOD, TEAM] })],
    ["a moderator twice in a world", world({ moderators: [EARTH_MOD, EARTH_MOD] })],
    ["a world twice", JSON.stringify({ ...FILE, worlds: [FILE.worlds[0], FILE.worlds[0]] })],
    ["a slug in upper case", world({ slug: "Earth" })],
    ["a slug with a double hyphen", world({ slug: "earth--two" })],
    ["a slug starting with a hyphen", world({ slug: "-earth" })],
    ["a slug ending with a hyphen", world({ slug: "earth-" })],
    ["a slug with a space", world({ slug: "ear th" })],
    ["an empty slug", world({ slug: "" })],
    ...["/", "#", ",", "\n", "\r", "é"].map((c) => [
      `a slug holding ${JSON.stringify(c)}`,
      world({ slug: `planted-value${c}x` }),
    ]),
    ["a negative cap", world({ rules: { ...RULES, linksPerMessage: -1 } })],
    ["a cap that is not whole", world({ rules: { ...RULES, mentionsPerMessage: 2.5 } })],
    ["an empty banned word", world({ rules: { ...RULES, bannedWords: ["", "planted-value"] } })],
  ])("stops on %s, naming the file and the place, never what it holds", (_, content) => {
    const printed = failure(content);
    expect(printed).toMatch(/roles file .*\.json: /);
    expect(printed).not.toContain("planted-value");
  });

  it.each([
    {
      kind: "an address",
      content: world({ moderators: [EARTH_MOD, "g1nope"] }),
      place: "worlds.0.moderators.1",
      code: "custom",
    },
    { kind: "a slug", content: world({ slug: "Earth" }), place: "worlds.0.slug", code: "invalid_format" },
    {
      kind: "a team member as trusted",
      content: JSON.stringify({ ...FILE, trusted: [TRUSTED, TEAM] }),
      place: "trusted.1",
      code: "custom",
    },
    {
      kind: "a team member as moderator",
      content: world({ moderators: [EARTH_MOD, TEAM] }),
      place: "worlds.0.moderators.1",
      code: "custom",
    },
    {
      kind: "a cap",
      content: world({ rules: { ...RULES, linksForNewAccount: -1 } }),
      place: "worlds.0.rules.linksForNewAccount",
      code: "too_small",
    },
    {
      kind: "an unknown key",
      content: JSON.stringify({ ...FILE, admins: [] }),
      place: "(top)",
      code: "unrecognized_keys",
    },
  ])("names the place and the kind of a fault in $kind", ({ content, place, code }) => {
    expect(failure(content)).toMatch(
      new RegExp(`roles file \\S+\\.json: ${place.replace(/[.()]/g, "\\$&")}: ${code}\\b`),
    );
  });
});

describe("groups and rooms by role (3m)", () => {
  // n accounts no list of the file holds.
  const accounts = (n: number) => Array.from({ length: n }, (_, i) => toAddress(new Uint8Array(20).fill(i + 1)));
  // The Earth with its groups and rooms, the Bubble with none.
  const typed = (patch: object) =>
    JSON.stringify({
      ...FILE,
      worlds: [{ ...FILE.worlds[0], groups: { crew: [STRANGER] }, ...patch }, FILE.worlds[1]],
    });

  it("reads each world's groups and typed rooms, a room hidden or not, a world with none", () => {
    const roles = loadRoles(
      written(
        typed({
          rooms: [
            { room: "#earth", type: "announcement" },
            { room: "#earth/crew", type: "members", readers: "crew" },
            { room: "#earth/news", type: "members-write", readers: "crew", writers: "crew", hidden: true },
            { room: "#earth/door", type: "accounts" },
          ],
        }),
      ),
    );
    const earth = roles.worlds.get("earth");
    expect([...(earth?.groups?.get("crew") ?? [])]).toEqual([STRANGER]);
    expect([...(earth?.rooms ?? [])]).toEqual([
      ["#earth", { type: "announcement", hidden: false }],
      ["#earth/crew", { type: "members", readers: "crew", hidden: false }],
      ["#earth/news", { type: "members-write", readers: "crew", writers: "crew", hidden: true }],
      ["#earth/door", { type: "accounts", hidden: false }],
    ]);
    expect([roles.worlds.get("bubble")?.groups?.size, roles.worlds.get("bubble")?.rooms?.size]).toEqual([0, 0]);
  });

  it("takes a members room of 100 accounts, its moderators and the team among them", () => {
    const crew = accounts(98);
    const file = typed({ groups: { crew }, rooms: [{ room: "#earth/crew", type: "members", readers: "crew" }] });
    expect(loadRoles(written(file)).worlds.get("earth")?.groups?.get("crew")?.size).toBe(98);
  });

  it.each([
    ["an unknown type", { rooms: [{ room: "#earth", type: "private" }] }, "worlds.0.rooms.0.type"],
    [
      "a group no world names",
      { rooms: [{ room: "#earth/crew", type: "members", readers: "ghosts" }] },
      "worlds.0.rooms.0.readers",
    ],
    ["a room of another world", { rooms: [{ room: "#bubble/x", type: "open" }] }, "worlds.0.rooms.0.room"],
    [
      "a room of a world whose slug only starts it",
      { rooms: [{ room: "#earthling", type: "open" }] },
      "worlds.0.rooms.0.room",
    ],
    [
      "a members room with no readers",
      { rooms: [{ room: "#earth/crew", type: "members" }] },
      "worlds.0.rooms.0.readers",
    ],
    [
      "a members-write room with no writers",
      { rooms: [{ room: "#earth/crew", type: "members-write", readers: "crew" }] },
      "worlds.0.rooms.0.writers",
    ],
    [
      "readers on an open room",
      { rooms: [{ room: "#earth", type: "open", readers: "crew" }] },
      "worlds.0.rooms.0.readers",
    ],
    [
      "a room twice",
      {
        rooms: [
          { room: "#earth", type: "open" },
          { room: "#earth", type: "accounts" },
        ],
      },
      "worlds.0.rooms.1.room",
    ],
    ["a group's name in upper case", { groups: { Crew: [STRANGER] } }, "worlds.0.groups.Crew"],
    ["an account twice in a group", { groups: { crew: [STRANGER, STRANGER] } }, "worlds.0.groups.crew"],
    ["an empty room name", { rooms: [{ room: "#earth/", type: "open" }] }, "worlds.0.rooms.0.room"],
    ["a room name in upper case", { rooms: [{ room: "#earth/Crew", type: "open" }] }, "worlds.0.rooms.0.room"],
    ["a room name with a space", { rooms: [{ room: "#earth/a b", type: "open" }] }, "worlds.0.rooms.0.room"],
    ["a room name with a comma", { rooms: [{ room: "#earth/a,#x", type: "open" }] }, "worlds.0.rooms.0.room"],
    ["a room name with CR LF", { rooms: [{ room: "#earth/a\r\nQUIT", type: "open" }] }, "worlds.0.rooms.0.room"],
    ["a room name with a second slash", { rooms: [{ room: "#earth/a/b", type: "open" }] }, "worlds.0.rooms.0.room"],
    [
      "a room name of 33 characters",
      { rooms: [{ room: `#earth/${"a".repeat(33)}`, type: "open" }] },
      "worlds.0.rooms.0.room",
    ],
    // A computed key: a literal __proto__ would set the object's prototype, not a key.
    ["a group named __proto__", { groups: { ["__proto__"]: [STRANGER] } }, "worlds.0.groups"],
    ["hidden as text", { rooms: [{ room: "#earth", type: "open", hidden: "yes" }] }, "worlds.0.rooms.0.hidden"],
    [
      "writers on a members room",
      { rooms: [{ room: "#earth/crew", type: "members", readers: "crew", writers: "crew" }] },
      "worlds.0.rooms.0.writers",
    ],
    [
      "readers on an announcement room",
      { rooms: [{ room: "#earth", type: "announcement", readers: "crew" }] },
      "worlds.0.rooms.0.readers",
    ],
    [
      "writers on an accounts room",
      { rooms: [{ room: "#earth", type: "accounts", writers: "crew" }] },
      "worlds.0.rooms.0.writers",
    ],
    [
      "a writers group no world names",
      { rooms: [{ room: "#earth/desk", type: "members-write", readers: "crew", writers: "ghosts" }] },
      "worlds.0.rooms.0.writers",
    ],
  ])("stops on %s, naming its place", (_, patch, place) => {
    expect(failure(typed(patch))).toContain(`: ${place}: `);
  });

  it("counts each account once toward the 100: a moderator in the group, readers and writers together", () => {
    const crew = [...accounts(97), EARTH_MOD, TEAM];
    const once = typed({ groups: { crew }, rooms: [{ room: "#earth/crew", type: "members", readers: "crew" }] });
    expect(loadRoles(written(once)).worlds.get("earth")?.groups?.get("crew")?.size).toBe(99);
    const all = accounts(120);
    const [readers, writers] = [all.slice(0, 60), all.slice(60, 120)];
    const desk = { room: "#earth/desk", type: "members-write", readers: "readers", writers: "writers" };
    expect(failure(typed({ groups: { readers, writers }, rooms: [desk] }))).toContain(
      ": worlds.0.rooms.0.readers: custom",
    );
    const same = { ...desk, writers: "readers" };
    expect(loadRoles(written(typed({ groups: { readers }, rooms: [same] }))).worlds.get("earth")?.rooms?.size).toBe(1);
  });

  it("loads any roles file or refuses it naming its place, never anything else", () => {
    fc.assert(
      fc.property(fc.jsonValue(), (value) => {
        try {
          loadRoles(written(JSON.stringify(value)));
        } catch (error) {
          expect(String(error)).toMatch(/^Error: roles file [^\n]*\.json: [^\n]+: \w+$/);
        }
      }),
      { numRuns: 200 },
    );
  });

  it("takes a group named with hyphens, and refuses one with another character or groups of null, naming the place (F575)", () => {
    const desk = { room: "#earth/desk", type: "members-write", readers: "my-crew", writers: "my-crew" };
    const roles = loadRoles(written(typed({ groups: { "my-crew": [STRANGER] }, rooms: [desk] })));
    expect(roles.worlds.get("earth")?.rooms?.get("#earth/desk")).toEqual({
      type: "members-write",
      readers: "my-crew",
      writers: "my-crew",
      hidden: false,
    });
    expect(failure(typed({ groups: { "crew!": [STRANGER] } }))).toContain(": worlds.0.groups.crew!: ");
    expect(failure(typed({ groups: null }))).toContain(": worlds.0.groups: ");
  });

  it("holds every room of the file to Ergo's 64 characters: a typed room's and a world's main one (F590)", () => {
    const at = (slug: string, name: string) =>
      JSON.stringify({
        ...FILE,
        worlds: [{ ...FILE.worlds[0], slug, rooms: [{ room: `#${slug}/${name}`, type: "open" }] }, FILE.worlds[1]],
      });
    const name = "a".repeat(32);
    expect(loadRoles(written(at("w".repeat(30), name))).worlds.get("w".repeat(30))?.rooms?.size).toBe(1);
    expect(failure(at("w".repeat(31), name))).toContain(": worlds.0.rooms.0.room: ");
    expect(loadRoles(written(world({ slug: "w".repeat(63) }))).worlds.has("w".repeat(63))).toBe(true);
    expect(failure(world({ slug: "w".repeat(64) }))).toContain(": worlds.0.slug: ");
  });

  it("counts no invite list for a world of only open rooms, past 100 moderators (F575)", () => {
    const file = typed({ moderators: accounts(101), rooms: [{ room: "#earth", type: "open" }] });
    expect(loadRoles(written(file)).worlds.get("earth")?.moderators.size).toBe(101);
  });

  it("stops on a members room past Ergo's 100-entry list, its moderators and the team counted", () => {
    const crew = accounts(99);
    const file = typed({ groups: { crew }, rooms: [{ room: "#earth/crew", type: "members", readers: "crew" }] });
    expect(failure(file)).toContain(": worlds.0.rooms.0.readers: custom");
  });
});

describe("who may do what", () => {
  const everyone = [TEAM, TRUSTED, EARTH_MOD, BUBBLE_MOD, STRANGER];
  const answers = (ask: (who: Address) => boolean): boolean[] => everyone.map(ask);

  it("knows the team, and only the team", () => {
    expect(answers((who) => isTeam(load(), who))).toEqual([true, false, false, false, false]);
  });

  it("trusts the team and the trusted, not a moderator by that role alone", () => {
    expect(answers((who) => isTrusted(load(), who))).toEqual([true, true, false, false, false]);
  });

  it("lets a world's moderators and the team moderate it, and no other world", () => {
    expect(answers((who) => moderates(load(), who, "earth"))).toEqual([true, false, true, false, false]);
    expect(answers((who) => moderates(load(), who, "bubble"))).toEqual([true, false, false, true, false]);
  });

  it("spares the team and the trusted from the automatic mute, by the account Ergo names, and no one else (3k)", () => {
    const isSpared = spared(load());
    expect(answers((who) => isSpared(who))).toEqual([true, true, false, false, false]);
    expect([isSpared("alice"), isSpared(""), isSpared(TEAM.toUpperCase())]).toEqual([false, false, false]);
  });

  it("lets a world's moderators and the team make its rooms, and nobody else, nor in a world unnamed (3l)", () => {
    expect(answers((who) => mayCreateRoom(load(), who, "earth"))).toEqual([true, false, true, false, false]);
    expect(answers((who) => mayCreateRoom(load(), who, "bubble"))).toEqual([true, false, false, true, false]);
    expect(answers((who) => mayCreateRoom(load(), who, "elsewhere"))).toEqual([false, false, false, false, false]);
  });

  it("lets nobody moderate a world the file does not name, the team included", () => {
    expect(answers((who) => moderates(load(), who, "elsewhere"))).toEqual([false, false, false, false, false]);
  });
});
