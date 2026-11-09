// @vitest-environment jsdom
import { act } from "react";
import { MemoryRouter } from "react-router";
import type { ChainFetch } from "@gnoworld/chain/read";
import { describe, expect, it, vi } from "vitest";
import { StoreProvider } from "../../storeContext.tsx";
import { all, button, click, mount, one } from "../../../tests/mount.tsx";
import { after, calling, CHAIN, CUR, field, inputs, listing, typed } from "../../../tests/callFixtures.ts";
import { ActionForm } from "./ActionForm.tsx";
import { InlineCard } from "./InlineCard.tsx";

// 9e, ADR-0002 section 4, "Proposed actions": a pinned or proposed action shows only once vm/qfuncs confirms its function, types
// and argument names: a card prefilled, every field editable, naming the realm and function it says; else nothing, so a planted
// message forges no button. NOT recorded: qfuncs' shape.
const DAO = "gno.land/r/gov/dao";
const FUNCTIONS = [
  {
    FuncName: "MustVoteOnProposalSimple",
    Params: [CUR, field("pid", "int64"), field("option", "string")],
    Results: null,
  },
  { FuncName: "Configure", Params: [CUR, field("settings", "map[string]string")], Results: null },
  { FuncName: "TotalSupply", Params: null, Results: [field(".res.0", "int64")] },
];
interface Action {
  realm: string;
  function: string;
  args: Record<string, string>;
  why?: string;
}
const VOTE: Action = {
  realm: DAO,
  function: "MustVoteOnProposalSimple",
  args: { pid: "15", option: "YES" },
  why: "Proposal 15 closes tomorrow.",
};

const FUNCTIONS_ANSWER = () => listing(FUNCTIONS);

