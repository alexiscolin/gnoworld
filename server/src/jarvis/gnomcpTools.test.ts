import { describe, expect, it } from "vitest";
import { z } from "zod";
import { logger } from "../log.ts";
import { allowlist } from "./allowlist.ts";
import { gnomcpTools } from "./gnomcpTools.ts";

// gnomcp 0.11.0's reads as its server lists them (ToolSearch, 2026-11-04): ours have no other field, `profile` required.
// gno_activity's `since` and `until` are left out: gnomcp 0.11.0 answers either with an error (its docs/tools.md), and
// ADR-0002 §5 counts windows by block height.
const GNOMCP = {
  gno_packages: { properties: ["limit", "path", "profile"], required: ["path"] },
  gno_read: { properties: ["file", "full", "path", "profile", "symbols"], required: ["path"] },
  gno_render: { properties: ["path", "profile", "realm"], required: ["realm"] },
  gno_eval: { properties: ["expr", "path", "profile"], required: ["path", "expr"] },
  gno_status: { properties: ["profile"], required: [] },
  gno_history: { properties: ["profile", "realm"], required: ["realm"] },
  gno_activity: { properties: ["profile", "realm", "since", "until"], required: ["realm"] },
} as const;
const NAMES = Object.keys(GNOMCP);
const INDEXED = ["gno_history", "gno_activity"];

const PROFILES = { chains: ["onyx", "gnoland1"], indexed: ["onyx"] };
const tools = (profiles = PROFILES) =>
  allowlist(
    gnomcpTools(profiles),
    logger("p".repeat(40), () => undefined),
  );
const Schema = z.object({
  properties: z.record(z.string(), z.unknown()),
  required: z.array(z.string()).optional(),
});

// A valid call of each read, which each case below changes by one field.
const VALID = {
  gno_packages: () => ({ profile: "onyx", path: "gno.land/r/demo/", limit: 100 }),
  gno_read: () => ({ profile: "onyx", path: "gno.land/r/demo/boards", file: "boards.gno", full: true }),
  gno_render: () => ({ profile: "onyx", realm: "gno.land/r/demo/boards", path: "post/123" }),
  gno_eval: () => ({ profile: "onyx", path: "gno.land/r/demo/counter", expr: "Counter()" }),
  gno_status: () => ({ profile: "onyx" }),
  gno_history: () => ({ profile: "onyx", realm: "gno.land/r/demo/boards" }),
  gno_activity: () => ({ profile: "onyx", realm: "gno.land/r/demo/boards" }),
} as const;

describe("gnomcpTools: gnomcp's reads, narrowed", () => {
  it("defines the seven reads gnomcp lists when a profile has an indexer, in gnomcp's order", () => {
    expect(gnomcpTools(PROFILES).map((tool) => tool.name)).toEqual(NAMES);
  });

  it("leaves out the indexer's two reads when no profile has an indexer", () => {
    expect(gnomcpTools({ chains: ["onyx"], indexed: [] }).map((tool) => tool.name)).toEqual(
      NAMES.filter((name) => !INDEXED.includes(name)),
    );
  });

  it("has no field gnomcp lacks, and requires gnomcp's own fields and the profile", () => {
    for (const tool of tools().offered()) {
      const gnomcp = GNOMCP[tool.name as keyof typeof GNOMCP];
      const schema = Schema.parse(tool.input_schema);
      expect(
        Object.keys(schema.properties).every((field) => (gnomcp.properties as readonly string[]).includes(field)),
      ).toBe(true);
      expect([...(schema.required ?? [])].sort()).toEqual([...gnomcp.required, "profile"].sort());
    }
  });

  it("leaves gno_activity's time bounds out, which gnomcp 0.11.0 answers with an error", () => {
    const activity = tools()
      .offered()
      .find((tool) => tool.name === "gno_activity");
    expect(Object.keys(Schema.parse(activity?.input_schema).properties).sort()).toEqual(["profile", "realm"]);
    for (const field of ["since", "until"]) {
      expect(tools().check("gno_activity", { ...VALID.gno_activity(), [field]: "2026-11-01T00:00:00Z" })).toEqual({
        ok: false,
        reason: "bad_arguments",
      });
    }
  });

  it("accepts a valid call of each read", () => {
    const allowed = tools();
    for (const name of NAMES) {
      expect(allowed.check(name, VALID[name as keyof typeof VALID]())).toMatchObject({ ok: true, name });
    }
  });

  it("describes each read shortly, naming no tool that is not offered (gnomcp's own name gno_connect)", () => {
    for (const profiles of [PROFILES, { chains: ["onyx"], indexed: [] }]) {
      const offered = tools(profiles).offered();
      const named = new Set(offered.map((tool) => tool.name));
      const mentioned = JSON.stringify(offered).match(/gno_[a-z_]+/g) ?? [];
      expect(mentioned.filter((word) => !named.has(word))).toEqual([]);
      expect(offered.every((tool) => tool.description.length > 0 && tool.description.length <= 300)).toBe(true);
    }
  });
});

