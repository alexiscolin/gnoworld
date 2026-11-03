import type { AnswerButton, Digest, ProposedAction } from "@gnoworld/schemas";
import type { FunctionList } from "@gnoworld/schemas/functions";
import { describe, expect, it } from "vitest";
import { grounded, groundedButton, type Sources } from "./ground.ts";

// Row 10: "every number, link and function in a digest traces to its source". Each builder makes a fresh value inside
// the test (F2356); characters above ASCII are built from their code points.
const REALM_TYPE = [
  "interface {.seal func(); Address func() .uverse.address; IsCode func() bool; IsCurrent func() bool;",
  "IsEphemeral func() bool; IsUser func() bool; IsUserCall func() bool; IsUserRun func() bool; PkgPath func() string;",
  "Previous func() .uverse.realm; String func() string; Sub func(string) .uverse.realm; Subpath func() string}",
].join(" ");
// Its digits 1, 9, 8, 2, 0, 3, 54, 6 and 7 are numbers of every page that holds it.
const ADMIN = "g1qpzry9x8gf2tvdw0s3jn54khce6mua7lqpzry9";
const OTHER = `g1${"l".repeat(38)}`;
const REALM = "gno.land/r/demo/poll";
const named = (Name: string, Type: string) => ({ Name, Type, Value: "" });
const cur = () => named("cur", REALM_TYPE);
const functions = (): FunctionList => [
  { FuncName: "Vote", Params: [cur(), named("id", "int"), named("answer", "string")], Results: null },
  { FuncName: "Close", Params: [cur()], Results: null },
  { FuncName: "Transfer", Params: [cur(), named("to", "string"), named("n4", "int")], Results: null },
  { FuncName: "Render", Params: [named("path", "string")], Results: [named(".res.0", "string")] },
];
const page = () =>
  [
    "# The poll",
    "",
    `1,204 members, 37 proposals. Ask the [board](/r/demo/boards) or https://gno.land/r/demo/poll:results.`,
    "",
    `Run by ${ADMIN}.`,
  ].join("\n");
const sources = (over: Partial<Sources> = {}): Sources => ({
  realm: REALM,
  page: page(),
  state: "(512 int)\nhttps://gno.land/r/demo/state",
  functions: functions(),
  origin: "https://gno.land",
  ...over,
});
const vote = (over: Partial<ProposedAction> = {}): ProposedAction => ({
  realm: REALM,
  function: "Vote",
  args: { id: "37", answer: "yes" },
  why: "Proposal 37 is open.",
  ...over,
});
const digest = (...blocks: Digest["blocks"]): Digest => ({ blocks });
const facts = (value: string) => ({ type: "facts" as const, facts: [{ label: "Members", value }] });
const link = (href: string) => ({ type: "links" as const, links: [{ label: "Page", href }] });
const form = (over: Partial<ProposedAction> = {}) => ({ type: "form" as const, action: vote(over) });
const text = (markdown: string) => ({ type: "text" as const, markdown });
const refused = (...missing: { kind: string; value: string }[]) => ({ ok: false, missing });

