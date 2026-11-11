// @vitest-environment jsdom
import fc from "fast-check";
import type { JarvisAnswer } from "@gnoworld/schemas";
import type { ChainFetch } from "@gnoworld/chain/read";
import { MemoryRouter } from "react-router";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { StoreProvider } from "../../storeContext.tsx";
import { SignedIn } from "../../../tests/grabStore.tsx";
import { all, button, click, modals, mount, nth, one } from "../../../tests/mount.tsx";
import { after, calling, CHAIN, CUR, field, inputs, listing } from "../../../tests/callFixtures.ts";
import { drawing } from "../chat/index.ts";
import { drawerOf } from "./drawer.ts";
import { AnswerCard, type DrawMarkdown } from "./AnswerCard.tsx";

// 10u-a, tier 1: an answer is a machine's words, drawn through the chat's reader and never as HTML; its buttons are checked again here:
// an action opens the call card only once vm/qfuncs lists the function with exactly its arguments' names, never coins.
// A link on gnoweb or on the app's own origin is an anchor, any other a button behind the leaving warning.
interface Proposed {
  realm: string;
  function: string;
  args: Record<string, string>;
  why: string;
}
type Answered = Extract<JarvisAnswer, { status: "answered" }>;
const DAO = "gno.land/r/gov/dao";
const OWN = "https://gnoworld.test";
const FUNCTIONS = [
  { FuncName: "Vote", Params: [CUR, field("pid", "int64"), field("option", "string")], Results: null },
  { FuncName: "Ping", Params: [CUR], Results: null },
  { FuncName: "TotalSupply", Params: null, Results: [field(".res.0", "int64")] },
];
const VOTE: Proposed = { realm: DAO, function: "Vote", args: { pid: "15", option: "YES" }, why: "It closes tomorrow." };

let drawn: DrawMarkdown;
beforeAll(async () => {
  modals();
  drawn = drawerOf(await drawing());
});

function draw(markdown: string, buttons: Answered["buttons"] = [], fetch: ChainFetch = () => listing(FUNCTIONS)) {
  const onFly = vi.fn<(place: string) => void>();
  const box = mount(
    <MemoryRouter>
      <StoreProvider>
        <SignedIn />
        <AnswerCard
          answer={{ status: "answered", markdown, buttons }}
          chain={CHAIN}
          options={{ fetch }}
          gnoweb={CHAIN.gnoweb}
          own={OWN}
          draw={drawn}
          onFly={onFly}
        />
      </StoreProvider>
    </MemoryRouter>,
  );
  return { box, onFly, text: () => one(box, "[data-jarvis-markdown]") };
}

describe("an answer's card", () => {
  it("says it is an AI concierge's and may be wrong", () => {
    const { box } = draw("Hello");
    expect(box.textContent).toMatch(/ai concierge/i);
    expect(box.textContent).toContain("AI · may be wrong");
  });

  it("draws the Markdown as the chat does: marks, a list, code", () => {
    const { text } = draw("**bold** and `code`\n\n- one\n- two");
    expect(one(text(), "strong").textContent).toBe("bold");
    expect(one(text(), "code").textContent).toBe("code");
    expect(all(text(), "li").map((li) => li.textContent)).toEqual(["one", "two"]);
  });
});