async function draw(action: Action, more: { label?: string; read?: () => Promise<Response>; viewHref?: string } = {}) {
  const { read = FUNCTIONS_ANSWER, label, viewHref } = more;
  const under = vi.fn<ChainFetch>(read);
  const sibling = vi.fn<ChainFetch>(() => after(under, FUNCTIONS_ANSWER));
  const box = mount(
    <StoreProvider>
      <div data-test="under">
        <ActionForm
          action={action}
          {...(label === undefined ? {} : { label })}
          {...(viewHref === undefined ? {} : { viewHref })}
          chain={CHAIN}
          options={{ fetch: under }}
        />
      </div>
      <div data-test="sibling">
        <ActionForm action={VOTE} chain={CHAIN} options={{ fetch: sibling }} />
      </div>
    </StoreProvider>,
  );
  await vi.waitFor(() => {
    expect(button(one(box, '[data-test="sibling"]'), "Call MustVoteOnProposalSimple")).toBeDefined();
  });
  return one(box, '[data-test="under"]');
}
describe("a checked action as a Form block", () => {
  it("shows a proposal that qfuncs confirms as a form with its why and a Call, and opens no card, asks no wallet, until the Call", async () => {
    const touched = vi.fn(() => undefined);
    Object.defineProperty(globalThis, "adena", { get: touched, configurable: true });
    try {
      const box = await draw(VOTE);
      expect(one(box, "figure").textContent).toContain("Proposal 15 closes tomorrow.");
      expect(all(box, "article")).toHaveLength(0);
      click(await calling(box, "Call MustVoteOnProposalSimple"));
      expect(touched).not.toHaveBeenCalled();
    } finally {
      Reflect.deleteProperty(globalThis, "adena");
    }
  });

  it("opens the card prefilled with the arguments, each field editable, naming the realm and the function the action says", async () => {
    const box = await draw(VOTE);
    click(await calling(box, "Call MustVoteOnProposalSimple"));
    const card = one(box, "article");
    expect(inputs(card).map((i) => i.value)).toEqual(["15", "YES"]);
    expect(inputs(card).every((i) => !i.readOnly && !i.disabled && i.type !== "hidden")).toBe(true);
    expect(card.textContent).toContain(DAO);
    expect(card.textContent).toContain("MustVoteOnProposalSimple");
  });

  it("keeps what was typed in the open card when its Call is clicked again: a vote changed to NO is not sent as YES", async () => {
    const box = await draw(VOTE);
    const caller = await calling(box, "Call MustVoteOnProposalSimple");
    click(caller);
    typed(inputs(one(box, "article"))[1], "NO");
    click(caller);
    expect(inputs(one(box, "article")).map((i) => i.value)).toEqual(["15", "NO"]);
  });

  it.each(["constructor", "toString", "valueOf", "__proto__"])(
    "leaves a parameter named %s empty when the action leaves it out, and the card draws",
    async (name) => {
      const under = vi.fn<ChainFetch>(() =>
        listing([{ FuncName: "Vote", Params: [CUR, field(name, "string")], Results: null }]),
      );
      const box = mount(
        <StoreProvider>
          <ActionForm action={{ realm: DAO, function: "Vote", args: {} }} chain={CHAIN} options={{ fetch: under }} />
        </StoreProvider>,
      );
      click(await calling(box, "Call Vote"));
      expect(inputs(one(box, "article")).map((i) => i.value)).toEqual([""]);
    },
  );

  it("draws a team's pinned action under its label, and its card names the realm and function the data says", async () => {
    const box = await draw({ realm: DAO, function: "MustVoteOnProposalSimple", args: {} }, { label: "Vote" });
    click(await calling(box, "Vote"));
    const card = one(box, "article");
    expect(card.textContent).toContain(DAO);
    expect(card.textContent).toContain("MustVoteOnProposalSimple");
    expect(inputs(card).map((i) => i.value)).toEqual(["", ""]);
  });

  it("keeps a prefilled value the type refuses as the card's problem, with Sign disabled: it signs exactly what its fields show", async () => {
    const box = await draw({ ...VOTE, args: { pid: "1e3", option: "YES" } });
    click(await calling(box, "Call MustVoteOnProposalSimple"));
    const card = one(box, "article");
    expect(inputs(card).map((i) => i.value)).toEqual(["1e3", "YES"]);
    expect(card.textContent).toMatch(/not in the form the field takes/);
    expect(button(card, "Sign in Adena")?.hasAttribute("disabled")).toBe(true);
  });

  it("gives the same action drawn twice a card each: a click on one opens that one's card only", async () => {
    const box = await draw(VOTE);
    const again = mount(
      <StoreProvider>
        <ActionForm
          action={{ ...VOTE, args: { pid: "99", option: "NO" } }}
          chain={CHAIN}
          options={{ fetch: vi.fn<ChainFetch>(FUNCTIONS_ANSWER) }}
        />
      </StoreProvider>,
    );
    click(await calling(box, "Call MustVoteOnProposalSimple"));
    expect(all(again, "article")).toHaveLength(0);
    expect(inputs(box).map((i) => i.value)).toEqual(["15", "YES"]);
  });

  it("draws the why as plain left-to-right text: no element from its markup, no reordering from a bidi override", async () => {
    const hostile = "<img src=x onerror=y>text";
    const box = await draw({ ...VOTE, why: hostile });
    await calling(box, "Call MustVoteOnProposalSimple");
    expect(all(box, "img, script")).toHaveLength(0);
    const why = all(box, "p").find((p) => p.textContent === hostile);
    expect(why?.getAttribute("dir")).toBe("ltr");
  });

  it("draws no why that holds a bidi override or another control character, and still shows the call itself", async () => {
    const override = String.fromCodePoint(0x202e);
    const box = await draw({ ...VOTE, why: `vote ${override}ON YES` });
    await calling(box, "Call MustVoteOnProposalSimple");
    expect(box.textContent).not.toContain(override);
    expect(all(box, "p").some((p) => p.textContent.includes("ON YES"))).toBe(false);
  });

  it("draws no paragraph for an empty why, and shows each field as a text field with nothing more said of it", async () => {
    const box = await draw({ ...VOTE, why: "" });
    await calling(box, "Call MustVoteOnProposalSimple");
    expect(all(box, "p").filter((p) => p.getAttribute("dir") === "ltr")).toHaveLength(0);
    const text = one(box, "figure").textContent;
    expect(text).toContain("pid input");
    expect(text).toContain("value: 15");
    for (const unsaid of ["type:", "placeholder:", "description:", "flags:"]) expect(text).not.toContain(unsaid);
  });

  it("draws a pinned label as plain text too", async () => {
    const box = await draw({ ...VOTE, args: {} }, { label: "<b>Vote</b>" });
    expect((await calling(box, "<b>Vote</b>")).querySelector("b")).toBeNull();
  });

  it.each([
    ["a function qfuncs does not list", { ...VOTE, function: "Drain" }],
    ["an argument that is no parameter", { ...VOTE, args: { pid: "15", option: "YES", to: "g1x" } }],
    ["the realm parameter named as an argument", { ...VOTE, args: { cur: "x" } }],
    ["a read function", { ...VOTE, function: "TotalSupply", args: {} }],
    ["a type a call does not carry", { ...VOTE, function: "Configure", args: { settings: "x" } }],
    ["an unexported name", { ...VOTE, function: "render", args: {} }],
    ["a dotted name", { ...VOTE, function: "Foo.Bar", args: {} }],
  ])("shows nothing for %s: no form, no Call, no text", async (_name, action) => {
    const box = await draw(action);
    expect(box.childElementCount).toBe(0);
  });

  it.each(["gno.land/p/demo/x", "..", 'gno.land/r/x"y', "gno.land/r/x\ny"])(
    "shows nothing, and asks the chain nothing, for the realm %j, which is no realm path",
    async (realm) => {
      const under = vi.fn<ChainFetch>(FUNCTIONS_ANSWER);
      const box = mount(
        <StoreProvider>
          <ActionForm action={{ ...VOTE, realm }} chain={CHAIN} options={{ fetch: under }} />
        </StoreProvider>,
      );
      await act(async () => {
        await Promise.resolve();
      });
      expect(box.childElementCount).toBe(0);
      expect(under).not.toHaveBeenCalled();
    },
  );

  it.each([
    ["fails", () => Promise.reject(new Error("offline"))],
    ["is down", () => Promise.resolve(new Response("down", { status: 503 }))],
  ])("shows nothing when qfuncs %s, and not a Call to try anyway", async (_name, read) => {
    const box = await draw(VOTE, { read });
    expect(box.childElementCount).toBe(0);
  });
});

