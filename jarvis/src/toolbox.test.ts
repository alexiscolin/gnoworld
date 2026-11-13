import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it, vi } from "vitest";
import { allowlist } from "./allowlist.ts";
import type { Ran } from "./gnomcp.ts";
import { gnomcpTools } from "./gnomcpTools.ts";
import { loadSkills } from "./skills.ts";
import { capture } from "./testing/kit.ts";
import { data as explainData, explainBox } from "./testing/explainTools.ts";
import { placesData } from "./testing/placesData.ts";
import { toolbox } from "./toolbox.ts";
import { cardTools } from "./tools/cards.ts";
import { gnoscopeTools } from "./tools/gnoscopeTools.ts";
import { keepCards, type Asked } from "./tools/kept.ts";
import { loadPlaces, placesTool } from "./tools/places.ts";

const data = placesData();
afterAll(() => {
  data.remove();
  explainData.remove();
});

const SKILLS = fileURLToPath(new URL("../skills", import.meta.url));
const PROFILES = { chains: ["onyx", "gnoland"], indexed: ["onyx"] };
const said = (text: string): Ran => ({ ok: true, text, isError: false });
type Read = (name: string, args: unknown, signal?: AbortSignal) => Promise<Ran>;

// The tools as the entry wires them, each runner a fake that says who ran: gnomcp's reads, the skills, the places, the
// cards and gnoscope's reads (on unless a test turns it off).
const box = ({ gnoscope = true }: { gnoscope?: boolean } = {}) => {
  const { log, events } = capture();
  const places = loadPlaces(data.folderOf());
  const read = vi.fn((name: string) => Promise.resolve(said(`gnomcp read ${name}`)));
  // Each fake takes what its runner hands it: a call's name, its arguments and its signal.
  const gnomcp = { call: vi.fn<Read>((name) => Promise.resolve(said(`gnomcp ${name}`))) };
  const cards = cardTools({ chains: PROFILES.chains, places, read });
  const cardRun = vi.spyOn(cards, "run").mockResolvedValue(said("cards"));
  const definitions = gnoscope ? gnoscopeTools(["mainnet", "onyx"]) : [];
  const scope = {
    definitions,
    call: vi.fn<Read>((name) => Promise.resolve(said(`gnoscope ${name}`))),
  };
  const tools = toolbox({
    profiles: PROFILES,
    gnomcp,
    skills: loadSkills(SKILLS),
    places: placesTool(places),
    cards,
    gnoscope: scope,
    log,
  });
  return { tools, gnomcp, cardRun, scope, read, events };
};
const asked = (): Asked => ({ text: "Where is GovDAO?", cards: keepCards(), signal: new AbortController().signal });
// A call the allowlist let through, as the loop hands it to run.
const allowed = (tools: ReturnType<typeof box>["tools"], name: string, args: unknown) => {
  const call = tools.allowlist.check(name, args);
  if (!call.ok) throw new Error(`the allowlist refused ${name}`);
  return call;
};

describe("the tools Jarvis is offered in /ask", () => {
  it("offers gnomcp's reads, load_skill, find_place, give_button and gnoscope's reads, in that order", () => {
    const { tools } = box();
    expect(tools.allowlist.offered().map(({ name }) => name)).toEqual([
      "gno_packages",
      "gno_read",
      "gno_render",
      "gno_eval",
      "gno_status",
      "gno_history",
      "gno_activity",
      "load_skill",
      "find_place",
      "give_button",
      "explain_tx",
      "get_realm_state",
      "get_address",
      "search_code",
    ]);
  });

  it("never offers give_digest nor propose_action, whose cards an answer has no place for (Alexis, 10i-1)", () => {
    const { tools, events } = box();
    const names = tools.allowlist.offered().map(({ name }) => name);
    expect(names).not.toContain("give_digest");
    expect(names).not.toContain("propose_action");
    expect(tools.allowlist.check("give_digest", {}).ok).toBe(false);
    expect(events()).toContainEqual({ event: "jarvis_tool_refused", tool: "give_digest", reason: "unknown_tool" });
  });

  it("offers none of gnoscope's reads with gnoscope off", () => {
    const names = box({ gnoscope: false })
      .tools.allowlist.offered()
      .map(({ name }) => name);
    expect(
      names.filter((name) => ["explain_tx", "get_realm_state", "get_address", "search_code"].includes(name)),
    ).toEqual([]);
    expect(names.at(-1)).toBe("give_button");
  });

  it("offers each tool with the schema and words its own module defines, never others", () => {
    const { tools } = box();
    const places = loadPlaces(data.folderOf());
    const own = allowlist(
      [
        ...gnomcpTools(PROFILES),
        loadSkills(SKILLS).tool,
        placesTool(places).definition,
        ...cardTools({ chains: PROFILES.chains, places, read: vi.fn() }).definitions,
        ...gnoscopeTools(["mainnet", "onyx"]),
      ],
      capture().log,
    ).offered();
    const byName = new Map(own.map((tool) => [tool.name, tool]));
    for (const tool of tools.allowlist.offered()) expect(tool).toEqual(byName.get(tool.name));
  });
});

