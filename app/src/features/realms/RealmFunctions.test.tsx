// @vitest-environment jsdom
import { queryClient } from "../../lib/query/client.ts";
import fc from "fast-check";
import { act, useState } from "react";
import { describe, expect, test, vi } from "vitest";
import { EVALS, FUNCTIONS, REFUSALS, WUGNOT } from "../../../tests/chain/chainFixture.ts";
import { queryEnvelope, rpcErrorEnvelope, statusEnvelope } from "@gnoworld/chain/testing/envelopes";
import { all, button, click, mount, one } from "../../../tests/mount.tsx";
import type { ChainFetch } from "@gnoworld/chain/read";
import { RealmFunctions } from "./RealmFunctions.tsx";
import { useFunctions } from "./useFunctions.ts";

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
// The functions listed, by name: each has a "Read" button labelled "Read <name>".
const listed = (box: HTMLElement): string[] =>
  all(region(box), "button").flatMap((b) => {
    const label = b.textContent;
    return label.startsWith("Read ") ? [label.slice(5)] : [];
  });
const hrefs = (box: HTMLElement) => all(region(box), "a").map((a) => a.getAttribute("href"));
const region = (box: HTMLElement) => one(box, '[aria-label="Read functions"]');
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
    // The row's own button opens it; the Read button is inside, named for the function.
    const control = all(item, "button").find((b) => b.textContent.startsWith("Read "));
    // Its visible word is "Read"; the function's name, hidden from the eye, completes the name a screen reader says.
    expect(control?.textContent).toBe("Read TotalSupply");
    expect(one(control ?? item, ".visually-hidden").textContent).toBe(" TotalSupply");
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
    await settle(box, () => region(box).textContent.includes("The chain refused this read"));
    const state = region(box);
    expect(state.textContent).toContain("The chain refused this read");
    expect(state.textContent).not.toContain("invalid non-origin call");
    expect(region(box).textContent).not.toContain(LABEL);
    expect(hrefs(box)).toEqual(["https://onyx.testnets.gno.land/r/gnoland/wugnot"]);
    // The other functions stay usable: the button is still there to try again.
    expect(button(box, "Read Deposit")?.hasAttribute("disabled")).toBe(false);
  });

  test("shows a huge answer as too large, without any part of it", async () => {
    const box = await panel(chain({ evals: { TotalSupply: `SECRET${"x".repeat(2_000_000)}` } }));
    click(button(box, "Read TotalSupply"));
    await settle(box, () => region(box).textContent.includes("larger than this page reads"));
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
  ])("shows a state, not a blank, with the way to gnoweb, when %s", async (_name, answer) => {
    const box = await panel(vi.fn<ChainFetch>(answer));
    expect(one(region(box), '[role="status"]').textContent).toMatch(/\S/);
    expect(all(region(box), "button")).toHaveLength(0);
    expect(hrefs(box)).toHaveLength(1);
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
  // identifier in Go and `Ａ` is cut by gno's byte test; core's isExportedName keeps to ASCII, which the chain cannot read otherwise.
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
        // A run's reads are its own: the held list of the last run would answer this one.
        queryClient.clear();
        const fetcher = chain({ functions: list.map(reader), evals: {} });
        const box = await panel(fetcher);
        const buttons = all(region(box), "button").filter((b) => b.textContent.startsWith("Read "));
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

// Slice 13, B (plan §3, eval floods; D13301): a card keeps one read in flight, starts one per 400 ms (later asks wait, the last kept), gives
// it 10 s and reads 64 KB of the answer. useFunctions is driven by a harness asking directly: the panel's busy button refuses a click while
// a read is under way, which the plate's card (part C) may not.
describe("the Try-it caller: one read in flight a card, 400 ms apart, 10 s, 64 KB", () => {
  const INT = [{ Name: ".res.0", Type: "int64", Value: "" }];
  const SEARCH = [
    { Name: "q", Type: "string" },
    { Name: "n", Type: "int" },
  ];
  const READABLE = [
    { FuncName: "TotalSupply", Params: null, Results: INT },
    { FuncName: "Decimals", Params: null, Results: INT },
  ];
  // A chain whose qeval answers as `answer` says, given the request's signal; the rest as `chain` answers.
  function evalChain(answer: (url: string, signal: AbortSignal | null | undefined) => Promise<Response>) {
    const inner = chain({ functions: READABLE });
    return vi.fn<ChainFetch>((url, init) =>
      queryOf(url) === "vm/qeval" ? answer(url, init?.signal) : inner(url, init),
    );
  }
  const reply = (text: string) => Promise.resolve(new Response(JSON.stringify(queryEnvelope({ data: text }))));
  // An answer that never comes: it rejects as a fetch does once its signal aborts.
  const never = (_url: string, signal: AbortSignal | null | undefined) =>
    new Promise<Response>((_resolve, reject) => {
      signal?.addEventListener("abort", () => {
        reject(new DOMException("aborted", "AbortError"));
      });
    });
  const advance = async (ms: number) => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  };
  // The hook's reads, asked by a plain button each (Search with a text), and its results as text.
  function Harness({ fetcher }: { fetcher: ChainFetch }) {
    const [options] = useState(() => ({ fetch: fetcher }));
    const { results, read } = useFunctions(CHAIN.rpc, WUGNOT, options);
    const asks: [string, () => void][] = [
      ...READABLE.map(({ FuncName }): [string, () => void] => [
        FuncName,
        () => {
          read(FuncName);
        },
      ]),
      ...["A", "B", "C"].map((text): [string, () => void] => [
        `Search ${text}`,
        () => {
          read("Search", { params: SEARCH, texts: [text, "1"] });
        },
      ]),
    ];
    return (
      <>
        {asks.map(([label, onClick]) => (
          <button key={label} type="button" onClick={onClick}>
            {`Ask ${label}`}
          </button>
        ))}
        <output>{JSON.stringify(results)}</output>
      </>
    );
  }
  function Leaving({ fetcher }: { fetcher: ChainFetch }) {
    const [shown, setShown] = useState(true);
    return (
      <>
        {shown ? <Harness fetcher={fetcher} /> : null}
        <button
          type="button"
          onClick={() => {
            setShown(false);
          }}
        >
          Leave
        </button>
      </>
    );
  }
  async function harness(fetcher: ChainFetch, leaving = false) {
    const box = mount(leaving ? <Leaving fetcher={fetcher} /> : <Harness fetcher={fetcher} />);
    await advance(50);
    return box;
  }
  const ask = (box: HTMLElement, label = "TotalSupply") => {
    click(button(box, `Ask ${label}`));
  };
  const resultOf = (box: HTMLElement, name = "TotalSupply"): unknown =>
    (JSON.parse(one(box, "output").textContent) as Record<string, unknown>)[name];
  const evalsOf = (fetcher: ReturnType<typeof evalChain>) =>
    fetcher.mock.calls.filter(([url]) => queryOf(url) === "vm/qeval");
  const signalOf = (fetcher: ReturnType<typeof evalChain>, at: number) => evalsOf(fetcher)[at]?.[1]?.signal;
  const faked = async (run: () => Promise<void>) => {
    vi.useFakeTimers();
    try {
      await run();
    } finally {
      vi.useRealTimers();
    }
  };

  test("starts a card's read at once, then one every 400 ms at most: reads asked within that time wait, and one goes", () =>
    faked(async () => {
      const fetcher = evalChain(() => reply("(7 int64)"));
      const box = await harness(fetcher);
      ask(box);
      await advance(0);
      expect(evalsOf(fetcher)).toHaveLength(1);
      for (let n = 0; n < 3; n += 1) {
        await advance(100);
        ask(box);
      }
      await advance(99);
      expect(evalsOf(fetcher)).toHaveLength(1);
      await advance(1);
      expect(evalsOf(fetcher)).toHaveLength(2);
      await advance(5_000);
      expect(evalsOf(fetcher)).toHaveLength(2);
      expect(resultOf(box)).toMatchObject({ state: "read", text: "(7 int64)" });
    }));

  test("keeps the last of the reads asked while one waits: its arguments are the ones sent", () =>
    faked(async () => {
      const fetcher = evalChain(() => reply("(1 int64)"));
      const box = await harness(fetcher);
      ask(box, "Search A");
      await advance(100);
      ask(box, "Search B");
      await advance(100);
      ask(box, "Search C");
      await advance(1_000);
      expect(evalsOf(fetcher).map(([url]) => dataOf(url))).toEqual([
        `${WUGNOT}.Search("A", 1)`,
        `${WUGNOT}.Search("C", 1)`,
      ]);
    }));

  // R1 of the review (F13318, S3 F13317): an earlier read that answers while a later one waits its turn is not the later one's answer.
  test("lets no answer of an earlier read stand for a later one asked while it waits", () =>
    faked(async () => {
      const fetcher = evalChain((url) => {
        const body = JSON.stringify(queryEnvelope({ data: `answer for ${dataOf(url)}` }));
        const later = dataOf(url).includes('"A"') ? 200 : 0;
        return new Promise<Response>((resolve) => {
          setTimeout(() => {
            resolve(new Response(body));
          }, later);
        });
      });
      const box = await harness(fetcher);
      ask(box, "Search A");
      await advance(100);
      ask(box, "Search B");
      await advance(200);
      expect(evalsOf(fetcher)).toHaveLength(1);
      expect(resultOf(box, "Search")).toEqual({ state: "busy" });
      await advance(200);
      expect(resultOf(box, "Search")).toMatchObject({ state: "read", text: `answer for ${WUGNOT}.Search("B", 1)` });
    }));

  test("says a waiting read is busy at once, before its request goes", () =>
    faked(async () => {
      const fetcher = evalChain(() => reply("(7 int64)"));
      const box = await harness(fetcher);
      ask(box);
      await advance(10);
      ask(box);
      await advance(0);
      expect(resultOf(box)).toEqual({ state: "busy" });
      expect(evalsOf(fetcher)).toHaveLength(1);
      await advance(1_000);
      expect(resultOf(box)).toMatchObject({ state: "read" });
    }));

  test("keeps one read in flight a card: the next ends the one under way when it starts, not when it is asked", () =>
    faked(async () => {
      let calls = 0;
      const fetcher = evalChain((url, signal) => {
        calls += 1;
        return calls === 1 ? never(url, signal) : reply("(second int64)");
      });
      const box = await harness(fetcher);
      ask(box);
      await advance(100);
      ask(box);
      await advance(299);
      expect(signalOf(fetcher, 0)?.aborted).toBe(false);
      expect(evalsOf(fetcher)).toHaveLength(1);
      await advance(1);
      expect(signalOf(fetcher, 0)?.aborted).toBe(true);
      expect(signalOf(fetcher, 1)?.aborted).toBe(false);
      await advance(1_000);
      expect(resultOf(box)).toMatchObject({ state: "read", text: "(second int64)" });
    }));

  test("lets the read it ended settle nothing: the card stays busy with the next one", () =>
    faked(async () => {
      const fetcher = evalChain(never);
      const box = await harness(fetcher);
      ask(box);
      await advance(500);
      ask(box);
      await advance(0);
      expect(signalOf(fetcher, 0)?.aborted).toBe(true);
      await advance(1);
      expect(resultOf(box)).toEqual({ state: "busy" });
      await advance(5_000);
      expect(resultOf(box)).toEqual({ state: "busy" });
    }));

  test("lets two cards read at the same time: the limits are each card's", () =>
    faked(async () => {
      const fetcher = evalChain(never);
      const box = await harness(fetcher);
      ask(box, "TotalSupply");
      ask(box, "Decimals");
      await advance(0);
      expect(evalsOf(fetcher).map(([url]) => dataOf(url))).toEqual([`${WUGNOT}.TotalSupply()`, `${WUGNOT}.Decimals()`]);
      expect([signalOf(fetcher, 0)?.aborted, signalOf(fetcher, 1)?.aborted]).toEqual([false, false]);
    }));

  test("gives a read 10 seconds: still asked at 9.9 s, too long at 10 s, and its request ended", () =>
    faked(async () => {
      const fetcher = evalChain(never);
      const box = await harness(fetcher);
      ask(box);
      await advance(9_900);
      expect(resultOf(box)).toEqual({ state: "busy" });
      await advance(100);
      expect(resultOf(box)).toMatchObject({ state: "failed" });
      expect(JSON.stringify(resultOf(box))).toContain("took too long");
      expect(signalOf(fetcher, 0)?.aborted).toBe(true);
    }));

  // The cap weighs the RPC's answer as sent (its JSON, the result in base64 inside), in bytes of UTF-8 (D13301).
  test.each([
    { name: "exactly 65,536 bytes of ASCII", bytes: 65_536, char: "e", state: "read" },
    { name: "65,537 bytes of ASCII", bytes: 65_537, char: "e", state: "failed" },
    { name: "fewer characters than 65,536, but more bytes in UTF-8", bytes: 65_538, char: "é", state: "failed" },
  ])("reads an answer of $name ($bytes bytes) as $state", ({ bytes, char, state }) =>
    faked(async () => {
      const answer = () => {
        const bare = JSON.stringify(queryEnvelope({ data: "(1 int64)" }));
        const log = char.repeat(Math.floor((bytes - bare.length) / new TextEncoder().encode(char).length));
        const body = JSON.stringify(queryEnvelope({ data: "(1 int64)", log }));
        const sized = body + " ".repeat(bytes - new TextEncoder().encode(body).length);
        expect(new TextEncoder().encode(sized).length).toBe(bytes);
        return Promise.resolve(new Response(sized));
      };
      const box = await harness(evalChain(answer));
      ask(box);
      await advance(100);
      expect(resultOf(box)).toMatchObject(state === "read" ? { state, text: "(1 int64)" } : { state });
      expect(JSON.stringify(resultOf(box)).includes("larger than this page reads")).toBe(state === "failed");
    }),
  );

  test("ends a card's read when it leaves, and leaves no timer", () =>
    faked(async () => {
      const fetcher = evalChain(never);
      const box = await harness(fetcher, true);
      ask(box);
      await advance(0);
      click(button(box, "Leave"));
      await advance(0);
      expect(signalOf(fetcher, 0)?.aborted).toBe(true);
      // The list's kept query waits out its gcTime on the query client's own timer: not a card's, so it goes before the count.
      queryClient.clear();
      expect(vi.getTimerCount()).toBe(0);
    }));

  test("starts no waiting read once it leaves", () =>
    faked(async () => {
      const fetcher = evalChain(() => reply("(1 int64)"));
      const box = await harness(fetcher, true);
      ask(box);
      await advance(100);
      ask(box);
      click(button(box, "Leave"));
      await advance(1_000);
      expect(evalsOf(fetcher)).toHaveLength(1);
    }));
});
