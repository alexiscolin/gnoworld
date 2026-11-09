// @vitest-environment jsdom
import { page, type PageBlock } from "@gnoworld/core";
import type { ChainFetch } from "@gnoworld/chain/read";
import { describe, expect, it, vi } from "vitest";
import { StoreProvider } from "../../storeContext.tsx";
import { all, button, click, follows, mount, one } from "../../../tests/mount.tsx";
import {
  after,
  calling,
  CHAIN,
  CUR,
  field,
  inputs,
  listing,
  typed,
  warnsMembers,
} from "../../../tests/callFixtures.ts";
import { drawing } from "../chat/index.ts";
import { CallableForm } from "./CallableForm.tsx";
import { DRAW_LIMIT, RealmBlocks } from "./RealmBlocks.tsx";

// 9e: a page's `<gno-form exec="Func">` is a Form block whose "Call" opens the call card prefilled from the form, every field
// visible and editable, a hidden one too (it shows as the form says it is). A function or a type vm/qfuncs does not confirm, or a
// field the function has no parameter for, leaves the read-only form and no Call. NOT recorded: qfuncs' shape.
const via = await drawing();
const REALM = "gno.land/r/demo/profile";
const FUNCTIONS = [
  { FuncName: "SetProfile", Params: [CUR, field("name", "string"), field("times", "int64")], Results: null },
  { FuncName: "Configure", Params: [CUR, field("settings", "map[string]string")], Results: null },
  { FuncName: "TotalSupply", Params: null, Results: [field(".res.0", "int64")] },
  { FuncName: "Anon", Params: [CUR, field("", "string")], Results: null },
];

const answer = () => listing(FUNCTIONS);
const blocksOf = (source: string): readonly PageBlock[] => {
  const read = page(source, { origin: CHAIN.gnoweb });
  if (read.kind !== "page") throw new Error("too big");
  return read.blocks;
};

/** The page `source` drawn with a Call possible, and a sibling page whose Call shows when everything has been read and drawn: the
 * box of the form under test is `figure`'s parent, and a negative is asserted only after the sibling's Call appeared. */
async function form(source: string, read: () => Promise<Response> = answer) {
  const under = vi.fn<ChainFetch>(read);
  const sibling = vi.fn<ChainFetch>(() => after(under, answer));
  const box = mount(
    <StoreProvider>
      <div data-test="under">
        <RealmBlocks
          via={via}
          origin={CHAIN.gnoweb}
          blocks={blocksOf(source)}
          call={{ realm: REALM, chain: CHAIN, options: { fetch: under } }}
        />
      </div>
      <div data-test="sibling">
        <RealmBlocks
          via={via}
          origin={CHAIN.gnoweb}
          blocks={blocksOf(gnoForm("SetProfile", input("name")))}
          call={{ realm: REALM, chain: CHAIN, options: { fetch: sibling } }}
        />
      </div>
    </StoreProvider>,
  );
  await vi.waitFor(() => {
    expect(button(one(box, '[data-test="sibling"]'), "Call SetProfile")).toBeDefined();
  });
  return one(box, '[data-test="under"]');
}
// The call card is the form's next sibling; the page's blocks sit in an article of their own now (RealmBlocks).
const CARD = "figure + article";
const gnoForm = (exec: string, ...fields: string[]) => `<gno-form exec="${exec}">\n${fields.join("\n")}\n</gno-form>`;
const input = (name: string, extra = "", type = "text") => `<gno-input name="${name}" type="${type}" ${extra}/>`;