describe("an answer's words are inert", () => {
  it("draws an image as no image: no img, no picture, no media, its address behind the warning", () => {
    const { text } = draw("![x](https://evil.example/a.png)");
    expect(all(text(), "img, picture, video, audio, svg, source, object, embed, iframe")).toEqual([]);
    expect(all(text(), "a")).toEqual([]);
    expect(one(text(), "button").title).toBe("https://evil.example/a.png");
  });

  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "data:text/html,<script>1</script>",
    "vbscript:x",
    "//evil.example",
  ])("draws [x](%s) as no link: no anchor, no button, nothing to follow", (href) => {
    const { text } = draw(`[x](${href})`);
    expect(all(text(), "a, button, [href], [onclick]")).toEqual([]);
  });

  it("draws raw HTML as text: no element of it reaches the page", () => {
    const html =
      '<img src=x onerror="alert(1)"><script>alert(1)</script><iframe src="//x"></iframe><a href="//x">y</a>';
    const { box, text } = draw(html);
    expect(all(box, "img, script, iframe, a, style, form, input, [onerror]")).toEqual([]);
    expect(text().textContent).toContain("<script>alert(1)</script>");
  });

  it("draws @room as plain text: no mention, nothing that pings or links", () => {
    const { text } = draw("hello @room and @ROOM");
    expect(all(text(), "[data-mention], a, button")).toEqual([]);
    expect(text().textContent).toContain("@room");
  });

  it("leaves a link on gnoweb or on the app's own origin to an anchor, no warning, however it is written", () => {
    const { box, text } = draw(`[a](${CHAIN.gnoweb}/r/gov/dao) [b](${OWN}/w/bubble) ${CHAIN.gnoweb}/r/x ${OWN}/earth`);
    expect(all(text(), "a").map((a) => a.getAttribute("href"))).toEqual([
      `${CHAIN.gnoweb}/r/gov/dao`,
      `${OWN}/w/bubble`,
      `${CHAIN.gnoweb}/r/x`,
      `${OWN}/earth`,
    ]);
    expect(all(text(), "button")).toEqual([]);
    expect(all(box, "dialog")).toEqual([]);
  });

  it("puts any other site behind the leaving warning, nothing opened until pressed, the warning naming the real host", () => {
    const { box, text } = draw("[theirs](https://example.org/x)");
    expect(all(text(), "a")).toEqual([]);
    expect(all(box, "dialog[open]")).toEqual([]);
    click(one(text(), "button"));
    expect(one(box, "dialog[open]").textContent).toContain("example.org");
  });

  it("puts a bare address in the text behind the warning too", () => {
    const { box, text } = draw("see https://evil.example/x for more");
    expect(all(text(), "a")).toEqual([]);
    click(one(text(), "button"));
    expect(one(box, "dialog[open]").textContent).toContain("evil.example");
  });

  it("draws a link whose label names gnoweb but goes elsewhere as a warning button that names where it goes", () => {
    const { box, text } = draw(`[${CHAIN.gnoweb}/r/gov/dao](https://evil.example)`);
    expect(all(text(), "a")).toEqual([]);
    click(one(text(), "button"));
    const dialog = one(box, "dialog[open]");
    expect(dialog.textContent).toContain("evil.example");
    expect(dialog.textContent).toContain("https://evil.example");
  });

  it.each([
    ["a suffix on gnoweb's host", `${CHAIN.gnoweb}.evil.example/r/x`, new URL(`${CHAIN.gnoweb}.evil.example`).host],
    ["another port of gnoweb", `${CHAIN.gnoweb}:8443/r/x`, `${new URL(CHAIN.gnoweb).hostname}:8443`],
    ["a lookalike letter", "https://0nyx.testnets.gno.land/r/x", "0nyx.testnets.gno.land"],
    ["a suffix on the app's origin", `${OWN}.evil.example/x`, "gnoworld.test.evil.example"],
    ["another port of the app's origin", `${OWN}:8443/x`, "gnoworld.test:8443"],
    ["the site in the path of another", `https://evil.example/${CHAIN.gnoweb}`, "evil.example"],
  ])(
    "treats %s as another site: exactly one button, never an anchor, and its warning names the real host",
    (_, href, host) => {
      const { box, text } = draw(`[x](${href})`);
      expect(all(text(), "a")).toEqual([]);
      click(one(text(), "button"));
      expect(one(box, "dialog[open]").textContent).toContain(host);
    },
  );

  it.each([
    `http://${new URL(CHAIN.gnoweb).host}/r/x`,
    `https://${new URL(CHAIN.gnoweb).host}@evil.example/r/x`,
    `${CHAIN.gnoweb}\u202e/r/x`,
    `${OWN.replace("https", "http")}/x`,
  ])("draws the address %s no link at all: nothing to follow", (href) => {
    const { text } = draw(`[x](${href})`);
    expect(all(text(), "a, button")).toEqual([]);
  });

  it.each([">".repeat(8000), "[".repeat(8000), "*_".repeat(4000), "[x](".repeat(2000), "a".repeat(8000)])(
    "draws an answer of the size the door allows (8000 code points of one pattern) without throwing",
    (markdown) => {
      expect(() => draw(markdown)).not.toThrow();
    },
  );

  it("keeps whatever the model writes inside the reader's elements and anchors to gnoweb or the app, with fast-check", () => {
    const pieces = fc.constantFrom(
      "![i](https://a.example/i.png)",
      "[x](javascript:alert(1))",
      "[x](data:text/html,1)",
      "[x](https://onyx.testnets.gno.land.evil.example/)",
      `[x](${CHAIN.gnoweb}/r/a)`,
      `[x](${OWN}/w/a)`,
      `${CHAIN.gnoweb}/r/b`,
      "https://evil.example/c",
      "[x](https://example.org)",
      "<img src=x onerror=alert(1)>",
      '<a href="javascript:1" onclick="1">',
      "<script>1</script>",
      "@room",
      "@g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5",
      "**",
      "_",
      "`",
      "\n",
      "\n\n",
      "> ",
      "- ",
      "[",
      "](",
      ")",
      "x",
      " ",
    );
    const unsafe = /^\s*(?:javascript|data|vbscript):/i;
    fc.assert(
      fc.property(fc.array(pieces, { maxLength: 30 }), (parts) => {
        const { box, text } = draw(parts.join(""));
        expect(
          all(
            text(),
            "img, picture, svg, script, iframe, object, embed, style, form, input, video, audio, [onerror], [onclick]",
          ),
        ).toEqual([]);
        for (const a of all(text(), "a")) {
          const href = a.getAttribute("href") ?? "";
          expect(href.startsWith(`${CHAIN.gnoweb}/`) || href.startsWith(`${OWN}/`)).toBe(true);
        }
        for (const b of all(text(), "button")) expect(b.title).toMatch(/^https:\/\//);
        for (const element of all(box, "[href], [src]"))
          expect(unsafe.test(element.getAttribute("href") ?? element.getAttribute("src") ?? "")).toBe(false);
        expect(all(text(), "[data-mention]").filter((m) => m.textContent === "@room")).toEqual([]);
      }),
      { numRuns: 60 },
    );
  });
});

