import { describe, expect, it } from "vitest";
import { AnswerButton, Digest, JARVIS_CAPS, ProposedAction } from "./jarvis.ts";

// 10d: what Jarvis hands the client, as data. Each builder makes a fresh value inside the test (F2356).
const action = () => ({
  realm: "gno.land/r/demo/poll",
  function: "Vote",
  args: { id: "3", answer: "yes" },
  why: "The poll closes today.",
});
const blocks = () => ({
  facts: { type: "facts", facts: [{ label: "Members", value: "1,204" }] },
  chart: { type: "chart", label: "Votes a day", points: [3, 5.5, -8, 0] },
  links: { type: "links", links: [{ label: "The board", href: "https://gno.land/r/demo/boards" }] },
  form: { type: "form", action: action() },
  announcement: { type: "announcement", text: "Voting closes at block 1,200,000." },
  text: { type: "text", markdown: "A poll realm: **one vote** an account." },
});
const digest = (...list: unknown[]) => Digest.safeParse({ blocks: list }).success;
const proposal = (over: Record<string, unknown>) => ProposedAction.safeParse({ ...action(), ...over }).success;
const button = (value: unknown) => AnswerButton.safeParse(value).success;
const text = (length: number) => "a".repeat(length);
// One code point, two code units: Zod counts a string's code points (zod 4.6.7, v4/core/checks.js:270).
const wide = (count: number) => String.fromCodePoint(0x1f600).repeat(count);

describe("JARVIS_CAPS", () => {
  it("are the bounds decided for 10d (D75)", () => {
    expect(JARVIS_CAPS).toEqual({
      blocks: 50,
      facts: 12,
      points: 100,
      links: 10,
      args: 16,
      label: 80,
      value: 200,
      href: 2048,
      announcement: 280,
      text: 1000,
      arg: 1000,
      why: 200,
      name: 128,
      realm: 128,
      place: 200,
    });
  });
});

