import fc from "fast-check";
import { describe, expect, test } from "vitest";
import { BATCH_LINES, BatchReader, OPEN_BATCHES, type Batched } from "./batch.ts";
import { parseLine, type IrcMessage } from "./irc.ts";

const PROPERTY = { seed: 20261017, numRuns: 300 };
const read = (line: string): IrcMessage => {
  const parsed = parseLine(line);
  if (!parsed.ok) throw new Error(`the test's line does not parse: ${line}`);
  return parsed.message;
};
const said = (ref: string, text: string) => read(`@batch=${ref};msgid=${text} :a!u@h PRIVMSG #bubble :${text}`);
const texts = (messages: readonly IrcMessage[]) => messages.map((message) => message.params.at(-1));

describe("BatchReader: Ergo's batches, each handed on whole at its end", () => {
  test("holds a history page's lines, and hands them on at its end, with its type and parameters", () => {
    const reader = new BatchReader();
    expect(reader.read(read("BATCH +h1 chathistory #bubble"))).toEqual({ kind: "held" });
    expect(reader.read(said("h1", "one"))).toEqual({ kind: "held" });
    expect(reader.read(said("h1", "two"))).toEqual({ kind: "held" });
    const done = reader.read(read("BATCH -h1"));
    expect(done).toMatchObject({ kind: "done", batch: { type: "chathistory", params: ["#bubble"] } });
    expect(done.kind === "done" ? texts(done.batch.messages) : []).toEqual(["one", "two"]);
  });

  test("passes a line of no batch at once, though a batch is open", () => {
    const reader = new BatchReader();
    reader.read(read("BATCH +h1 chathistory #bubble"));
    const live = read(":a!u@h PRIVMSG #bubble :live");
    expect(reader.read(live)).toEqual({ kind: "pass" });
  });

  test("keeps two batches apart, their lines interleaved", () => {
    const reader = new BatchReader();
    reader.read(read("BATCH +a chathistory #bubble"));
    reader.read(read("BATCH +b chathistory #garden"));
    for (const [ref, text] of [
      ["a", "a1"],
      ["b", "b1"],
      ["a", "a2"],
      ["b", "b2"],
    ] as const)
      reader.read(said(ref, text));
    const b = reader.read(read("BATCH -b"));
    const a = reader.read(read("BATCH -a"));
    expect(b.kind === "done" ? [b.batch.params, texts(b.batch.messages)] : []).toEqual([["#garden"], ["b1", "b2"]]);
    expect(a.kind === "done" ? [a.batch.params, texts(a.batch.messages)] : []).toEqual([["#bubble"], ["a1", "a2"]]);
  });

  // Ergo's answer to a labeled command of two lines or more is a labeled-response batch whose BATCH line holds the
  // label (irc/responsebuffer.go:264-281, v2.19.1): the label is read from the batch, its lines having none.
  test("keeps its BATCH line's tags: a labeled-response's label", () => {
    const reader = new BatchReader();
    reader.read(read("@label=7 BATCH +r1 labeled-response"));
    reader.read(said("r1", "echo"));
    const done = reader.read(read("BATCH -r1"));
    expect(done.kind === "done" ? [done.batch.type, done.batch.tags.get("label")] : []).toEqual([
      "labeled-response",
      "7",
    ]);
  });

  test("hands on an empty batch", () => {
    const reader = new BatchReader();
    reader.read(read("BATCH +h1 chathistory #bubble"));
    expect(reader.read(read("BATCH -h1"))).toMatchObject({
      kind: "done",
      batch: { type: "chathistory", params: ["#bubble"], tags: new Map(), messages: [] },
    });
  });

  test("opens a batch that sits inside another as its own, and hands each on at its own end", () => {
    const reader = new BatchReader();
    reader.read(read("BATCH +outer netjoin"));
    expect(reader.read(read("@batch=outer BATCH +inner chathistory #bubble"))).toEqual({ kind: "held" });
    reader.read(said("inner", "deep"));
    const inner = reader.read(read("@batch=outer BATCH -inner"));
    expect(inner.kind === "done" ? texts(inner.batch.messages) : []).toEqual(["deep"]);
    expect(reader.read(read("BATCH -outer"))).toMatchObject({ kind: "done", batch: { type: "netjoin", messages: [] } });
  });

  test("takes a reference again once its batch ended", () => {
    const reader = new BatchReader();
    reader.read(read("BATCH +h1 chathistory #bubble"));
    reader.read(read("BATCH -h1"));
    reader.read(read("BATCH +h1 chathistory #garden"));
    reader.read(said("h1", "again"));
    const done = reader.read(read("BATCH -h1"));
    expect(done.kind === "done" ? [done.batch.params, texts(done.batch.messages)] : []).toEqual([
      ["#garden"],
      ["again"],
    ]);
  });

  test("keeps the first of two batches opened under one reference, and its lines", () => {
    const reader = new BatchReader();
    reader.read(read("BATCH +h1 chathistory #bubble"));
    reader.read(said("h1", "one"));
    expect(reader.read(read("BATCH +h1 chathistory #garden"))).toEqual({ kind: "held" });
    const done = reader.read(read("BATCH -h1"));
    expect(done.kind === "done" ? [done.batch.params, texts(done.batch.messages)] : []).toEqual([["#bubble"], ["one"]]);
    expect(reader.read(read("BATCH -h1"))).toEqual({ kind: "held" });
  });

  test.each([
    ["a line of a batch never opened", said("nope", "x")],
    ["a line whose batch tag has no value", read("@batch :a!u@h PRIVMSG #bubble :x")],
  ])("passes %s", (_, message) => {
    const reader = new BatchReader();
    reader.read(read("BATCH +h1 chathistory #bubble"));
    expect(reader.read(message)).toEqual({ kind: "pass" });
  });

  test.each([
    ["the end of a batch never opened", "BATCH -h2"],
    ["a BATCH with nothing", "BATCH"],
    ["a BATCH with no sign", "BATCH h2 chathistory"],
    ["a BATCH whose sign is no sign", "BATCH xh2 chathistory #a"],
    ["a BATCH + with no reference", "BATCH + chathistory"],
    ["a BATCH - with no reference", "BATCH -"],
    ["a BATCH + with no type", "BATCH +h2"],
  ])("takes %s as nothing to do: it opens nothing, and leaves the open batch alone", (_, line) => {
    const reader = new BatchReader();
    reader.read(read("BATCH +h1 chathistory #bubble"));
    reader.read(said("h1", "kept"));
    expect(reader.read(read(line))).toEqual({ kind: "held" });
    expect(reader.read(said("h2", "loose"))).toEqual({ kind: "pass" });
    expect(reader.read(read("@batch :a!u@h PRIVMSG #bubble :x"))).toEqual({ kind: "pass" });
    const done = reader.read(read("BATCH -h1"));
    expect(done.kind === "done" ? texts(done.batch.messages) : []).toEqual(["kept"]);
  });

  // The relay is untrusted: a reference that names a property of every object is a reference like another.
  test.each(["__proto__", "constructor", "toString", "hasOwnProperty"])(
    "reads a batch named %s, never throwing",
    (ref) => {
      const reader = new BatchReader();
      expect(reader.read(said(ref, "loose"))).toEqual({ kind: "pass" });
      expect(reader.read(read(`BATCH -${ref}`))).toEqual({ kind: "held" });
      expect(reader.read(read(`BATCH +${ref} chathistory #x`))).toEqual({ kind: "held" });
      reader.read(said(ref, "inside"));
      const done = reader.read(read(`BATCH -${ref}`));
      expect(done.kind === "done" ? texts(done.batch.messages) : []).toEqual(["inside"]);
    },
  );

  test("opens a batch whose BATCH line names a batch never opened", () => {
    const reader = new BatchReader();
    expect(reader.read(read("@batch=nope BATCH +x chathistory #bubble"))).toEqual({ kind: "held" });
    expect(reader.read(said("x", "in"))).toEqual({ kind: "held" });
  });

  test("keeps an inner batch open when its outer one ends first", () => {
    const reader = new BatchReader();
    reader.read(read("BATCH +outer netjoin"));
    reader.read(read("@batch=outer BATCH +inner chathistory #bubble"));
    reader.read(read("BATCH -outer"));
    reader.read(said("inner", "still"));
    const inner = reader.read(read("BATCH -inner"));
    expect(inner.kind === "done" ? texts(inner.batch.messages) : []).toEqual(["still"]);
  });

  // The relay is untrusted: a batch never ended, or ever growing, holds no more than its bounds.
  test(`holds ${String(OPEN_BATCHES)} batches open at most: one more is not opened, and its lines pass`, () => {
    expect(OPEN_BATCHES).toBe(16);
    const reader = new BatchReader();
    for (let n = 0; n < 16; n += 1) reader.read(read(`BATCH +b${String(n)} chathistory #bubble`));
    expect(reader.read(said("b15", "last kept"))).toEqual({ kind: "held" });
    expect(reader.read(read("BATCH +b16 chathistory #bubble"))).toEqual({ kind: "held" });
    expect(reader.read(said("b16", "over"))).toEqual({ kind: "pass" });
    expect(reader.read(read("BATCH -b16"))).toEqual({ kind: "held" });
    reader.read(read("BATCH -b0"));
    expect(reader.read(read("BATCH +b16 chathistory #bubble"))).toEqual({ kind: "held" });
    expect(reader.read(said("b16", "now"))).toEqual({ kind: "held" });
  });

  test(`holds ${String(BATCH_LINES)} lines a batch at most, the first ones, and drops the rest`, () => {
    expect(BATCH_LINES).toBe(1000);
    const reader = new BatchReader();
    reader.read(read("BATCH +h1 chathistory #bubble"));
    for (let n = 0; n < 1001; n += 1) expect(reader.read(said("h1", `m${String(n)}`))).toEqual({ kind: "held" });
    const done = reader.read(read("BATCH -h1"));
    const kept = done.kind === "done" ? texts(done.batch.messages) : [];
    expect(kept).toHaveLength(1000);
    expect(kept.at(0)).toBe("m0");
    expect(kept.at(-1)).toBe("m999");
  });

  test("hands on each batch's own lines, in order, whatever the interleaving", () => {
    const step = fc.oneof(
      fc.record({ kind: fc.constant("line" as const), ref: fc.constantFrom("a", "b", "c"), n: fc.nat(99) }),
      fc.record({ kind: fc.constant("live" as const), n: fc.nat(99) }),
    );
    fc.assert(
      fc.property(fc.array(step, { maxLength: 60 }), (steps) => {
        const reader = new BatchReader();
        for (const ref of ["a", "b", "c"]) reader.read(read(`BATCH +${ref} chathistory #${ref}`));
        const passed: string[] = [];
        for (const each of steps) {
          const text = each.kind === "line" ? `${each.ref}${String(each.n)}` : `live${String(each.n)}`;
          const got = reader.read(each.kind === "line" ? said(each.ref, text) : read(`:a!u@h PRIVMSG #x :${text}`));
          if (got.kind === "pass") passed.push(text);
        }
        for (const ref of ["a", "b", "c"]) {
          const done = reader.read(read(`BATCH -${ref}`));
          const own = steps.flatMap((each) =>
            each.kind === "line" && each.ref === ref ? [`${ref}${String(each.n)}`] : [],
          );
          expect(done.kind === "done" ? texts(done.batch.messages) : undefined).toStrictEqual(own);
        }
        expect(passed).toStrictEqual(steps.flatMap((each) => (each.kind === "live" ? [`live${String(each.n)}`] : [])));
      }),
      PROPERTY,
    );
  });
});

