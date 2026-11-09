// @vitest-environment jsdom
import fc from "fast-check";
import { act, useState } from "react";
import { describe, expect, test, vi } from "vitest";
import { EVALS, FUNCTIONS, REFUSALS, WUGNOT } from "../../../tests/chain/chainFixture.ts";
import { queryEnvelope, rpcErrorEnvelope, statusEnvelope } from "@gnoworld/chain/testing/envelopes";
import { all, button, click, mount, nth, one } from "../../../tests/mount.tsx";
import type { ChainFetch } from "@gnoworld/chain/read";
import { RealmFunctions } from "./RealmFunctions.tsx";

// 5i, tier 1 (it feeds `vm/qeval`): a realm's parameterless read functions, listed from `vm/qfuncs`, each a button that reads
// its result once through `vm/qeval`. Free: the label says so, the block height says when, and Adena is never asked.
// The answers are chainFixture.ts's: EVALS recorded through gnomcp, FUNCTIONS written from wugnot's source (not recorded).
const CHAIN = {
  name: "Onyx",
  chainId: "onyx-1",
  rpc: "https://rpc.onyx.testnets.gno.land:443",
  gnoweb: "https://onyx.testnets.gno.land",
  indexer: "https://indexer.onyx.testnets.gno.land/graphql/query",
};
const SUPPLY = EVALS.find((row) => row.chain === "onyx-1" && row.expr === "TotalSupply()")?.body ?? "";
const NON_ORIGIN = REFUSALS.find((row) => row.chain === "onyx-1" && row.data.endsWith(".Deposit()"));
const LABEL = "read on chain, free, no signature";

const dataOf = (url: string): string => {
  const hex = new URL(url).searchParams.get("data")?.slice(2) ?? "";
  return decodeURIComponent(hex.replace(/(..)/g, "%$1"));
};
const queryOf = (url: string): string => new URL(url).searchParams.get("path")?.replaceAll('"', "") ?? "";

interface Chain {
  functions?: unknown;
  /** What `vm/qfuncs` gives for a realm, when the list depends on it or comes late. */
  list?: (realm: string) => Promise<Response>;
  /** What `vm/qeval` gives, by the name called; a name not here is refused as not declared. */
  evals?: Record<string, string>;
  status?: boolean;
  eval?: (url: string) => Promise<Response>;
}
// A fetch that answers as the chain does: /status, then qfuncs, then qeval by the call it was sent.
function chain({
  functions = FUNCTIONS,
  evals = { TotalSupply: SUPPLY },
  status = true,
  eval: custom,
  list,
}: Chain = {}) {
  return vi.fn<ChainFetch>((url) => {
    const json = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body)));
    if (url.includes("/status")) {
      return json(status ? statusEnvelope(786661, "2026-10-30T23:43:10Z") : rpcErrorEnvelope("down"));
    }
    if (queryOf(url) === "vm/qfuncs") {
      return list === undefined ? json(queryEnvelope({ data: JSON.stringify(functions) })) : list(dataOf(url));
    }
    if (custom !== undefined) return custom(url);
    const name = /\.([A-Za-z0-9_]+)\(\)$/.exec(dataOf(url))?.[1] ?? "";
    const body = evals[name];
    return json(
      body === undefined
        ? queryEnvelope({ data: null, error: { "@type": "/abci.StringError", value: "name not declared" } })
        : queryEnvelope({ data: body }),
    );
  });
}
const asked = (fetcher: ReturnType<typeof chain>, query: string): string[] =>
  fetcher.mock.calls.map(([url]) => url).filter((url) => queryOf(url) === query);