describe("Digest", () => {
  it("takes one block of each kind, and all six together", () => {
    for (const block of Object.values(blocks())) expect(digest(block)).toBe(true);
    expect(digest(...Object.values(blocks()))).toBe(true);
  });

  it("takes as many blocks as the cap and refuses none, one past it and a digest that is not a list", () => {
    expect(digest(...Array.from({ length: JARVIS_CAPS.blocks }, () => blocks().text))).toBe(true);
    expect(digest(...Array.from({ length: JARVIS_CAPS.blocks + 1 }, () => blocks().text))).toBe(false);
    expect(digest()).toBe(false);
    expect(Digest.safeParse({ blocks: blocks().text }).success).toBe(false);
    expect(Digest.safeParse([blocks().text]).success).toBe(false);
  });

  it("refuses HTML, interface code and any block of another kind", () => {
    expect(digest({ type: "html", html: "<b>yes</b>" })).toBe(false);
    expect(digest({ type: "component", name: "Card" })).toBe(false);
    expect(digest({ facts: [{ label: "Members", value: "4" }] })).toBe(false);
  });

  it("refuses a field a block does not have, and one on the digest itself", () => {
    for (const block of Object.values(blocks())) expect(digest({ ...block, html: "<b>yes</b>" })).toBe(false);
    expect(Digest.safeParse({ blocks: [blocks().text], html: "<b>yes</b>" }).success).toBe(false);
    expect(digest({ type: "facts", facts: [{ label: "Members", value: "4", html: "<b>4</b>" }] })).toBe(false);
    expect(digest({ type: "links", links: [{ label: "Page", href: "https://gno.land", onclick: "x()" }] })).toBe(false);
  });

  it("bounds a fact's label and value, and a block's count of facts", () => {
    const facts = (label: string, value: string, count = 1) =>
      digest({ type: "facts", facts: Array.from({ length: count }, () => ({ label, value })) });
    expect(facts(text(JARVIS_CAPS.label), text(JARVIS_CAPS.value), JARVIS_CAPS.facts)).toBe(true);
    expect(facts(text(JARVIS_CAPS.label + 1), "4")).toBe(false);
    expect(facts("Members", text(JARVIS_CAPS.value + 1))).toBe(false);
    expect(facts("Members", wide(JARVIS_CAPS.value))).toBe(true);
    expect(facts("Members", wide(JARVIS_CAPS.value + 1))).toBe(false);
    expect(facts("", "4")).toBe(false);
    expect(facts("Members", "")).toBe(false);
    expect(facts("Members", "4", JARVIS_CAPS.facts + 1)).toBe(false);
    expect(facts("Members", "4", 0)).toBe(false);
  });

  it("takes a chart of finite numbers only, from one to the cap", () => {
    const chart = (points: unknown[], label = "Votes") => digest({ type: "chart", label, points });
    expect(chart(Array.from({ length: JARVIS_CAPS.points }, (_, at) => at))).toBe(true);
    expect(chart(Array.from({ length: JARVIS_CAPS.points + 1 }, (_, at) => at))).toBe(false);
    expect(chart([])).toBe(false);
    for (const point of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, "5", null])
      expect(chart([1, point])).toBe(false);
    expect(chart([1], text(JARVIS_CAPS.label + 1))).toBe(false);
    expect(chart([1], "")).toBe(false);
  });

  it("takes a chart's point only as JavaScript writes it in full, never in an exponent's form", () => {
    const chart = (points: unknown[]) => digest({ type: "chart", label: "Votes", points });
    for (const point of [1e20, -1e20, 1e-6, -0, 0.1 + 0.2]) expect(chart([point])).toBe(true);
    for (const point of [1e21, -1e21, 1e-7, Number.MAX_VALUE, Number.MIN_VALUE]) expect(chart([point])).toBe(false);
  });

  it("takes links to https addresses only, each labelled, from one to the cap", () => {
    const links = (href: string, count = 1, label = "Page") =>
      digest({ type: "links", links: Array.from({ length: count }, () => ({ label, href })) });
    expect(links("https://gno.land/r/demo/boards", JARVIS_CAPS.links)).toBe(true);
    expect(links(`https://gno.land/${text(JARVIS_CAPS.href - "https://gno.land/".length)}`)).toBe(true);
    expect(links(`https://gno.land/${text(JARVIS_CAPS.href - "https://gno.land/".length + 1)}`)).toBe(false);
    for (const href of ["http://gno.land/r/demo", "javascript:alert(1)", "data:text/html,x", "/r/demo/boards", ""])
      expect(links(href)).toBe(false);
    expect(links("https://gno.land", JARVIS_CAPS.links + 1)).toBe(false);
    expect(links("https://gno.land", 0)).toBe(false);
    expect(links("https://gno.land", 1, "")).toBe(false);
    expect(links("https://gno.land", 1, text(JARVIS_CAPS.label + 1))).toBe(false);
  });

  it("bounds an announcement and a text, and refuses an empty one", () => {
    expect(digest({ type: "announcement", text: text(JARVIS_CAPS.announcement) })).toBe(true);
    expect(digest({ type: "announcement", text: text(JARVIS_CAPS.announcement + 1) })).toBe(false);
    expect(digest({ type: "announcement", text: "" })).toBe(false);
    expect(digest({ type: "text", markdown: text(JARVIS_CAPS.text) })).toBe(true);
    expect(digest({ type: "text", markdown: text(JARVIS_CAPS.text + 1) })).toBe(false);
    expect(digest({ type: "text", markdown: "" })).toBe(false);
  });

  it("takes a form as one proposed action, and refuses one that is not", () => {
    expect(digest({ type: "form", action: { ...action(), send: "1000000ugnot" } })).toBe(false);
    expect(digest({ type: "form", action: [action()] })).toBe(false);
  });
});