describe("a page's gno-form as a Form block with a Call", () => {
  it("opens the card prefilled from the form, under the form itself, never a dialog", async () => {
    const box = await form(gnoForm("SetProfile", input("name", 'value="bob" '), input("times", 'value="3" ')));
    const caller = await calling(box, "Call SetProfile");
    click(caller);
    const card = one(box, CARD);
    expect(follows(caller, card)).toBe(true);
    // After the form's frame, not inside it: a frame of its own and the column's width, its values in the card's own type.
    expect(one(box, "figure").contains(card)).toBe(false);
    expect(one(box, "figure").nextElementSibling).toBe(card);
    expect(inputs(card).map((i) => i.value)).toEqual(["bob", "3"]);
    expect(card.textContent).toContain(REALM);
    expect(all(box, "dialog, [role=dialog], [aria-modal]")).toHaveLength(0);
  });

  it("keeps what was typed in the open card when its Call is clicked again", async () => {
    const box = await form(gnoForm("SetProfile", input("name", 'value="bob" '), input("times", 'value="3" ')));
    const caller = await calling(box, "Call SetProfile");
    click(caller);
    typed(inputs(one(box, CARD))[1], "9");
    click(caller);
    expect(inputs(one(box, CARD)).map((i) => i.value)).toEqual(["bob", "9"]);
  });

  it("shows a hidden field in the card as a field to read and edit, and the form still says it is hidden", async () => {
    const box = await form(
      gnoForm("SetProfile", input("name", 'value="g1attacker" ', "hidden"), input("times", 'value="3" ')),
    );
    click(await calling(box, "Call SetProfile"));
    const [name] = inputs(one(box, CARD));
    expect(name?.value).toBe("g1attacker");
    expect(name?.type).not.toBe("hidden");
    expect(one(box, "figure").textContent).toContain("hidden");
  });

  it("prefills a textarea and a select as it does an input", async () => {
    const box = await form(
      gnoForm(
        "SetProfile",
        '<gno-textarea name="name" value="a bio" />',
        '<gno-select name="times" value="7" description="how often" />',
      ),
    );
    click(await calling(box, "Call SetProfile"));
    expect(inputs(one(box, CARD)).map((i) => i.value)).toEqual(["a bio", "7"]);
  });

  it("leaves a parameter the form does not name empty, to fill in", async () => {
    const box = await form(gnoForm("SetProfile", input("name", 'value="bob" ')));
    click(await calling(box, "Call SetProfile"));
    expect(inputs(one(box, CARD)).map((i) => i.value)).toEqual(["bob", ""]);
  });

  it("sets its Call at the end of its line at its own width, worded Call for the function, as a write row's", async () => {
    const box = await form(gnoForm("SetProfile", input("name"), input("times")));
    const caller = await calling(box, "Call SetProfile");
    expect(caller.firstChild?.textContent).toBe("Call");
    expect(caller.querySelector(".visually-hidden")?.textContent).toBe(" SetProfile");
    expect(caller.parentElement?.getAttribute("data-justify")).toBe("end");
  });

  it("is no longer worded as one that sends nothing once it can call", async () => {
    const box = await form(gnoForm("SetProfile", input("name"), input("times")));
    await calling(box, "Call SetProfile");
    expect(one(box, "figure").textContent).not.toContain("nothing here sends anything");
  });

  it("gives two forms of one function a card each, with its own form's texts: the second's Call never shows the first's", async () => {
    const box = await form(
      `${gnoForm("SetProfile", input("name", 'value="benign" '))}\n\n${gnoForm("SetProfile", input("name", 'value="hostile" '))}`,
    );
    const [first = box, second = box] = all(box, "figure");
    // A form's card is the element after its figure, when that is one.
    const cardOf = (figure: Element) => {
      const next = figure.nextElementSibling;
      return next?.matches("article") === true ? inputs(next).map((i) => i.value) : [];
    };
    await calling(second, "Call SetProfile");
    click(button(second, "Call SetProfile"));
    expect(cardOf(first)).toEqual([]);
    expect(cardOf(second)).toEqual(["hostile", ""]);
    click(button(first, "Call SetProfile"));
    expect(cardOf(first)).toEqual(["benign", ""]);
    expect(cardOf(second)).toEqual(["hostile", ""]);
  });

  it("keeps the prefilled text's problem, with the Sign button disabled: a form's value the type refuses is not signed", async () => {
    const box = await form(gnoForm("SetProfile", input("name", 'value="bob" '), input("times", 'value="1e3" ')));
    click(await calling(box, "Call SetProfile"));
    const card = one(box, CARD);
    expect(card.textContent).toMatch(/not in the form the field takes/);
    expect(button(card, "Sign in Adena")?.hasAttribute("disabled")).toBe(true);
  });

  it.each([
    ["a function qfuncs does not list", gnoForm("Drain", input("amount"))],
    ["a read function", gnoForm("TotalSupply")],
    ["a type a call does not carry", gnoForm("Configure", input("settings"))],
    ["a field that is no parameter of the function", gnoForm("SetProfile", input("name"), input("to", 'value="g1x" '))],
    ["a line that is no field", gnoForm("SetProfile", input("name"), "<script>x</script>")],
    ["no function", `<gno-form>\n${input("name")}\n</gno-form>`],
    ["a name with a trailing space", gnoForm("SetProfile ", input("name"))],
    ["a name in another case", gnoForm("setprofile", input("name"))],
    [
      "a path, the realm gnoweb would send it to",
      `<gno-form exec="SetProfile" path="/r/evil/x">\n${input("name")}\n</gno-form>`,
    ],
    [
      "two fields of one name, one of them hidden",
      gnoForm("SetProfile", input("name", 'value="a" '), input("name", 'value="b" ', "hidden")),
    ],
    ["a field with no name", gnoForm("SetProfile", '<gno-input type="text" value="x" />')],
    ["a field with no name, for a parameter with none", gnoForm("Anon", '<gno-input type="text" value="x" />')],
  ])("shows %s as the read-only form, with no Call", async (_name, source) => {
    const box = await form(source);
    expect(all(box, "button")).toHaveLength(0);
    expect(all(box, CARD)).toHaveLength(0);
    expect(one(box, "figure").textContent).toContain("read only");
  });

  it("shows a form cut by the draw limit as the read-only one, since a hidden field may be among those left out", async () => {
    const fields = Array.from({ length: DRAW_LIMIT + 5 }, (_, at) => input(at === 0 ? "name" : `f${String(at)}`));
    const box = await form(gnoForm("SetProfile", ...fields));
    expect(all(box, "button")).toHaveLength(0);
    expect(one(box, "figure").textContent).toContain("read only");
    expect(one(box, "[data-left]").textContent).toContain("hidden");
  });

  it.each([
    ["is down", () => Promise.resolve(new Response("down", { status: 503 }))],
    ["fails", () => Promise.reject(new Error("offline"))],
  ])("shows the read-only form, with no Call, when vm/qfuncs %s", async (_name, read) => {
    const box = await form(gnoForm("SetProfile", input("name")), read);
    expect(all(box, "button")).toHaveLength(0);
    expect(one(box, "figure").textContent).toContain("read only");
  });
});