describe("each allowed call, run by its own runner", () => {
  it.each(["gno_packages", "gno_read", "gno_render", "gno_eval", "gno_status", "gno_history", "gno_activity"])(
    "sends %s to gnomcp alone, with the arguments the allowlist parsed",
    async (name) => {
      const { tools, gnomcp, cardRun, scope } = box();
      const args = {
        gno_packages: { profile: "onyx", path: "gno.land/r/" },
        gno_read: { profile: "onyx", path: "gno.land/r/gov/dao" },
        gno_render: { profile: "onyx", realm: "gno.land/r/gov/dao" },
        gno_eval: { profile: "onyx", path: "gno.land/r/gov/dao", expr: 'Render("")' },
        gno_status: { profile: "onyx" },
        gno_history: { profile: "onyx", realm: "gno.land/r/gov/dao" },
        gno_activity: { profile: "onyx", realm: "gno.land/r/gov/dao" },
      }[name];
      const call = allowed(tools, name, args);
      const question = asked();
      expect(await tools.run(call, question)).toEqual(said(`gnomcp ${name}`));
      expect(gnomcp.call.mock.calls.map((made) => made.slice(0, 2))).toEqual([[name, call.args]]);
      // The call's own signal, which the question's leaving and the tool's time fire (F5290).
      expect(gnomcp.call.mock.calls[0]?.[2]).toBe(question.signal);
      expect(cardRun).not.toHaveBeenCalled();
      expect(scope.call).not.toHaveBeenCalled();
    },
  );

  it("reads a skill's text for load_skill, from the skills folder, and its reference", async () => {
    const { tools, gnomcp } = box();
    const skills = loadSkills(SKILLS);
    const concierge = await tools.run(allowed(tools, "load_skill", { skill: "concierge" }), asked());
    expect(concierge).toEqual(said(skills.read({ skill: "concierge" })));
    const reference = await tools.run(allowed(tools, "load_skill", { skill: "gno", reference: "render.md" }), asked());
    expect(reference).toEqual(said(skills.read({ skill: "gno", reference: "render.md" })));
    expect(gnomcp.call).not.toHaveBeenCalled();
  });

  it("finds a place for find_place in the data, nowhere else", async () => {
    const { tools, gnomcp, cardRun, scope } = box();
    const ran = await tools.run(allowed(tools, "find_place", { query: "govdao" }), asked());
    expect(ran).toMatchObject({ ok: true, isError: false });
    expect(ran.ok && JSON.parse(ran.text)).toMatchObject({ places: [{ name: "GovDAO" }], more: 0 });
    expect([gnomcp.call, cardRun, scope.call].map((fn) => fn.mock.calls.length)).toEqual([0, 0, 0]);
  });

  it("hands give_button to the cards with the call's own question, words and cards", async () => {
    const { tools, cardRun, gnomcp } = box();
    const button = { type: "fly", label: "Fly to GovDAO", place: "/w/govdao" };
    const call = allowed(tools, "give_button", { button });
    const question = asked();
    expect(await tools.run(call, question)).toEqual(said("cards"));
    expect(cardRun).toHaveBeenCalledExactlyOnceWith(call, question);
    expect(gnomcp.call).not.toHaveBeenCalled();
  });

  it.each(["explain_tx", "get_realm_state", "get_address", "search_code"])(
    "sends %s to gnoscope alone",
    async (name) => {
      const { tools, gnomcp, scope } = box();
      const args = {
        explain_tx: { network: "onyx", hash: "a".repeat(44) },
        get_realm_state: { network: "onyx", path: "gno.land/r/gov/dao" },
        get_address: { network: "mainnet", address: "g10gh7yq7swv77efwfcqy2znp37cmeughxx3y5tv" },
        search_code: { network: "onyx", query: "func Render" },
      }[name];
      const call = tools.allowlist.check(name, args);
      if (!call.ok) throw new Error(`the allowlist refused ${name}: its test's arguments are wrong`);
      const question = asked();
      expect(await tools.run(call, question)).toEqual(said(`gnoscope ${name}`));
      expect(scope.call.mock.calls.map((made) => made.slice(0, 2))).toEqual([[name, call.args]]);
      expect(scope.call.mock.calls[0]?.[2]).toBe(question.signal);
      expect(gnomcp.call).not.toHaveBeenCalled();
    },
  );

  it.each(["give_digest", "propose_action", "gno_call"])(
    "refuses a call named %s that no runner holds, and runs nothing",
    async (name) => {
      const { tools, gnomcp, cardRun, scope } = box();
      expect(await tools.run({ ok: true, name, args: {} }, asked())).toEqual({ ok: false, reason: "refused" });
      expect([gnomcp.call, cardRun, scope.call].map((fn) => fn.mock.calls.length)).toEqual([0, 0, 0]);
    },
  );

  it("refuses a gnoscope call with gnoscope off, whatever reaches run, and sends nothing", async () => {
    const { tools, scope, gnomcp } = box({ gnoscope: false });
    const forged = { ok: true, name: "explain_tx", args: { network: "onyx", hash: "a".repeat(44) } } as const;
    expect(await tools.run(forged, asked())).toEqual({ ok: false, reason: "refused" });
    expect(scope.call).not.toHaveBeenCalled();
    expect(gnomcp.call).not.toHaveBeenCalled();
  });

  it("refuses a load_skill call whose arguments its own schema refuses, and reads nothing", async () => {
    const { tools } = box();
    expect(
      await tools.run({ ok: true, name: "load_skill", args: { skill: "gno", reference: "gnokey.md" } }, asked()),
    ).toEqual({ ok: false, reason: "refused" });
  });
});