describe("a checked action in the chat", () => {
  const WIDE = [
    {
      FuncName: "Grant",
      Params: [CUR, field("a", "string"), field("b", "string"), field("c", "string")],
      Results: null,
    },
  ];
  it("is only a compact card with its way to the realm view for a call of more than two fields: no input, no Call", async () => {
    const wide = vi.fn<ChainFetch>(() => listing(WIDE));
    const box = mount(
      <StoreProvider>
        <ActionForm
          action={{ realm: DAO, function: "Grant", args: { a: "x" }, why: "Needs three." }}
          chain={CHAIN}
          options={{ fetch: wide }}
          viewHref="/r/gov/dao"
        />
      </StoreProvider>,
    );
    await vi.waitFor(() => {
      expect(all(box, "a").map((a) => a.textContent)).toContain("Open in the realm view");
    });
    expect(
      all(box, "a")
        .find((a) => a.textContent === "Open in the realm view")
        ?.getAttribute("href"),
    ).toBe("/r/gov/dao");
    expect(all(box, "button, input, article")).toHaveLength(0);
    expect(box.textContent).toContain("Needs three.");
    expect(one(box, "figure").textContent).toContain("made in the realm view");
  });

  it("opens the card of a call of more than two fields when it is drawn with no way to a realm view", async () => {
    const box = mount(
      <StoreProvider>
        <ActionForm
          action={{ realm: DAO, function: "Grant", args: {} }}
          chain={CHAIN}
          options={{ fetch: vi.fn<ChainFetch>(() => listing(WIDE)) }}
        />
      </StoreProvider>,
    );
    click(await calling(box, "Call Grant"));
    expect(inputs(one(box, "article"))).toHaveLength(3);
    expect(one(box, "figure").textContent).toContain("a call you sign in Adena");
  });

  it("keeps a call of one or two fields as the form with its Call", async () => {
    const box = await draw(VOTE, { viewHref: "/r/gov/dao" });
    await calling(box, "Call MustVoteOnProposalSimple");
    expect(all(box, "a")).toHaveLength(0);
  });
});

describe("a checked action, as parts", () => {
  it("draws no paragraph at all for an action with no why", async () => {
    const box = await draw({ realm: DAO, function: "MustVoteOnProposalSimple", args: { pid: "15" } });
    await calling(box, "Call MustVoteOnProposalSimple");
    expect(box.querySelector("p[dir]")).toBeNull();
  });

  it("leaves a parameter the action gives no argument for empty in its card, and fills the one it gives", async () => {
    const box = await draw({ realm: DAO, function: "MustVoteOnProposalSimple", args: { pid: "15" } });
    click(await calling(box, "Call MustVoteOnProposalSimple"));
    expect(inputs(one(box, "article")).map((i) => i.value)).toEqual(["15", ""]);
  });

  it("reads the card's fees through the options it was given", async () => {
    const under = vi.fn<ChainFetch>(FUNCTIONS_ANSWER);
    const box = mount(
      <StoreProvider>
        <ActionForm action={VOTE} chain={CHAIN} options={{ fetch: under }} />
      </StoreProvider>,
    );
    click(await calling(box, "Call MustVoteOnProposalSimple"));
    await vi.waitFor(() => {
      expect(under.mock.calls.some(([url]) => url.startsWith(CHAIN.indexer))).toBe(true);
    });
  });

  it("gives two actions of one page a card each: a click on one opens that one's card only", async () => {
    const read = vi.fn<ChainFetch>(FUNCTIONS_ANSWER);
    const box = mount(
      <StoreProvider>
        <div data-test="first">
          <ActionForm action={VOTE} chain={CHAIN} options={{ fetch: read }} />
        </div>
        <div data-test="second">
          <ActionForm action={{ ...VOTE, args: { pid: "99", option: "NO" } }} chain={CHAIN} options={{ fetch: read }} />
        </div>
      </StoreProvider>,
    );
    const [first, second] = ['[data-test="first"]', '[data-test="second"]'].map((at) => one(box, at));
    click(await calling(first ?? box, "Call MustVoteOnProposalSimple"));
    expect(all(second ?? box, "article")).toHaveLength(0);
    expect(inputs(first ?? box).map((i) => i.value)).toEqual(["15", "YES"]);
  });
});