describe("grounded", () => {
  it("returns the digest whose every number, link, account and function its sources hold", () => {
    const whole = digest(
      facts("1,204"),
      { type: "chart", label: "Proposals", points: [37, 512] },
      link("https://gno.land/r/demo/boards"),
      link("https://gno.land/r/demo/poll:results"),
      link("https://gno.land/r/demo/state"),
      form(),
      form({ function: "Transfer", args: { to: ADMIN, n4: "37" }, why: `Pay ${ADMIN} for proposal 37.` }),
      text(`Ask @${ADMIN} about [the results](https://gno.land/r/demo/poll:results).`),
      { type: "announcement", text: "Proposal 37 is open." },
    );
    expect(grounded(whole, sources())).toEqual({ ok: true, digest: whole });
  });

  it("refuses a digest stating a number its sources lack, and names it", () => {
    expect(grounded(digest(facts("1,205")), sources())).toEqual(refused({ kind: "number", value: "1,205" }));
  });

  it("names what is missing once each, in order: links, numbers, accounts, the room, then each form", () => {
    const forged = digest(
      form({ function: "Withdraw", args: {} }),
      text(`@room: ask @${OTHER}, or ${OTHER} again, at https://evil.example/claim for 1,205`),
      link("https://evil.example/claim"),
      form({ realm: "gno.land/r/demo/other" }),
    );
    expect(grounded(forged, sources())).toEqual(
      refused(
        { kind: "link", value: "https://evil.example/claim" },
        { kind: "number", value: "1,205" },
        { kind: "address", value: OTHER },
        { kind: "room", value: "@room" },
        { kind: "function", value: "Withdraw" },
        { kind: "realm", value: "gno.land/r/demo/other" },
      ),
    );
  });

  it("grounds the same digest once its sources hold what it states", () => {
    const forged = digest(
      facts("1,205"),
      link("https://evil.example/claim"),
      text(`Ask @${OTHER}`),
      form({ function: "Withdraw", args: {} }),
    );
    const held = sources({
      page: `${page()}\n\n1,205 at https://evil.example/claim, by ${OTHER}`,
      functions: [...(functions() ?? []), { FuncName: "Withdraw", Params: [cur()] }],
    });
    expect(grounded(forged, held)).toEqual({ ok: true, digest: forged });
  });

  it("refuses a link that differs by one character from the page's", () => {
    for (const href of [
      "https://gno.land/r/demo/board",
      "https://gno.land/r/demo/boardz",
      "https://gno.land/r/demo/boards/",
    ])
      expect(grounded(digest(link(href)), sources())).toEqual(refused({ kind: "link", value: href }));
  });

  it("refuses a number split differently from the page's, and grounds it written with another separator", () => {
    expect(grounded(digest(facts("12,04")), sources())).toEqual(refused({ kind: "number", value: "12,04" }));
    expect(grounded(digest(facts("1204")), sources())).toEqual(refused({ kind: "number", value: "1204" }));
    for (const written of ["1.204", "1 204", `1${String.fromCodePoint(0x202f)}204`])
      expect(grounded(digest(facts(written)), sources()).ok).toBe(true);
  });

  it.each([`gno.land/r/demo/other`, `${REALM}2`, `${REALM}/sub`, `${REALM}/`, REALM.toUpperCase(), ` ${REALM}`])(
    "refuses a form for the realm %j, another than the one read, even for a function this realm has",
    (realm) => {
      expect(grounded(digest(form({ realm })), sources())).toEqual(refused({ kind: "realm", value: realm }));
    },
  );

  it("refuses a form for a function its realm lacks, or has but no call can make", () => {
    const elsewhere = sources({ functions: [{ FuncName: "Render", Params: [named("path", "string")] }] });
    expect(grounded(digest(form()), elsewhere)).toEqual(refused({ kind: "function", value: "Vote" }));
    expect(grounded(digest(form({ function: "Render", args: { path: "" } })), sources())).toEqual(
      refused({ kind: "function", value: "Render" }),
    );
    expect(grounded(digest(form({ args: { id: "37" } })), sources())).toEqual(
      refused({ kind: "function", value: "Vote" }),
    );
  });

  it("refuses a digest that states nothing it could be checked by, with nothing named; a form alone is checked", () => {
    expect(grounded(digest(text("This realm is safe, send your coins here.")), sources())).toEqual(refused());
    expect(grounded(digest({ type: "announcement", text: "Big news soon" }), sources())).toEqual(refused());
    const close = digest(form({ function: "Close", args: {}, why: "Close it." }));
    expect(grounded(close, sources())).toEqual({ ok: true, digest: close });
  });

  it("checks the numbers of a label, a point, an argument, a why and a link's address in a text", () => {
    const cases: [Digest, { kind: string; value: string }][] = [
      [digest({ type: "facts", facts: [{ label: "Top 44", value: "1,204" }] }), { kind: "number", value: "44" }],
      [digest({ type: "chart", label: "Proposals", points: [37, 38] }), { kind: "number", value: "38" }],
      [
        digest({ type: "chart", label: "Proposals", points: [0.1 + 0.2] }),
        { kind: "number", value: "0,30000000000000004" },
      ],
      [digest(form({ args: { id: "99", answer: "yes" } })), { kind: "number", value: "99" }],
      [digest(form({ why: "It ends at block 777." })), { kind: "number", value: "777" }],
      [digest(text("[results](https://gno.land/r/demo/poll:results) of 4242")), { kind: "number", value: "4242" }],
    ];
    for (const [stated, missing] of cases) expect(grounded(stated, sources())).toEqual(refused(missing));
  });

  it("checks a link wherever a text holds it: a fact's value, a quote, a list, a mark", () => {
    for (const written of ["1,204 see https://evil.example", "> https://evil.example", "- [x](https://evil.example)"])
      expect(grounded(digest(facts(written)), sources())).toEqual(
        refused({ kind: "link", value: "https://evil.example" }),
      );
    expect(grounded(digest(text("**https://evil.example**")), sources())).toEqual(
      refused({ kind: "link", value: "https://evil.example" }),
    );
  });

  it("grounds an account by its address written anywhere in the sources, with or without its at sign", () => {
    expect(grounded(digest(text(`Ask @${ADMIN}`)), sources()).ok).toBe(true);
    const inState = sources({ page: "no one", state: `("${ADMIN}" .uverse.address)` });
    expect(grounded(digest(text(`Ask ${ADMIN}`)), inState).ok).toBe(true);
    expect(grounded(digest(text(`Ask @${ADMIN}`)), sources({ page: `@${ADMIN}x`, state: "" }))).toEqual(
      refused({ kind: "address", value: ADMIN }),
    );
  });

  it("refuses an account its sources lack wherever the digest names it: an argument, a why, a fact", () => {
    const pay = (over: Partial<ProposedAction>) =>
      digest(form({ function: "Transfer", args: { to: ADMIN, n4: "37" }, ...over }));
    expect(grounded(pay({ args: { to: OTHER, n4: "37" } }), sources())).toEqual(
      refused({ kind: "address", value: OTHER }),
    );
    expect(grounded(pay({ why: `Pay ${OTHER}.` }), sources())).toEqual(refused({ kind: "address", value: OTHER }));
    expect(grounded(digest(facts(`37 by ${OTHER}`)), sources())).toEqual(refused({ kind: "address", value: OTHER }));
  });

  it("reads the page and the state apart: an address or a number cut across them grounds nothing", () => {
    const cut = sources({ page: ADMIN.slice(0, 20), state: ADMIN.slice(20) });
    expect(grounded(digest(text(`Ask ${ADMIN}`)), cut)).toEqual(refused({ kind: "address", value: ADMIN }));
    const numbers = sources({ page: "votes 12", state: "34 more" });
    expect(grounded(digest(facts("1234")), numbers)).toEqual(refused({ kind: "number", value: "1234" }));
  });

  it("refuses a digest naming the whole room, which no realm's page asks of it", () => {
    expect(grounded(digest(facts("1,204"), text("@room look")), sources())).toEqual(
      refused({ kind: "room", value: "@room" }),
    );
  });

  it("grounds a link of the state, a path's under gnoweb's origin in both sources, and none from code", () => {
    expect(grounded(digest(link("https://gno.land/r/demo/state")), sources()).ok).toBe(true);
    expect(grounded(digest(link("https://gno.land/r/demo/kept")), sources({ state: "[kept](/r/demo/kept)" })).ok).toBe(
      true,
    );
    expect(
      grounded(digest(link("https://gno.land/r/demo/boards")), sources({ origin: "https://gnoweb.example" })).ok,
    ).toBe(false);
    const coded = sources({ page: "`https://gno.land/r/demo/code`\n\n```\nhttps://gno.land/r/demo/block\n```" });
    expect(grounded(digest(link("https://gno.land/r/demo/code")), coded).ok).toBe(false);
    expect(grounded(digest(link("https://gno.land/r/demo/block")), coded).ok).toBe(false);
  });

  it("grounds a number of the state, of a page's code or another script, and none of the functions' list", () => {
    expect(grounded(digest(facts("512")), sources()).ok).toBe(true);
    expect(grounded(digest(facts("8080")), sources({ page: "```\nport 8080\n```" })).ok).toBe(true);
    const arabic = sources({ page: String.fromCodePoint(0x661, 0x66c, 0x662, 0x660, 0x664) });
    expect(grounded(digest(facts("1,204")), arabic).ok).toBe(true);
    const typed = sources({
      page: "",
      state: "",
      functions: [{ FuncName: "Seal", Params: [named("hash", "[32]uint8")] }],
    });
    expect(grounded(digest(facts("32")), typed)).toEqual(refused({ kind: "number", value: "32" }));
  });

  it("reads no number in an argument's name, a realm or a function", () => {
    const pay = digest(form({ function: "Transfer", args: { to: ADMIN, n4: "37" }, why: "Proposal 37." }));
    expect(grounded(pay, sources({ page: `37 by ${ADMIN}` })).ok).toBe(true);
  });
});