describe("an answer's buttons", () => {
  it("draws a fly button by its label, and goes to its place when pressed", () => {
    const { box, onFly } = draw("Go there.", [{ type: "fly", label: "Fly to Bubble", place: "/w/bubble" }]);
    expect(onFly).not.toHaveBeenCalled();
    click(button(box, "Fly to Bubble"));
    expect(onFly).toHaveBeenCalledExactlyOnceWith("/w/bubble");
  });

  it("draws a label as text: no markup of it reaches the page", () => {
    const { box } = draw("x", [{ type: "fly", label: "<img src=x onerror=1>", place: "/" }]);
    expect(all(box, "img")).toEqual([]);
  });

  it("opens the call card prefilled for an action vm/qfuncs confirms, its coins empty, asking no wallet until the person signs", async () => {
    const touched = vi.fn(() => undefined);
    Object.defineProperty(globalThis, "adena", { get: touched, configurable: true });
    try {
      const { box } = draw("Vote.", [{ type: "action", label: "Vote yes", action: VOTE }]);
      const call = await calling(box, "Vote yes");
      expect(box.textContent).toContain("It closes tomorrow.");
      click(call);
      const card = nth(all(box, "article"), 1);
      expect(inputs(card).map((input) => input.value)).toEqual(["15", "YES"]);
      expect(card.textContent).not.toMatch(/\d\s*ugnot/);
      expect(touched).not.toHaveBeenCalled();
    } finally {
      Reflect.deleteProperty(globalThis, "adena");
    }
  });

  it("gives a function that takes nothing but the realm a button when its arguments are none: exactly its parameters", async () => {
    const { box } = draw("x", [{ type: "action", label: "Ping", action: { ...VOTE, function: "Ping", args: {} } }]);
    expect(await calling(box, "Ping")).toBeDefined();
  });

  it("shows no button until vm/qfuncs has answered, and then the confirmed one", async () => {
    let answer: (response: Response) => void = () => undefined;
    const held = new Promise<Response>((resolve) => {
      answer = resolve;
    });
    const { box } = draw("x", [{ type: "action", label: "Vote yes", action: VOTE }], () => held);
    // One task: the held read has been asked and has not answered.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(button(box, "Vote yes")).toBeUndefined();
    answer(await listing(FUNCTIONS));
    expect(await calling(box, "Vote yes")).toBeDefined();
  });

  const refused: [string, Proposed, () => Promise<Response>][] = [
    ["a function vm/qfuncs does not list", { ...VOTE, function: "Drain" }, () => listing(FUNCTIONS)],
    ["a function in another case", { ...VOTE, function: "vote" }, () => listing(FUNCTIONS)],
    [
      "a read function, which no call can make",
      { ...VOTE, function: "TotalSupply", args: {} },
      () => listing(FUNCTIONS),
    ],
    [
      "an argument the function has no parameter for",
      { ...VOTE, args: { ...VOTE.args, amount: "9" } },
      () => listing(FUNCTIONS),
    ],
    [
      "an argument missing: exactly the function's parameters",
      { ...VOTE, args: { pid: "15" } },
      () => listing(FUNCTIONS),
    ],
    [
      "a realm whose read fails",
      { ...VOTE, realm: "gno.land/r/other" },
      () => Promise.reject(new TypeError("unreachable")),
    ],
    ["an empty listing", VOTE, () => listing([])],
    ["a listing that is not a list", VOTE, () => listing({})],
    ["an answer that is no JSON", VOTE, () => Promise.resolve(new Response("<html>"))],
  ];
  it.each(refused)("draws no button for %s", async (_, action, read) => {
    const under = vi.fn<ChainFetch>(read);
    const sibling = vi.fn<ChainFetch>(() => after(under, () => listing(FUNCTIONS)));
    const box = mount(
      <MemoryRouter>
        <StoreProvider>
          <SignedIn />
          <AnswerCard
            answer={{ status: "answered", markdown: "x", buttons: [{ type: "action", label: "Do it", action }] }}
            chain={CHAIN}
            options={{ fetch: under }}
            gnoweb={CHAIN.gnoweb}
            own={OWN}
            draw={drawn}
            onFly={() => undefined}
          />
          <div data-test="sibling">
            <AnswerCard
              answer={{ status: "answered", markdown: "y", buttons: [{ type: "action", label: "Ok", action: VOTE }] }}
              chain={{ ...CHAIN, rpc: "https://rpc.sibling.example:443" }}
              options={{ fetch: sibling }}
              gnoweb={CHAIN.gnoweb}
              own={OWN}
              draw={drawn}
              onFly={() => undefined}
            />
          </div>
        </StoreProvider>
      </MemoryRouter>,
    );
    // The sibling's own button shows once the read under test has answered and a task has passed: the drawing is done.
    await calling(one(box, '[data-test="sibling"]'), "Ok");
    expect(button(box, "Do it")).toBeUndefined();
  });

  it.each([
    ["a fly label", { type: "fly", label: "Go \u202eon sey\u202c", place: "/w/bubble" }],
    ["an action label", { type: "action", label: "Vote \u202eon sey\u202c", action: VOTE }],
    ["a label with a zero-width mark", { type: "fly", label: "Go\u200b there", place: "/w/bubble" }],
    ["a label with a line separator", { type: "fly", label: "Go\u2028 there", place: "/w/bubble" }],
    ["a label with a paragraph separator", { type: "fly", label: "Go\u2029 there", place: "/w/bubble" }],
  ] as const)(
    "draws no button for %s that holds a hidden character: a machine's words are drawn as written or not at all",
    async (_, hostile) => {
      const { box } = draw("x", [hostile, { type: "fly", label: "Fly to Bubble", place: "/w/bubble" }]);
      expect(await calling(box, "Fly to Bubble")).toBeDefined();
      await new Promise((resolve) => setTimeout(resolve, 0));
      expect(all(box, "button").filter((b) => /sey|there/.test(b.textContent))).toEqual([]);
    },
  );
});