// D13920: a function's explanation reads the code alone, on one chain's profile.
describe("the tools a function's explanation is offered", () => {
  const REALM = "gno.land/r/gov/dao";
  const READ = { profile: "gnoland", path: REALM, symbols: ["Vote"] };
  const BUTTON = { button: { type: "fly", label: "Fly to GovDAO", place: "/w/govdao" } };
  const offeredBy = (own: { allowlist: { offered: () => { name: string }[] } }) =>
    own.allowlist
      .offered()
      .map(({ name }) => name)
      .sort();

  it("are gno_read, load_skill, give_button and find_place, and no live read: no render, eval, status, history, activity, packages, nor gnoscope's", () => {
    expect(offeredBy(explainBox().box.explain("gnoland"))).toEqual([
      "find_place",
      "give_button",
      "gno_read",
      "load_skill",
    ]);
  });

  it.each([
    "gno_render",
    "gno_eval",
    "gno_status",
    "gno_history",
    "gno_activity",
    "gno_packages",
    "get_realm_state",
    "explain_tx",
  ])("refuse a call to %s the model makes anyway: unknown to the allowlist, and never run", async (name) => {
    const { box, calls } = explainBox();
    const own = box.explain("gnoland");
    expect(own.allowlist.check(name, { profile: "gnoland", realm: REALM })).toEqual({
      ok: false,
      reason: "unknown_tool",
    });
    await own.run({ ok: true, name, args: {} } as never, asked());
    expect(calls).not.toHaveBeenCalled();
  });

  it("read on their one profile and refuse a gno_read of another, so an answer is read on the chain it is kept for", () => {
    const own = explainBox().box.explain("gnoland");
    expect(own.allowlist.check("gno_read", READ)).toMatchObject({ ok: true, name: "gno_read" });
    expect(own.allowlist.check("gno_read", { ...READ, profile: "onyx" })).toEqual({
      ok: false,
      reason: "bad_arguments",
    });
  });

  it("let a button name no chain or the one chain, and refuse one that names another: its card would read that chain's live page", () => {
    const own = explainBox().box.explain("gnoland");
    expect(own.allowlist.check("give_button", BUTTON)).toMatchObject({ ok: true });
    expect(own.allowlist.check("give_button", { ...BUTTON, profile: "gnoland" })).toMatchObject({ ok: true });
    expect(own.allowlist.check("give_button", { ...BUTTON, profile: "onyx" })).toEqual({
      ok: false,
      reason: "bad_arguments",
    });
  });

  it("leave the main loop's button and tools as they are, live reads and any profile included", () => {
    const { box } = explainBox();
    const names = box.allowlist.offered().map(({ name }) => name);
    expect(names).toContain("gno_render");
    expect(names).toContain("get_realm_state");
    expect(box.allowlist.check("give_button", { ...BUTTON, profile: "onyx" })).toMatchObject({ ok: true });
  });
});