// 9e-1 (Alexis): a team's pinned action in the chat's quick actions bar is one pill under its label, beside Who's here; the card it
// opens is the bar's own (`bar.card`), drawn where the bar puts it. A call of more than two fields is a link to the realm view.
describe("a pinned action in the quick actions bar", () => {
  const PLACE = { realm: DAO, chain: CHAIN };
  function inBar(action: Action, under = vi.fn<ChainFetch>(FUNCTIONS_ANSWER), viewHref?: string) {
    return mount(
      <MemoryRouter>
        <StoreProvider>
          <div data-test="cards">
            <InlineCard id="pinned 0" place={PLACE} />
          </div>
          <div data-test="bar">
            <ActionForm
              action={action}
              label="Vote"
              chain={CHAIN}
              options={{ fetch: under }}
              {...(viewHref === undefined ? {} : { viewHref })}
              bar={{ card: "pinned 0" }}
            />
          </div>
        </StoreProvider>
      </MemoryRouter>,
    );
  }

  it("is one button under its label, and no form, why or card of its own", async () => {
    const box = inBar(VOTE);
    const pill = await calling(box, "Vote");
    const bar = one(box, '[data-test="bar"]');
    expect(pill.getAttribute("type")).toBe("button");
    expect([...bar.children]).toEqual([pill]);
    expect(all(box, "figure, form, article, input")).toHaveLength(0);
  });

  it("opens the bar's card, prefilled, naming the realm and the function the data says", async () => {
    const box = inBar(VOTE);
    click(await calling(box, "Vote"));
    const card = one(one(box, '[data-test="cards"]'), "article");
    expect(inputs(card).map((i) => i.value)).toEqual(["15", "YES"]);
    expect(card.textContent).toContain(DAO);
    expect(card.textContent).toContain("MustVoteOnProposalSimple");
  });

  it("is a link to the realm view under its label for a call of more than two fields, opening no card", async () => {
    const wide = () =>
      listing([
        {
          FuncName: "Grant",
          Params: [CUR, field("a", "string"), field("b", "string"), field("c", "string")],
          Results: null,
        },
      ]);
    const box = inBar({ realm: DAO, function: "Grant", args: {} }, vi.fn<ChainFetch>(wide), "/r/gov/dao");
    await vi.waitFor(() => {
      expect(all(box, "a").map((a) => [a.textContent, a.getAttribute("href")])).toEqual([["Vote", "/r/gov/dao"]]);
    });
    expect(all(box, "button, article")).toHaveLength(0);
  });

  it.each([
    ["a function qfuncs does not list", { ...VOTE, function: "Drain" }, FUNCTIONS_ANSWER],
    ["an argument that is no parameter", { ...VOTE, args: { nope: "1" } }, FUNCTIONS_ANSWER],
    ["a type a call does not carry", { ...VOTE, function: "Configure", args: {} }, FUNCTIONS_ANSWER],
    ["qfuncs down", VOTE, () => Promise.resolve(new Response("down", { status: 503 }))],
  ])("draws no pill for %s", async (_name, action, read) => {
    const under = vi.fn<ChainFetch>(read);
    const box = inBar(action, under);
    const sibling = mount(
      <StoreProvider>
        <ActionForm
          action={VOTE}
          chain={CHAIN}
          options={{ fetch: vi.fn<ChainFetch>(() => after(under, FUNCTIONS_ANSWER)) }}
        />
      </StoreProvider>,
    );
    await calling(sibling, "Call MustVoteOnProposalSimple");
    expect(one(box, '[data-test="bar"]').childElementCount).toBe(0);
  });
});