describe("ProposedAction", () => {
  it("takes a realm, a function, its arguments by name as text and a sentence of why", () => {
    expect(ProposedAction.parse(action())).toEqual(action());
    expect(proposal({ args: {} })).toBe(true);
    expect(proposal({ args: { note: "" } })).toBe(true);
  });

  it.each(["send", "coins", "amount", "funds", "deposit", "maxDeposit"])(
    "never carries coins: a field %j fails",
    (key) => {
      expect(proposal({ [key]: "1000000ugnot" })).toBe(false);
      expect(proposal({ [key]: 1_000_000 })).toBe(false);
    },
  );

  it("refuses an argument that is not text: a number, a list, an amount as an object", () => {
    expect(proposal({ args: { id: 3 } })).toBe(false);
    expect(proposal({ args: { id: ["3"] } })).toBe(false);
    expect(proposal({ args: { amount: { denom: "ugnot", amount: "5" } } })).toBe(false);
    expect(proposal({ args: [["id", "3"]] })).toBe(false);
  });

  it("bounds the arguments: their count, a name and a value", () => {
    const many = (count: number) =>
      Object.fromEntries(Array.from({ length: count }, (_, at) => [`a${String(at)}`, "1"]));
    expect(proposal({ args: many(JARVIS_CAPS.args) })).toBe(true);
    expect(proposal({ args: many(JARVIS_CAPS.args + 1) })).toBe(false);
    expect(proposal({ args: { [text(JARVIS_CAPS.name)]: "1" } })).toBe(true);
    expect(proposal({ args: { [text(JARVIS_CAPS.name + 1)]: "1" } })).toBe(false);
    expect(proposal({ args: { "": "1" } })).toBe(false);
    expect(proposal({ args: { note: text(JARVIS_CAPS.arg) } })).toBe(true);
    expect(proposal({ args: { note: text(JARVIS_CAPS.arg + 1) } })).toBe(false);
  });

  it("bounds the realm, the function and the why, none of them empty", () => {
    expect(
      proposal({ realm: text(JARVIS_CAPS.realm), function: text(JARVIS_CAPS.name), why: text(JARVIS_CAPS.why) }),
    ).toBe(true);
    expect(proposal({ realm: text(JARVIS_CAPS.realm + 1) })).toBe(false);
    expect(proposal({ function: text(JARVIS_CAPS.name + 1) })).toBe(false);
    expect(proposal({ why: text(JARVIS_CAPS.why + 1) })).toBe(false);
    for (const key of ["realm", "function", "why"]) expect(proposal({ [key]: "" })).toBe(false);
  });

  it.each(["realm", "function", "args", "why"])("refuses a proposal with no %s", (key) => {
    const rest = Object.fromEntries(Object.entries(action()).filter(([field]) => field !== key));
    expect(ProposedAction.safeParse(rest).success).toBe(false);
  });
});

describe("AnswerButton", () => {
  it("flies to a place by its path, or opens a proposed action", () => {
    for (const place of ["/", "/earth", "/w/bubble", "/e/defi-hub", "/net/onyx/", "/net/onyx/w/bubble"])
      expect(button({ type: "fly", label: "Go there", place })).toBe(true);
    expect(button({ type: "action", label: "Vote", action: action() })).toBe(true);
  });

  it.each([
    "",
    "w/bubble",
    "//evil.example",
    "/w//bubble",
    "https://evil.example/w/x",
    "/w/../admin",
    "/W/Bubble",
    "/w/b?x=1",
  ])("refuses the place %j, which is no place's path", (place) => {
    expect(button({ type: "fly", label: "Go there", place })).toBe(false);
  });

  it("bounds a place and a label, and refuses an empty label", () => {
    expect(button({ type: "fly", label: "Go", place: `/w/${text(JARVIS_CAPS.place - 3)}` })).toBe(true);
    expect(button({ type: "fly", label: "Go", place: `/w/${text(JARVIS_CAPS.place - 2)}` })).toBe(false);
    expect(button({ type: "fly", label: text(JARVIS_CAPS.label), place: "/" })).toBe(true);
    expect(button({ type: "fly", label: text(JARVIS_CAPS.label + 1), place: "/" })).toBe(false);
    expect(button({ type: "action", label: "", action: action() })).toBe(false);
  });

  it("refuses a button of another kind, an action carrying coins and a field a button does not have", () => {
    expect(button({ type: "link", label: "Open", href: "https://evil.example" })).toBe(false);
    expect(button({ type: "action", label: "Vote", action: { ...action(), send: "5ugnot" } })).toBe(false);
    expect(button({ type: "fly", label: "Go", place: "/", action: action() })).toBe(false);
    expect(button({ type: "action", label: "Vote", action: action(), place: "/" })).toBe(false);
  });
});