async function settle(box: HTMLElement, until: () => boolean = () => box.querySelector("[aria-busy]") === null) {
  for (let turn = 0; turn < 200 && !until(); turn += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
    });
  }
  // Out of turns is a failure to say so, not a silent return that lets the next line fail for another reason (review of 5i, row 8).
  if (!until()) throw new Error("settle: the page did not reach the state asked for");
}
async function panel(fetcher: ChainFetch, realm = WUGNOT, extra: { maxBytes?: number; chain?: typeof CHAIN } = {}) {
  const { chain: where = CHAIN, ...options } = extra;
  const box = mount(<RealmFunctions realm={realm} chain={where} options={{ fetch: fetcher, ...options }} />);
  await settle(box);
  return box;
}
function type(input: HTMLElement, text: string) {
  act(() => {
    // React tracks a controlled input's value: the prototype's own setter is what its onChange hears.
    const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    Reflect.apply(Reflect.get(descriptor ?? {}, "set") as (value: string) => void, input, [text]);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
// The functions listed, by name: each has a "Read" button labelled "Read <name>".
const listed = (box: HTMLElement): string[] =>
  all(region(box), "button").flatMap((b) => {
    const label = b.textContent;
    return label.startsWith("Read ") ? [label.slice(5)] : [];
  });
const hrefs = (box: HTMLElement) => all(region(box), "a").map((a) => a.getAttribute("href"));
const region = (box: HTMLElement) => one(box, '[aria-label="Read functions"]');
const answered = (list: unknown) =>
  Promise.resolve(new Response(JSON.stringify(queryEnvelope({ data: JSON.stringify(list) }))));
const urlsOf = (fetcher: ReturnType<typeof chain>): string[] => fetcher.mock.calls.map(([url]) => url);

// A chain whose height waits: each /status asked is held in `heights`, block 1001 then 1002, and sent when its entry is called.
function slowHeight() {
  const heights: (() => void)[] = [];
  const inner = chain();
  const fetcher = vi.fn<ChainFetch>((url, init) =>
    url.includes("/status")
      ? new Promise<Response>((resolve) => {
          const at = 1001 + heights.length;
          heights.push(() => {
            resolve(new Response(JSON.stringify(statusEnvelope(at, "2026-10-30T23:43:10Z"))));
          });
        })
      : inner(url, init),
  );
  return { fetcher, heights };
}

describe("a realm's read functions", () => {
  test("lists the functions that take nothing and give something, each a button, and no write function", async () => {
    const box = await panel(chain());
    const names = listed(box);
    expect(names).toEqual(["TotalSupply"]);
    // Deposit, Withdraw and the others are not run from here; the panel draws no link: the plate's out-links hold gnoweb's (OutLinks).
    expect(region(box).textContent).not.toContain("Withdraw");
    expect(hrefs(box)).toEqual([]);
    expect(all(box, "form, input")).toHaveLength(0);
  });

  test("asks the chain for the list once, and for no result before a click", async () => {
    vi.useFakeTimers();
    const fetcher = chain();
    mount(<RealmFunctions realm={WUGNOT} chain={CHAIN} options={{ fetch: fetcher }} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    vi.useRealTimers();
    expect(asked(fetcher, "vm/qfuncs")).toHaveLength(1);
    expect(asked(fetcher, "vm/qeval")).toHaveLength(0);
    // The total, not only the two reads named: a height polled, or any other request, is one too many.
    expect(urlsOf(fetcher)).toHaveLength(1);
  });

  test("reads one call on a click, shows the recorded result with its label and the height, and nothing again", async () => {
    vi.useFakeTimers();
    const fetcher = chain();
    const box = mount(<RealmFunctions realm={WUGNOT} chain={CHAIN} options={{ fetch: fetcher }} />);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(50);
    });
    click(button(box, "Read TotalSupply"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });
    vi.useRealTimers();
    const evals = asked(fetcher, "vm/qeval");
    expect(evals.map(dataOf)).toEqual([`${WUGNOT}.TotalSupply()`]);
    expect(region(box).textContent).toContain(SUPPLY);
    expect(region(box).textContent).toContain(LABEL);
    expect(region(box).textContent).toContain("block 786,661");
    // Nothing polls: a minute later it is still the one list, the one read and the one height that read was stamped with.
    expect(asked(fetcher, "vm/qeval")).toHaveLength(1);
    expect(urlsOf(fetcher).filter((url) => url.includes("/status"))).toHaveLength(1);
    expect(urlsOf(fetcher)).toHaveLength(3);
  });

  test("a second click is a second read, one request a click", async () => {
    const fetcher = chain();
    const box = await panel(fetcher);
    for (const times of [1, 2, 3]) {
      click(button(box, "Read TotalSupply"));
      await settle(box, () => asked(fetcher, "vm/qeval").length >= times && box.querySelector("[aria-busy]") === null);
      expect(asked(fetcher, "vm/qeval")).toHaveLength(times);
      // A click is a read and its height: the list is never asked again.
      expect(urlsOf(fetcher)).toHaveLength(1 + 2 * times);
    }
  });

  test("never touches Adena or asks for a signature, whatever is clicked", async () => {
    const touched: string[] = [];
    const adena = new Proxy(
      {},
      {
        get(_target, key) {
          touched.push(String(key));
          return () => Promise.reject(new Error("no wallet here"));
        },
      },
    );
    Object.defineProperty(window, "adena", { value: adena, configurable: true });
    try {
      const box = await panel(chain());
      click(button(box, "Read TotalSupply"));
      await settle(box, () => region(box).textContent.includes(LABEL));
      expect(touched).toEqual([]);
      expect(box.textContent.toLowerCase()).not.toMatch(/adena|sign in|connect wallet/);
      expect(all(box, '[role="dialog"], dialog')).toHaveLength(0);
    } finally {
      Reflect.deleteProperty(window, "adena");
    }
  });

  test("shows the result as text, whatever the realm answers", async () => {
    const hostile = '<script>window.hacked=1</script><img src=x onerror="window.hacked=2">';
    const box = await panel(chain({ evals: { TotalSupply: hostile } }));
    click(button(box, "Read TotalSupply"));
    await settle(box, () => region(box).textContent.includes(LABEL));
    expect(region(box).textContent).toContain(hostile);
    expect(all(box, "script, img")).toHaveLength(0);
  });

  test("shows the height's failure beside the result, which still stands", async () => {
    const box = await panel(chain({ status: false }));
    click(button(box, "Read TotalSupply"));
    await settle(box, () => region(box).textContent.includes(LABEL));
    expect(region(box).textContent).toContain(SUPPLY);
    expect(region(box).textContent).toContain("block height could not be read");
  });

  test("draws each function as a row: its name as the title, a Read button after it", async () => {
    const box = await panel(chain());
    const item = one(region(box), "li");
    const control = one(item, "button");
    // Its visible word is "Read"; the function's name, hidden from the eye, completes the name a screen reader says.
    expect(control.textContent).toBe("Read TotalSupply");
    expect(one(control, ".visually-hidden").textContent).toBe(" TotalSupply");
    expect(item.textContent).toContain("TotalSupply");
    expect(item.textContent.startsWith("TotalSupply")).toBe(true);
  });

  test("keeps a long result reachable by keyboard: a focusable region with a name", async () => {
    const long = Array.from({ length: 200 }, (_, i) => `line ${String(i)}`).join("\n");
    const box = await panel(chain({ evals: { TotalSupply: long } }));
    click(button(box, "Read TotalSupply"));
    await settle(box, () => region(box).textContent.includes(LABEL));
    const result = one(region(box), "pre");
    expect(result.getAttribute("tabindex")).toBe("0");
    expect(result.getAttribute("role")).toBe("region");
    expect(result.getAttribute("aria-label")).toBe("Result of TotalSupply");
  });

  test("shows the text at once and the height after, when the height is slow", async () => {
    const { fetcher } = slowHeight();
    const box = await panel(fetcher);
    click(button(box, "Read TotalSupply"));
    await settle(box, () => region(box).textContent.includes(SUPPLY));
    expect(region(box).textContent).toContain(SUPPLY);
    expect(region(box).textContent).toContain(LABEL);
    expect(region(box).textContent).not.toContain("block");
    expect(button(box, "Read TotalSupply")?.getAttribute("aria-busy")).not.toBe("true");
  });

  test("a height that comes after a second click does not stamp the second read", async () => {
    const { fetcher, heights } = slowHeight();
    const box = await panel(fetcher);
    click(button(box, "Read TotalSupply"));
    await settle(box, () => region(box).textContent.includes(SUPPLY));
    click(button(box, "Read TotalSupply"));
    await settle(box, () => heights.length === 2 && region(box).textContent.includes(SUPPLY));
    await act(async () => {
      heights[0]?.();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(region(box).textContent).not.toContain("block 1,002");
    expect(region(box).textContent).not.toContain("block 1,001");
    await act(async () => {
      heights[1]?.();
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
    expect(region(box).textContent).toContain("block 1,002");
  });
});

describe("a read that fails", () => {
  test("shows the chain's refusal as a state with its next step", async () => {
    const box = await panel(
      chain({
        functions: [{ FuncName: "Deposit", Params: null, Results: [{ Name: ".res.0", Type: "int64", Value: "" }] }],
        eval: () =>
          Promise.resolve(
            new Response(
              JSON.stringify(
                queryEnvelope({
                  data: null,
                  error: { "@type": NON_ORIGIN?.error ?? "", value: NON_ORIGIN?.text ?? "" },
                }),
              ),
            ),
          ),
      }),
    );
    click(button(box, "Read Deposit"));
    await settle(box, () => region(box).querySelector('[role="status"]') !== null);
    const state = one(region(box), '[role="status"]');
    expect(state.textContent).toContain("The chain refused this read");
    expect(state.textContent).not.toContain("invalid non-origin call");
    expect(region(box).textContent).not.toContain(LABEL);
    expect(hrefs(box)).toEqual([]);
    // The other functions stay usable: the button is still there to try again.
    expect(button(box, "Read Deposit")?.hasAttribute("disabled")).toBe(false);
  });

  test("shows a huge answer as too large, without any part of it", async () => {
    const box = await panel(chain({ evals: { TotalSupply: `SECRET${"x".repeat(2_000_000)}` } }));
    click(button(box, "Read TotalSupply"));
    await settle(box, () => region(box).querySelector('[role="status"]') !== null);
    expect(region(box).textContent).toContain("larger than this page reads");
    expect(region(box).textContent).not.toContain("SECRET");
    expect(region(box).textContent).not.toContain(LABEL);
  });

  test.each([
    ["the browser cannot reach the RPC at all (F2841)", () => Promise.reject(new TypeError("Failed to fetch"))],
    [
      "the chain says the realm is not there",
      () =>
        Promise.resolve(
          new Response(JSON.stringify(queryEnvelope({ data: null, error: { "@type": "/vm.InvalidPkgPathError" } }))),
        ),
    ],
  ])("shows a state, not a blank, and no link of its own, when %s", async (_name, answer) => {
    const box = await panel(vi.fn<ChainFetch>(answer));
    expect(one(region(box), '[role="status"]').textContent).toMatch(/\S/);
    expect(all(region(box), "button")).toHaveLength(0);
    expect(hrefs(box)).toEqual([]);
  });

  test("says so, and offers no button, when the realm has no function to read", async () => {
    const box = await panel(chain({ functions: [FUNCTIONS[0]] }));
    expect(all(region(box), "button")).toHaveLength(0);
    expect(region(box).textContent).toContain("no function to read here");
    expect(hrefs(box)).toEqual([]);
  });
});

const READS = [{ Name: ".res.0", Type: "int64", Value: "" }];
const reader = (FuncName: string) => ({ FuncName, Params: null, Results: READS });

describe("a name from qfuncs", () => {
  const HOSTILE = [
    "TotalSupply()); Render(",
    "Foo.Bar",
    "Foo()",
    '(Foo)("x")',
    "_helper",
    "foo",
    "A b",
    "A\n",
    "A;B",
    "",
    "1A",
  ];

  test("is kept only as one exported identifier: the rest is never listed and never asked", async () => {
    const fetcher = chain({ functions: [...HOSTILE, "TotalSupply", "IsEnabled"].map(reader) });
    const box = await panel(fetcher);
    expect(listed(box)).toEqual(["TotalSupply", "IsEnabled"]);
    for (const b of all(region(box), "button")) click(b);
    await settle(box, () => asked(fetcher, "vm/qeval").length === 2);
    expect(asked(fetcher, "vm/qeval").map(dataOf).sort()).toEqual([`${WUGNOT}.IsEnabled()`, `${WUGNOT}.TotalSupply()`]);
  });

  // Narrower than Go on purpose: gno's own test looks at the first byte only (keeper.go:1780-1783 at v1.5.0), so `Foé` is one
  // identifier in Go and `Ａ` is cut by gno's byte test; evalCall.isExportedName keeps to ASCII, which the chain cannot read otherwise.
  test("keeps to ASCII, narrower than Go's identifiers, on purpose", async () => {
    const box = await panel(chain({ functions: ["Foé", "Ａ", "Total\u0131", "TotalSupply"].map(reader) }));
    expect(listed(box)).toEqual(["TotalSupply"]);
  });

  test("keeps a name up to 128 characters and refuses a longer one, which would be a request of its own size", async () => {
    const edge = `A${"b".repeat(127)}`;
    const box = await panel(
      chain({ functions: [edge, `${edge}c`, `A${"b".repeat(10_000)}`, "TotalSupply"].map(reader) }),
    );
    expect(listed(box)).toEqual([edge, "TotalSupply"]);
  });

  test("shows a hostile name's absence, not its text", async () => {
    const box = await panel(chain({ functions: [...HOSTILE, "TotalSupply"].map(reader) }));
    expect(region(box).textContent).not.toContain("Render(");
    expect(region(box).textContent).not.toContain("Foo.Bar");
    expect(all(box, "script, img")).toHaveLength(0);
  });

  // gno's parser cuts a query's data at the first dot after the first slash (handler.go:289 at v1.5.0).
  function cut(data: string): { pkgPath: string; expr: string } | null {
    const slash = data.indexOf("/");
    const rest = data.slice(slash);
    const dot = rest.indexOf(".");
    return dot < 0 ? null : { pkgPath: data.slice(0, slash) + rest.slice(0, dot), expr: rest.slice(dot + 1) };
  }

  test("property: any qfuncs answer gives, a click each, one call of one identifier or nothing", async () => {
    const pieces = fc.constantFrom(..."AbcZ09_é(). ;\"'\\\n/-+*Ａ".split(""));
    const names = fc.oneof(
      fc.array(pieces, { maxLength: 8 }).map((chars) => chars.join("")),
      fc.tuple(fc.constantFrom("A", "Total", "X"), fc.array(pieces, { maxLength: 4 })).map(([a, r]) => a + r.join("")),
    );
    const answers = fc.array(names, { minLength: 1, maxLength: 6 });
    let called = 0;
    await fc.assert(
      fc.asyncProperty(answers, async (list) => {
        const fetcher = chain({ functions: list.map(reader), evals: {} });
        const box = await panel(fetcher);
        const buttons = all(region(box), "button");
        for (const b of buttons) {
          expect(b.textContent).toMatch(/^Read [A-Z][A-Za-z0-9_]*$/);
          click(b);
        }
        await settle(box, () => asked(fetcher, "vm/qeval").length >= buttons.length);
        const calls = asked(fetcher, "vm/qeval").map(dataOf);
        expect(calls).toHaveLength(buttons.length);
        for (const call of calls) {
          called += 1;
          const parts = cut(call);
          expect(parts?.pkgPath).toBe(WUGNOT);
          expect(parts?.expr).toMatch(/^[A-Z][A-Za-z0-9_]*\(\)$/);
        }
        box.remove();
      }),
      { numRuns: 40 },
    );
    expect(called).toBeGreaterThan(0);
  });

  test("a realm path that is no realm's is never asked and lists nothing", async () => {
    const fetcher = chain();
    const box = await panel(fetcher, "gno.land/r/demo/x.y");
    expect(fetcher).not.toHaveBeenCalled();
    expect(all(region(box), "button")).toHaveLength(0);
  });
});

describe("a long list", () => {
  const MANY = Array.from({ length: 30 }, (_, i) => reader(`Get${String(i).padStart(2, "0")}Value`));
  const evals = Object.fromEntries(MANY.map(({ FuncName }) => [FuncName, `(${FuncName} string)`]));
  const field = (box: HTMLElement) => one(region(box), 'input[type="search"]');

  test("is searchable, and a short one is not", async () => {
    const long = await panel(chain({ functions: MANY, evals }));
    // A label element is the name; an id or a placeholder is not.
    const search = field(long);
    expect(search instanceof HTMLInputElement ? search.labels?.[0]?.textContent : undefined).toMatch(/function/i);
    expect(all(region(long), "button")).toHaveLength(30);
    const short = await panel(chain({ functions: MANY.slice(0, 3), evals }));
    expect(all(region(short), 'input[type="search"]')).toHaveLength(0);
  });

  test("finds a fragment from the middle of a name, not only its start", async () => {
    const box = await panel(chain({ functions: MANY, evals }));
    type(field(box), "et07V");
    expect(listed(box)).toEqual(["Get07Value"]);
    type(field(box), "Value");
    expect(all(region(box), "button")).toHaveLength(30);
  });

  test("offers the search from the eleventh function, not the tenth", async () => {
    const ten = await panel(chain({ functions: MANY.slice(0, 10), evals }));
    expect(all(region(ten), 'input[type="search"]')).toHaveLength(0);
    const eleven = await panel(chain({ functions: MANY.slice(0, 11), evals }));
    expect(all(region(eleven), 'input[type="search"]')).toHaveLength(1);
  });

  test("keeps the functions that match, any case, and says so when none does", async () => {
    const box = await panel(chain({ functions: MANY, evals }));
    type(field(box), "get07");
    expect(listed(box)).toEqual(["Get07Value"]);
    type(field(box), "nothing like it");
    expect(all(region(box), "button")).toHaveLength(0);
    expect(region(box).textContent).toContain("No function matches");
    type(field(box), "");
    expect(all(region(box), "button")).toHaveLength(30);
  });

  test("a click on a found function reads that one only", async () => {
    const fetcher = chain({ functions: MANY, evals });
    const box = await panel(fetcher);
    type(field(box), "Get12");
    click(nth(all(region(box), "button"), 0));
    await settle(box, () => region(box).textContent.includes(LABEL));
    expect(asked(fetcher, "vm/qeval").map(dataOf)).toEqual([`${WUGNOT}.Get12Value()`]);
    expect(region(box).textContent).toContain("(Get12Value string)");
  });
});

describe("a result belongs to its function", () => {
  const TWO = ["TotalSupply", "IsEnabled"].map(reader);
  const evals = { TotalSupply: "(111 int64)", IsEnabled: "(true bool)" };
  const row = (box: HTMLElement, name: string): HTMLElement => {
    const item = button(region(box), `Read ${name}`)?.closest("li");
    if (item === null || item === undefined) throw new Error(`no list item for ${name}`);
    return item;
  };

  test("sits in its own list item, with its label, and no other row holds it", async () => {
    const box = await panel(chain({ functions: TWO, evals }));
    click(button(box, "Read TotalSupply"));
    await settle(box, () => row(box, "TotalSupply").textContent.includes(LABEL));
    click(button(box, "Read IsEnabled"));
    await settle(box, () => row(box, "IsEnabled").textContent.includes(LABEL));
    expect(row(box, "TotalSupply").textContent).toContain("(111 int64)");
    expect(row(box, "TotalSupply").textContent).not.toContain("(true bool)");
    expect(row(box, "IsEnabled").textContent).toContain("(true bool)");
    expect(row(box, "IsEnabled").textContent).not.toContain("(111 int64)");
  });

  test("a refusal sits under its own function only, with no label, and the other row stands", async () => {
    const box = await panel(chain({ functions: TWO, evals: { IsEnabled: "(true bool)" } }));
    click(button(box, "Read IsEnabled"));
    await settle(box, () => row(box, "IsEnabled").textContent.includes(LABEL));
    click(button(box, "Read TotalSupply"));
    await settle(box, () => row(box, "TotalSupply").querySelector('[role="status"]') !== null);
    expect(row(box, "TotalSupply").textContent).not.toContain(LABEL);
    expect(row(box, "IsEnabled").querySelector('[role="status"]')).toBeNull();
    expect(row(box, "IsEnabled").textContent).toContain("(true bool)");
  });

  test("a retry after a refusal replaces the state with the result, and a refusal after a result leaves no stale value", async () => {
    const answers = { TotalSupply: undefined as string | undefined };
    const fetcher = chain({
      functions: TWO,
      eval: () =>
        Promise.resolve(
          new Response(
            JSON.stringify(
              answers.TotalSupply === undefined
                ? queryEnvelope({ data: null, error: { "@type": "/abci.StringError", value: "x" } })
                : queryEnvelope({ data: answers.TotalSupply }),
            ),
          ),
        ),
    });
    const box = await panel(fetcher);
    click(button(box, "Read TotalSupply"));
    await settle(box, () => row(box, "TotalSupply").querySelector('[role="status"]') !== null);
    answers.TotalSupply = "(222 int64)";
    click(button(box, "Read TotalSupply"));
    await settle(box, () => row(box, "TotalSupply").textContent.includes(LABEL));
    expect(row(box, "TotalSupply").querySelector('[role="status"]')).toBeNull();
    expect(row(box, "TotalSupply").textContent).toContain("(222 int64)");
    answers.TotalSupply = undefined;
    click(button(box, "Read TotalSupply"));
    await settle(box, () => row(box, "TotalSupply").querySelector('[role="status"]') !== null);
    expect(row(box, "TotalSupply").textContent).not.toContain("(222 int64)");
    expect(row(box, "TotalSupply").textContent).not.toContain(LABEL);
  });
});

describe("another realm or another chain", () => {
  const OTHER = "gno.land/r/demo/other";
  const MOVES = {
    other: { realm: OTHER, where: CHAIN },
    chain: { realm: WUGNOT, where: { ...CHAIN, chainId: "nowhere-1", gnoweb: "https://gnoweb.nowhere.example" } },
    rpc: { realm: WUGNOT, where: { ...CHAIN, rpc: "https://rpc2.onyx.testnets.gno.land:443" } },
  };
  // `options` is stable, as a page's is: an inline object re-runs the list's effect and hides a missing key (review of 5i, row 2).
  function Swap({ fetcher }: { fetcher: ChainFetch }) {
    const [at, setAt] = useState({ realm: WUGNOT, where: CHAIN });
    const [options] = useState({ fetch: fetcher });
    return (
      <>
        {(["other", "chain", "rpc"] as const).map((move) => (
          <button
            key={move}
            type="button"
            onClick={() => {
              setAt(MOVES[move]);
            }}
          >
            {`to ${move}`}
          </button>
        ))}
        <RealmFunctions realm={at.realm} chain={at.where} options={options} />
      </>
    );
  }
  // One read of TotalSupply, done: its result and label are on the page.
  const readSupply = async (box: HTMLElement) => {
    click(button(box, "Read TotalSupply"));
    await settle(box, () => region(box).textContent.includes(LABEL));
  };
  const lists = (realm: string) => answered([reader(realm === WUGNOT ? "TotalSupply" : "OtherName")]);

  test("lists the new realm's functions, asks again, and keeps nothing of the old realm", async () => {
    const fetcher = chain({ list: lists, evals: { TotalSupply: SUPPLY, OtherName: "(other string)" } });
    const box = mount(<Swap fetcher={fetcher} />);
    await settle(box);
    await readSupply(box);
    click(button(box, "to other"));
    await settle(box);
    expect(listed(box)).toEqual(["OtherName"]);
    expect(region(box).textContent).not.toContain(SUPPLY);
    expect(region(box).textContent).not.toContain(LABEL);
    expect(region(box).textContent).not.toContain("block 786,661");
    expect(asked(fetcher, "vm/qfuncs").map(dataOf)).toEqual([WUGNOT, OTHER]);
  });

  test("a read of the old realm that ends after the swap shows nowhere", async () => {
    let finish: () => void = () => undefined;
    const fetcher = chain({
      list: lists,
      eval: () =>
        new Promise((resolve) => {
          finish = () => {
            resolve(new Response(JSON.stringify(queryEnvelope({ data: "(late int64)" }))));
          };
        }),
    });
    const box = mount(<Swap fetcher={fetcher} />);
    await settle(box);
    click(button(box, "Read TotalSupply"));
    click(button(box, "to other"));
    await settle(box);
    await act(async () => {
      finish();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(box.textContent).not.toContain("(late int64)");
    expect(region(box).textContent).not.toContain(LABEL);
  });

  test("a slow list of the first realm, arriving after the second's, does not win", async () => {
    const slow: { done: () => void } = { done: () => undefined };
    const fetcher = chain({
      list: (realm) =>
        realm === WUGNOT
          ? new Promise((resolve) => {
              slow.done = () => {
                resolve(new Response(JSON.stringify(queryEnvelope({ data: JSON.stringify([reader("TotalSupply")]) }))));
              };
            })
          : answered([reader("OtherName")]),
    });
    const box = mount(<Swap fetcher={fetcher} />);
    click(button(box, "to other"));
    await settle(box);
    await act(async () => {
      slow.done();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(listed(box)).toEqual(["OtherName"]);
  });

  test("a gnoweb that is no https origin is not linked: the functions stay", async () => {
    const box = await panel(chain(), WUGNOT, { chain: { ...CHAIN, gnoweb: "http://gnoweb.other.example" } });
    expect(listed(box)).toEqual(["TotalSupply"]);
    expect(all(region(box), "a")).toHaveLength(0);
  });

  // The same function in both places, so only a new panel can clear its result: one test for each field of the key.
  for (const move of ["other", "chain", "rpc"] as const) {
    test(`a changed ${move} drops the old result, which the same function name would keep`, async () => {
      const fetcher = chain({ list: () => answered([reader("TotalSupply")]) });
      const box = mount(<Swap fetcher={fetcher} />);
      await settle(box);
      await readSupply(box);
      expect(region(box).textContent).toContain(SUPPLY);
      click(button(box, `to ${move}`));
      await settle(box);
      expect(region(box).textContent).not.toContain(SUPPLY);
      expect(region(box).textContent).not.toContain(LABEL);
      expect(listed(box)).toEqual(["TotalSupply"]);
      expect(asked(fetcher, "vm/qfuncs")).toHaveLength(2);
    });
  }

  test("a chain changed under the panel asks the list again, and draws no gnoweb link before or after", async () => {
    const fetcher = chain();
    const box = mount(<Swap fetcher={fetcher} />);
    await settle(box);
    expect(hrefs(box)).toEqual([]);
    click(button(box, "to chain"));
    await settle(box);
    expect(hrefs(box)).toEqual([]);
    expect(asked(fetcher, "vm/qfuncs")).toHaveLength(2);
  });
});

describe("while it reads", () => {
  test("is busy, with a name, until the list comes, and not after", async () => {
    const fetcher = vi.fn<ChainFetch>(() => new Promise<Response>(() => undefined));
    const box = mount(<RealmFunctions realm={WUGNOT} chain={CHAIN} options={{ fetch: fetcher, timeoutMs: 60_000 }} />);
    const busy = one(box, '[aria-busy="true"]');
    expect(busy.getAttribute("aria-label")).toMatch(/\S/);
    expect(all(region(box), "button")).toHaveLength(0);
    const done = await panel(chain());
    expect(done.querySelector("[aria-busy]")).toBeNull();
  });

  test("a click holds the button busy until the read ends, and a second click meanwhile asks nothing", async () => {
    let finish: () => void = () => undefined;
    const fetcher = chain({
      eval: () =>
        new Promise((resolve) => {
          finish = () => {
            resolve(new Response(JSON.stringify(queryEnvelope({ data: SUPPLY }))));
          };
        }),
    });
    const box = await panel(fetcher);
    click(button(box, "Read TotalSupply"));
    expect(button(box, "Read TotalSupply")?.getAttribute("aria-busy")).toBe("true");
    click(button(box, "Read TotalSupply"));
    expect(asked(fetcher, "vm/qeval")).toHaveLength(1);
    // Meanwhile no result is drawn, and no label.
    expect(all(region(box), "pre")).toHaveLength(0);
    expect(region(box).textContent).not.toContain(LABEL);
    await act(async () => {
      finish();
      await new Promise((resolve) => setTimeout(resolve, 20));
    });
    expect(region(box).textContent).toContain(LABEL);
    expect(one(region(box), "pre").getAttribute("dir")).toBe("ltr");
  });
});

describe("a list that grows with the universe", () => {
  const MANY = Array.from({ length: 6000 }, (_, i) => reader(`Get${String(i).padStart(4, "0")}Value`));

  test("draws a bounded number of buttons, a hundred, and shows more on request", async () => {
    const box = await panel(chain({ functions: MANY }));
    const names = () => all(region(box), "button").filter((b) => b.textContent.startsWith("Read Get"));
    expect(names()).toHaveLength(100);
    click(button(region(box), "Show more"));
    expect(names()).toHaveLength(200);
    expect(region(box).textContent).toMatch(/6,000/);
  });

  test("the search reaches past what is drawn, and its matches are bounded too", async () => {
    const box = await panel(chain({ functions: MANY, evals: { Get5999Value: "(last string)" } }));
    const field = one(region(box), 'input[type="search"]');
    type(field, "5999");
    expect(listed(box)).toEqual(["Get5999Value"]);
  });

  test("offers no more at exactly a hundred, and one more at a hundred and one", async () => {
    const at = async (count: number) => {
      const box = await panel(chain({ functions: MANY.slice(0, count) }));
      return button(region(box), "Show more");
    };
    expect(await at(100)).toBeUndefined();
    expect(await at(101)).toBeDefined();
  });

  test("a search starts again from a hundred, and ignores the spaces around it", async () => {
    const box = await panel(chain({ functions: MANY }));
    click(button(region(box), "Show more"));
    expect(listed(box)).toHaveLength(200);
    type(one(region(box), 'input[type="search"]'), " Get ");
    expect(listed(box)).toHaveLength(100);
    type(one(region(box), 'input[type="search"]'), " 5999 ");
    expect(listed(box)).toEqual(["Get5999Value"]);
  });

  test("a list past what the page reads is a state with its next step, no part of it drawn", async () => {
    const box = await panel(chain({ functions: MANY }), WUGNOT, { maxBytes: 100_000 });
    expect(one(region(box), '[role="status"]').textContent).toContain("larger than this page reads");
    expect(all(region(box), "button")).toHaveLength(0);
    expect(hrefs(box)).toEqual([]);
  });
});