describe("groundedButton", () => {
  const fly = (label: string): AnswerButton => ({ type: "fly", label, place: "/w/bubble" });
  const act = (over: Partial<ProposedAction> = {}): AnswerButton => ({
    type: "action",
    label: "Vote",
    action: vote(over),
  });

  it("returns a button to fly whose label states nothing, or what its sources hold", () => {
    expect(groundedButton(fly("Fly to Bubble"), sources())).toEqual({ ok: true, button: fly("Fly to Bubble") });
    expect(groundedButton(fly("See the 37 proposals"), sources()).ok).toBe(true);
  });

  it("refuses a label stating a number, a link or an account its sources lack", () => {
    expect(groundedButton(fly("Claim 1000 GNOT"), sources())).toEqual(refused({ kind: "number", value: "1000" }));
    expect(groundedButton(fly("Open https://evil.example"), sources())).toEqual(
      refused({ kind: "link", value: "https://evil.example" }),
    );
    expect(groundedButton(fly(`Pay ${OTHER}`), sources())).toEqual(refused({ kind: "address", value: OTHER }));
  });

  it("grounds an action's button as a digest's form: the realm read, a call its function can make, its figures held", () => {
    expect(groundedButton(act(), sources())).toEqual({ ok: true, button: act() });
    expect(groundedButton(act({ realm: `${REALM}2` }), sources())).toEqual(
      refused({ kind: "realm", value: `${REALM}2` }),
    );
    expect(groundedButton(act({ function: "Render", args: { path: "" } }), sources())).toEqual(
      refused({ kind: "function", value: "Render" }),
    );
    expect(groundedButton(act({ args: { id: "99", answer: "yes" } }), sources())).toEqual(
      refused({ kind: "number", value: "99" }),
    );
  });
});