// draft/multiline (slice 4, docs/decisions.md row 255): a message of several lines is a batch whose opening line
// carries its id, time and account (Ergo's composeMultilineBatch, irc/client.go, v2.19.1); inside a history page it
// sits as a batch of its own in its place (irc/responsebuffer.go, AddSplitMessageFromClient's nested batch).
describe("BatchReader: a message of several lines (draft/multiline)", () => {
  const OPENED = "@msgid=m2;time=2026-10-25T10:01:00.000Z;account=a :a!u@h BATCH +ml draft/multiline #bubble";

  test("keeps a batch's opening line, its tags and its source, with what it hands on", () => {
    const reader = new BatchReader();
    reader.read(read(OPENED));
    reader.read(read("@batch=ml :a!u@h PRIVMSG #bubble :one"));
    const done = reader.read(read(":a!u@h BATCH -ml"));
    expect(done).toMatchObject({
      kind: "done",
      batch: { type: "draft/multiline", params: ["#bubble"], source: "a!u@h" },
    });
    expect(done.kind === "done" ? done.batch.tags.get("msgid") : undefined).toBe("m2");
  });

  test("folds a multiline batch inside a history page into one line of that page, in its place", () => {
    const reader = new BatchReader();
    reader.read(read("BATCH +h1 chathistory #bubble"));
    reader.read(said("h1", "before"));
    reader.read(read(`@batch=h1;${OPENED.slice(1)}`));
    reader.read(read("@batch=ml :a!u@h PRIVMSG #bubble :one"));
    reader.read(read("@batch=ml :a!u@h PRIVMSG #bubble :two"));
    expect(reader.read(read("@batch=h1 :a!u@h BATCH -ml"))).toEqual({ kind: "held" });
    reader.read(said("h1", "after"));
    const page = reader.read(read("BATCH -h1"));
    expect(page.kind === "done" ? texts(page.batch.messages) : []).toEqual(["before", "one\ntwo", "after"]);
    expect(page.kind === "done" ? page.batch.messages[1]?.tags.get("msgid") : undefined).toBe("m2");
  });

  // The red pass (R2, R3): the relay is untrusted, a nested multiline batch held to the reader's bounds.
  const nested = (ref: string, parent = "h1") => `@batch=${parent};${OPENED.slice(1).replace("+ml", `+${ref}`)}`;
  const partOf = (ref: string, text: string) => read(`@batch=${ref} :a!u@h PRIVMSG #bubble :${text}`);
  const pageOf = (done: Batched) => (done.kind === "done" ? texts(done.batch.messages) : ["not done"]);

  test("hands on a page without its multiline batch still open at the page's end", () => {
    const reader = new BatchReader();
    reader.read(read("BATCH +h1 chathistory #bubble"));
    reader.read(read(nested("ml")));
    reader.read(partOf("ml", "never ended"));
    expect(pageOf(reader.read(read("BATCH -h1")))).toEqual([]);
  });

  test("hands on a multiline batch whose parent is unknown, or ended first, as a batch of its own", () => {
    const reader = new BatchReader();
    reader.read(read(nested("ml", "nope")));
    reader.read(partOf("ml", "orphan"));
    expect(reader.read(read("@batch=nope :a!u@h BATCH -ml"))).toMatchObject({
      kind: "done",
      batch: { type: "draft/multiline" },
    });
    reader.read(read("BATCH +h1 chathistory #bubble"));
    reader.read(read(nested("m2")));
    reader.read(partOf("m2", "late"));
    reader.read(read("BATCH -h1"));
    expect(reader.read(read("@batch=h1 :a!u@h BATCH -m2"))).toMatchObject({
      kind: "done",
      batch: { type: "draft/multiline" },
    });
  });

  test("folds two multiline batches of one reference in turn, in a page and after it", () => {
    const reader = new BatchReader();
    reader.read(read("BATCH +h1 chathistory #bubble"));
    for (const text of ["first", "second"]) {
      reader.read(read(nested("ml")));
      reader.read(partOf("ml", text));
      reader.read(partOf("ml", "line"));
      reader.read(read("@batch=h1 :a!u@h BATCH -ml"));
    }
    expect(pageOf(reader.read(read("BATCH -h1")))).toEqual(["first\nline", "second\nline"]);
    reader.read(read(OPENED));
    reader.read(partOf("ml", "top"));
    expect(reader.read(read(":a!u@h BATCH -ml"))).toMatchObject({ kind: "done", batch: { type: "draft/multiline" } });
  });

  test(`holds ${String(BATCH_LINES)} folded messages a page at most, as it holds lines`, () => {
    const reader = new BatchReader();
    reader.read(read("BATCH +h1 chathistory #bubble"));
    for (let n = 0; n <= BATCH_LINES; n++) {
      reader.read(read(nested(`m${String(n)}`)));
      reader.read(partOf(`m${String(n)}`, String(n)));
      reader.read(partOf(`m${String(n)}`, "x"));
      reader.read(read(`@batch=h1 :a!u@h BATCH -m${String(n)}`));
    }
    const page = pageOf(reader.read(read("BATCH -h1")));
    expect(page).toHaveLength(BATCH_LINES);
    expect(page.at(-1)).toBe(`${String(BATCH_LINES - 1)}\nx`);
  });

  test(`opens no multiline batch past ${String(OPEN_BATCHES)} open: its parts pass on their own`, () => {
    const reader = new BatchReader();
    reader.read(read("BATCH +h1 chathistory #bubble"));
    for (let n = 1; n < OPEN_BATCHES; n++) reader.read(read(`BATCH +o${String(n)} netjoin`));
    reader.read(read(nested("ml")));
    expect(reader.read(partOf("ml", "on its own"))).toEqual({ kind: "pass" });
  });

  test("puts nothing in its page for a multiline batch that folds into none", () => {
    const reader = new BatchReader();
    reader.read(read("BATCH +h1 chathistory #bubble"));
    reader.read(read(`@batch=h1;${OPENED.slice(1)}`));
    reader.read(read("@batch=ml :mallory!u@h PRIVMSG #bubble :not the sender"));
    reader.read(read("@batch=h1 :a!u@h BATCH -ml"));
    const page = reader.read(read("BATCH -h1"));
    expect(page.kind === "done" ? page.batch.messages : ["?"]).toEqual([]);
  });
});