describe("gnomcpTools: every read refuses what gnomcp would take otherwise", () => {
  it.each(NAMES)("%s refuses an extra field, a missing profile, and a profile not listed", (name) => {
    const allowed = tools();
    const valid = VALID[name as keyof typeof VALID];
    expect(allowed.check(name, { ...valid(), key: "default" })).toEqual({ ok: false, reason: "bad_arguments" });
    const noProfile = Object.fromEntries(Object.entries(valid()).filter(([field]) => field !== "profile"));
    expect(allowed.check(name, noProfile)).toEqual({ ok: false, reason: "bad_arguments" });
    // gnomcp's own default profile, which the model must never land on.
    expect(allowed.check(name, { ...valid(), profile: "testnet" })).toEqual({ ok: false, reason: "bad_arguments" });
    expect(allowed.check(name, { ...valid(), profile: 7 })).toEqual({ ok: false, reason: "bad_arguments" });
  });

  it.each(INDEXED)("%s refuses a chain profile that has no indexer", (name) => {
    const valid = VALID[name as keyof typeof VALID];
    expect(tools().check(name, { ...valid(), profile: "gnoland1" })).toEqual({ ok: false, reason: "bad_arguments" });
  });

  // Each string at its cap is taken, one past it refused; each wrong type refused.
  it.each([
    { name: "gno_packages", field: "path", cap: 256, longest: () => "gno.land/r/".padEnd(256, "a") },
    { name: "gno_read", field: "path", cap: 256, longest: () => "gno.land/r/".padEnd(256, "a") },
    { name: "gno_read", field: "file", cap: 256, longest: () => "a.gno".padStart(256, "a") },
    { name: "gno_render", field: "realm", cap: 256, longest: () => "gno.land/r/".padEnd(256, "a") },
    { name: "gno_render", field: "path", cap: 1024, longest: () => "p".repeat(1024) },
    { name: "gno_eval", field: "path", cap: 256, longest: () => "gno.land/p/".padEnd(256, "a") },
    { name: "gno_eval", field: "expr", cap: 1024, longest: () => `Render("${"x".repeat(1014)}")` },
    { name: "gno_history", field: "realm", cap: 256, longest: () => "gno.land/r/".padEnd(256, "a") },
    { name: "gno_activity", field: "realm", cap: 256, longest: () => "gno.land/r/".padEnd(256, "a") },
  ])(
    "$name takes a $field of $cap characters and refuses one longer, or of another type",
    ({ name, field, cap, longest }) => {
      const allowed = tools();
      const valid = VALID[name as keyof typeof VALID];
      const value = longest();
      expect(value).toHaveLength(cap);
      expect(allowed.check(name, { ...valid(), [field]: value })).toMatchObject({ ok: true });
      expect(allowed.check(name, { ...valid(), [field]: `${value}a` })).toEqual({ ok: false, reason: "bad_arguments" });
      expect(allowed.check(name, { ...valid(), [field]: 42 })).toEqual({ ok: false, reason: "bad_arguments" });
    },
  );

  // gnomcp's patterns: a package's path, `^[a-z0-9][a-z0-9._/\-]+$` (gno_read, gno_eval), and a realm's,
  // `^gno\.land/r/[a-z0-9_\-/\.]+$` (gno_render, gno_history, gno_activity); one case for each class they leave out.
  const PACKAGE = ["Gno.land/r/demo", "-gno.land/r/demo", "g", "gno.land/r/demo boards", "gno.land/r/demo\nboards"];
  const PACKAGE_MARKS = [":", "?", "#", '"', "{", "@", "\\", "%", "+"].map((mark) => `gno.land/r/demo${mark}x`);
  const REALM = [
    "gno.land/p/demo/avl",
    "gno.land/r/Demo",
    "evil.land/r/demo",
    "gnoXland/r/demo",
    "gno.land/r/",
    " gno.land/r/demo",
  ];
  const REALM_MARKS = ['"', "\n", " ", "{", "}", ":", "?", "#", "@", "+"].map((mark) => `gno.land/r/demo${mark}x`);
  it.each([
    ...["gno_read", "gno_eval"].flatMap((name) => [...PACKAGE, ...PACKAGE_MARKS].map((value) => [name, "path", value])),
    ...["gno_render", "gno_history", "gno_activity"].flatMap((name) =>
      [...REALM, ...REALM_MARKS].map((value) => [name, "realm", value]),
    ),
    ["gno_read", "file", ""],
    ["gno_eval", "expr", ""],
  ])("%s refuses the %s %j: gnomcp's own patterns are kept", (name, field, value) => {
    const valid = VALID[name as keyof typeof VALID];
    expect(tools().check(name, { ...valid(), [field]: value })).toEqual({ ok: false, reason: "bad_arguments" });
  });

  it.each([
    ["gno_read", "path", "gno.land/p/nt/avl_v2-1.0/sub"],
    ["gno_eval", "path", "0x/a"],
    ["gno_render", "realm", "gno.land/r/demo/my_realm-v2.1/x"],
    ["gno_history", "realm", "gno.land/r/a"],
  ])("%s takes the %s %j, within gnomcp's pattern", (name, field, value) => {
    const valid = VALID[name as keyof typeof VALID];
    expect(tools().check(name, { ...valid(), [field]: value })).toMatchObject({ ok: true });
  });

  // gno_packages's path, which gnomcp leaves free: a prefix of a package's path, or `@` and a namespace.
  it.each([
    ["gno.land/r/demo/", true],
    ["gno.land/", true],
    ["g", true],
    ["@demo", true],
    ["@alice_42", true],
    ["", false],
    ["@", false],
    ["@Demo", false],
    ["@demo/x", false],
    ["Gno.land/r/", false],
    ["gno.land/r/demo\n", false],
    ["gno.land/r/de mo", false],
    ["../", false],
    ["/gno.land", false],
  ])("gno_packages's path %j is taken: %s", (path, ok) => {
    expect(tools().check("gno_packages", { ...VALID.gno_packages(), path }).ok).toBe(ok);
  });

  it("gno_packages takes a whole limit from 1 to 1000 only", () => {
    const allowed = tools();
    const call = (limit: unknown) => allowed.check("gno_packages", { ...VALID.gno_packages(), limit });
    expect(call(1)).toMatchObject({ ok: true });
    expect(call(1000)).toMatchObject({ ok: true });
    for (const limit of [0, 1001, 1.5, -1, "10", null])
      expect(call(limit)).toEqual({ ok: false, reason: "bad_arguments" });
  });

  it("gno_read takes up to 32 symbols of up to 128 characters, and a full that is a boolean", () => {
    const allowed = tools();
    const call = (fields: Record<string, unknown>) =>
      allowed.check("gno_read", { profile: "onyx", path: "gno.land/r/demo/boards", ...fields });
    expect(call({ symbols: Array.from({ length: 32 }, (_, n) => `Symbol${String(n)}`) })).toMatchObject({ ok: true });
    expect(call({ symbols: ["S".repeat(128)] })).toMatchObject({ ok: true });
    expect(call({ symbols: Array.from({ length: 33 }, (_, n) => `S${String(n)}`) })).toEqual({
      ok: false,
      reason: "bad_arguments",
    });
    expect(call({ symbols: ["S".repeat(129)] })).toEqual({ ok: false, reason: "bad_arguments" });
    expect(call({ symbols: [""] })).toEqual({ ok: false, reason: "bad_arguments" });
    expect(call({ symbols: "Render" })).toEqual({ ok: false, reason: "bad_arguments" });
    expect(call({ full: "true" })).toEqual({ ok: false, reason: "bad_arguments" });
  });
});

describe("gnomcpTools: the caller's profiles", () => {
  it("refuses no chain profile at all", () => {
    expect(() => gnomcpTools({ chains: [], indexed: [] })).toThrow("gnomcp tools: no chain profile");
  });

  it.each(["Onyx", "-onyx", "on yx", "", `o${"n".repeat(64)}`, "onyx\n"])(
    "refuses the profile %j, off gnomcp's pattern",
    (name) => {
      expect(() => gnomcpTools({ chains: ["onyx", name], indexed: [] })).toThrow(
        `gnomcp tools: the profile ${JSON.stringify(name)} is no profile name`,
      );
    },
  );

  it("refuses an indexed profile that is no chain profile", () => {
    expect(() => gnomcpTools({ chains: ["onyx"], indexed: ["gnoland1"] })).toThrow(
      `gnomcp tools: the indexed profile "gnoland1" is no chain profile`,
    );
  });

  it("takes gnomcp's profile names: a lower-case letter or digit, then letters, digits, - and _, 64 at most", () => {
    const names = ["onyx", "gnoland1", "0x", "test_net-2", `o${"n".repeat(63)}`];
    expect(gnomcpTools({ chains: names, indexed: [] })).toHaveLength(5);
  });
});