describe("a form whose drawing left fields out", () => {
  const input = (name: string) => ({
    tag: "input" as const,
    name,
    inputType: "",
    value: "",
    placeholder: "",
    description: "",
    flags: "",
  });
  it("is the read-only form with no Call though what is drawn fits the function: a hidden field may be among those left out", async () => {
    const under = vi.fn<ChainFetch>(answer);
    const sibling = vi.fn<ChainFetch>(() => after(under, answer));
    const at = (fetch: ChainFetch, left: number) => (
      <CallableForm
        exec="SetProfile"
        path=""
        left={left}
        fields={[input("name"), input("times")]}
        call={{ realm: REALM, chain: CHAIN, options: { fetch } }}
      />
    );
    const box = mount(
      <StoreProvider>
        <div data-test="under">{at(under, 1)}</div>
        <div data-test="sibling">{at(sibling, 0)}</div>
      </StoreProvider>,
    );
    await vi.waitFor(() => {
      expect(button(one(box, '[data-test="sibling"]'), "Call SetProfile")).toBeDefined();
    });
    expect(all(one(box, '[data-test="under"]'), "button")).toHaveLength(0);
  });
});

describe("a form's card among a page's headings", () => {
  const FORM = gnoForm("SetProfile", input("name"), input("times"));
  it.each([
    ["", "H2"],
    ["# Profile\n\n", "H2"],
    ["## Profile\n\n", "H3"],
    ["### Profile\n\n", "H4"],
    ["###### Profile\n\n", "H4"],
  ])(
    "titles the card one level under the heading before its form (%j), so no level is skipped: %s",
    async (before, level) => {
      const box = await form(`${before}${FORM}`);
      click(await calling(box, "Call SetProfile"));
      expect(one(one(box, CARD), "h2, h3, h4").tagName).toBe(level);
    },
  );
});

// Alexis (D272): a page's form that votes on GovDAO opens the vote's card, which says before Adena opens that only its members can vote.
describe("a GovDAO page's vote form", () => {
  it("opens the vote's card saying that only GovDAO's members can vote, before Sign in Adena", async () => {
    const vote = [
      {
        FuncName: "MustVoteOnProposalSimple",
        Params: [CUR, field("pid", "int64"), field("option", "string")],
        Results: null,
      },
    ];
    const box = mount(
      <StoreProvider>
        <RealmBlocks
          via={via}
          origin={CHAIN.gnoweb}
          blocks={blocksOf(gnoForm("MustVoteOnProposalSimple", input("pid"), input("option")))}
          call={{
            realm: "gno.land/r/gov/dao",
            chain: CHAIN,
            options: { fetch: vi.fn<ChainFetch>(() => listing(vote)) },
          }}
        />
      </StoreProvider>,
    );
    click(await calling(box, "Call MustVoteOnProposalSimple"));
    warnsMembers(one(box, CARD));
  });
});
