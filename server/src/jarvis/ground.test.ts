import type { AnswerButton, Digest, ProposedAction } from "@gnoworld/schemas";
import type { FunctionList } from "@gnoworld/schemas/functions";
import { describe, expect, it } from "vitest";
import { grounded, groundedButton, sourcesOf, type Read } from "./ground.ts";

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
  { FuncName: "Delegate", Params: [cur(), named("target", "string"), named("rate", "float64")], Results: null },
  { FuncName: "Render", Params: [named("path", "string")], Results: [named(".res.0", "string")] },
];
const page = () =>
  [
    "# The poll",
    "",
    `1,204 members, 37 proposals. Ask the [board](/r/demo/boards) or https://gno.land/r/demo/poll:results.`,
    "",
    `Run by ${ADMIN}. Answer yes or no.`,
  ].join("\n");
const sources = (over: Partial<Read> = {}) =>
  sourcesOf({
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
const refused = (...missing: { kind: string; value: string }[]) => ({ ok: false, reason: "missing", missing });
const nothing = { ok: false, reason: "nothing" };
const shape = { ok: false, reason: "shape" };

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

  it("takes what the model gave as it came, and refuses what is no digest", () => {
    for (const given of [undefined, "a digest", { blocks: [] }, { blocks: [text("hi")], html: "<b>hi</b>" }])
      expect(grounded(given, sources())).toEqual(shape);
    expect(grounded(digest({ type: "chart", label: "Votes", points: [1e21] }), sources({ page: "1 and 21" }))).toEqual(
      shape,
    );
    expect(grounded(digest(text(`1 ${"a".repeat(1001)}`)), sources())).toEqual(shape);
  });

  it("refuses a form's argument its sources do not hold as given, a path, a name, an exponent, a case, an order; holds the realm read, a link with or without its scheme, a word", () => {
    const delegate = (target: string, rate = "1") => digest(form({ function: "Delegate", args: { target, rate } }));
    const missing = (value: string) => refused({ kind: "argument", value });
    expect(grounded(delegate("gno.land/r/evil/drain"), sources())).toEqual(missing("gno.land/r/evil/drain"));
    expect(grounded(delegate("@evilname"), sources())).toEqual(missing("@evilname"));
    expect(grounded(delegate(REALM, "9e9"), sources())).toEqual(
      refused({ kind: "number", value: "9e9" }, { kind: "argument", value: "9e9" }),
    );
    const vault = sources({ page: "See gno.land/r/alice/vault, by Bob's team: a rate of 1, proposal 37." });
    for (const target of ["gno.land/r/bob/vault", "vault/r/gno.land/alice", "gno.land/r/ALICE/vault", "!!!", "../../"])
      expect(grounded(delegate(target), vault)).toEqual(missing(target));
    expect(grounded(delegate("gno.land/r/alice/vault"), vault).ok).toBe(true);
    for (const target of [REALM, "https://gno.land/r/demo/boards", "gno.land/r/demo/boards", "proposals", "yes"])
      expect(grounded(delegate(target), sources()).ok).toBe(true);
  });

  it("grounds an argument every word of which its sources hold: the page's, or the asker's own, passed among them", () => {
    expect(grounded(digest(form({ args: { id: "37", answer: "yes" } })), sources()).ok).toBe(true);
    const asked = sources({ state: "The asker: delegate to gno.land/r/evil/drain" });
    expect(
      grounded(digest(form({ function: "Delegate", args: { target: "gno.land/r/evil/drain", rate: "1" } })), asked).ok,
    ).toBe(true);
    expect(grounded(digest(form({ why: "Words of its own, never a call's." })), sources()).ok).toBe(true);
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
      form({ function: "Delegate", args: { target: "drain", rate: "1" } }),
    );
    expect(grounded(forged, sources())).toEqual(
      refused(
        { kind: "link", value: "https://evil.example/claim" },
        { kind: "number", value: "1,205" },
        { kind: "address", value: OTHER },
        { kind: "room", value: "@room" },
        { kind: "argument", value: "drain" },
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

  it("refuses a number split or separated otherwise than the page writes it, a thousand times another", () => {
    expect(grounded(digest(facts("12,04")), sources())).toEqual(refused({ kind: "number", value: "12,04" }));
    expect(grounded(digest(facts("1204")), sources())).toEqual(refused({ kind: "number", value: "1204" }));
    const separated: [string, string][] = [
      ["1.204", "1.204"],
      ["1 204", "1 204"],
      [`1${String.fromCodePoint(0x202f)}204`, "1 204"],
    ];
    for (const [written, value] of separated)
      expect(grounded(digest(facts(written)), sources())).toEqual(refused({ kind: "number", value }));
    const price = sources({ page: "Ticket price: 1.250 GNOT" });
    expect(grounded(digest(facts("1,250 GNOT")), price)).toEqual(refused({ kind: "number", value: "1,250" }));
    expect(grounded(digest(facts("1.250 GNOT")), price).ok).toBe(true);
  });

  it("refuses a number the page holds without its sign", () => {
    const refund = sources({ page: "Refund: 5 GNOT" });
    expect(grounded(digest(facts("-5 GNOT")), refund)).toEqual(refused({ kind: "number", value: "-5" }));
    expect(grounded(digest(facts(`${String.fromCodePoint(0x2212)}5 GNOT`)), refund)).toEqual(
      refused({ kind: "number", value: "-5" }),
    );
  });

  it("refuses digits a character that draws nothing parts, or blanks a page collapses, as the number a person sees", () => {
    const zero = String.fromCodePoint(0x200b);
    expect(grounded(digest(facts(`Claim 1${zero}0${zero}0${zero}0 GNOT`)), sources())).toEqual(
      refused({ kind: "number", value: "1000" }),
    );
    const keycap = (digit: string) => `${digit}${String.fromCodePoint(0xfe0f, 0x20e3)}`;
    const shown = ["7", "7", "3"].map((digit) => `${digit}${String.fromCodePoint(0x20e3)}`).join("");
    expect(grounded(digest(facts(`${keycap("7")}${keycap("7")}${keycap("3")} GNOT`)), sources())).toEqual(
      refused({ kind: "number", value: "773" }, { kind: "number", value: shown }),
    );
    const parts = sources({ page: "5 and 250" });
    for (const blank of ["  ", "\t"])
      expect(grounded(digest(facts(`5${blank}250`)), parts)).toEqual(refused({ kind: "number", value: "5 250" }));
  });

  it("refuses an account whose first letter only looks like g, a hair space parts, or a digit leads", () => {
    const char = (point: number) => String.fromCodePoint(point);
    for (const first of [0x261, 0x50d, 0x581]) {
      const word = `${char(first)}${OTHER.slice(1)}`;
      expect(grounded(digest(text(`Send to ${word}`)), sources())).toEqual(refused({ kind: "address", value: word }));
    }
    expect(grounded(digest(facts(`37 to g${char(0x200a)}${OTHER.slice(1)}`)), sources())).toEqual(
      refused({ kind: "address", value: OTHER }),
    );
    expect(grounded(digest(text(`Send to 0${OTHER}`)), sources())).toEqual(
      refused({ kind: "address", value: `0${OTHER}` }),
    );
  });

  it("refuses a figure a letter, a mark or a numeric symbol makes of a number, unless its sources write it so", () => {
    const char = (...points: number[]) => String.fromCodePoint(...points);
    expect(grounded(digest(facts("Claim 1OOO GNOT")), sources())).toEqual(refused({ kind: "number", value: "1OOO" }));
    const marked = `1${char(0xc02, 0xc02, 0xc02)}`;
    expect(grounded(digest(facts(`Claim ${marked} GNOT`)), sources())).toEqual(
      refused({ kind: "number", value: marked }),
    );
    const dingbats = char(0x278a, 0x24ff, 0x24ff, 0x24ff);
    expect(grounded(digest(facts(`Claim ${dingbats} GNOT`)), sources())).toEqual(
      refused({ kind: "number", value: dingbats }),
    );
    const price = sources({ page: `Price: 1${char(0xbd)} GNOT, a supply of 10${char(0x2076)}` });
    expect(grounded(digest(facts("11 GNOT")), price)).toEqual(refused({ kind: "number", value: "11" }));
    expect(grounded(digest(facts("106 GNOT")), price)).toEqual(refused({ kind: "number", value: "106" }));
    expect(grounded(digest(facts(`1${char(0xbd)} GNOT`)), price).ok).toBe(true);
  });

  it("refuses digits a narrow space parts, a sign any dash writes, a separator not the page's", () => {
    const char = (point: number) => String.fromCodePoint(point);
    const hair = char(0x200a);
    expect(grounded(digest(facts(`Claim 1${hair}0${hair}0${hair}0 GNOT`)), sources())).toEqual(
      refused({ kind: "number", value: "1000" }),
    );
    const refund = sources({ page: "Refund: 5 GNOT, then 1 and 000" });
    expect(grounded(digest(facts(`${char(0x2010)}5 GNOT`)), refund)).toEqual(refused({ kind: "number", value: "-5" }));
    const dotted = `1${char(0x2027)}000`;
    expect(grounded(digest(facts(`${dotted} GNOT`)), refund)).toEqual(refused({ kind: "number", value: dotted }));
  });

  it("holds of a page no number a blank with a glyph's width parts", () => {
    const voters = sources({ page: `2026${String.fromCodePoint(0x2800)}100 voters` });
    expect(grounded(digest(facts("2026100 voters")), voters)).toEqual(refused({ kind: "number", value: "2026100" }));
  });

  it("refuses an account in upper case, parted by a character that draws nothing, or holding a look-alike letter", () => {
    const pay = (to: string) => digest(form({ function: "Transfer", args: { to, n4: "37" } }));
    expect(grounded(pay(OTHER.toUpperCase()), sources())).toEqual(
      refused({ kind: "address", value: OTHER }, { kind: "argument", value: OTHER.toUpperCase() }),
    );
    expect(grounded(pay(ADMIN.toUpperCase()), sources())).toEqual(
      refused({ kind: "argument", value: ADMIN.toUpperCase() }),
    );
    const parted = `${OTHER.slice(0, 20)}${String.fromCodePoint(0x200b)}${OTHER.slice(20)}`;
    expect(grounded(digest(text(`Send to ${parted}`)), sources())).toEqual(refused({ kind: "address", value: OTHER }));
    expect(grounded(digest(text(`Send to ${String.fromCodePoint(0x3164)}${OTHER}`)), sources())).toEqual(
      refused({ kind: "address", value: OTHER }),
    );
    const lookalike = `${ADMIN.slice(0, 30)}${String.fromCodePoint(0x430)}${ADMIN.slice(31)}`;
    expect(grounded(digest(text(`Send to ${lookalike}`)), sources())).toEqual(
      refused({ kind: "address", value: lookalike }),
    );
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
    expect(grounded(digest(text("This realm is safe, send your coins here.")), sources())).toEqual(nothing);
    expect(grounded(digest({ type: "announcement", text: "Big news soon" }), sources())).toEqual(nothing);
    const close = digest(form({ function: "Close", args: {}, why: "Close it." }));
    expect(grounded(close, sources())).toEqual({ ok: true, digest: close });
  });

  it("checks the numbers of a label, a point, an argument, a why and a link's address in a text", () => {
    const cases: [Digest, { kind: string; value: string }][] = [
      [digest({ type: "facts", facts: [{ label: "Top 44", value: "1,204" }] }), { kind: "number", value: "44" }],
      [digest({ type: "chart", label: "Proposals", points: [37, 38] }), { kind: "number", value: "38" }],
      [
        digest({ type: "chart", label: "Proposals", points: [0.1 + 0.2] }),
        { kind: "number", value: "0.30000000000000004" },
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
    expect(grounded(digest(facts(`1${String.fromCodePoint(0x66c)}204`)), arabic).ok).toBe(true);
    expect(grounded(digest(facts("1,204")), arabic)).toEqual(refused({ kind: "number", value: "1,204" }));
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

  it("takes what the model gave as it came, and refuses what is no button", () => {
    for (const given of [
      undefined,
      { type: "fly", label: "Go", place: "//evil.example" },
      { type: "link", label: "Go" },
    ])
      expect(groundedButton(given, sources())).toEqual(shape);
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
    expect(groundedButton(fly(`Pay ${OTHER.toUpperCase()}`), sources())).toEqual(
      refused({ kind: "address", value: OTHER }),
    );
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
