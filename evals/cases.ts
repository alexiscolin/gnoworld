// gnoworld's eval cases (ADR-0002 §5, "Evals"): plain JSON, one file a suite in cases/, so they outlive the tool that
// runs them; read and checked here, by jarvis's own wire schemas, then handed to promptfoo as its tests (tests.ts) and
// to the provider (provider.ts). jarvis/src/evals.test.ts holds the same files to the same schemas in the gate.
import { readdirSync, readFileSync } from "node:fs";
import { z } from "zod";
import { FunctionList } from "../packages/schemas/src/functions.ts";
import { JarvisAsk, JarvisDigestRequest, JarvisTranslate } from "../packages/schemas/src/jarvis.ts";

/** What a case expects of jarvis's answer, its tools and its cost; every field but the status optional. */
export const Expect = z.strictObject({
  status: z.array(z.string()).min(1),
  never_tools: z.array(z.string()).optional(),
  some_tools: z.array(z.string()).optional(),
  contains: z.array(z.string()).optional(),
  lacks: z.array(z.string()).optional(),
  rubric: z.string().min(20).optional(),
  made_at_most: z.int().min(0).optional(),
  proposal: z.literal("none").optional(),
  max_usd: z.number().positive().optional(),
  max_ms: z.int().positive().optional(),
});
export type Expect = z.infer<typeof Expect>;

// A value one of jarvis's own schemas (zod/mini) takes, its refusal an issue of this schema's, never a throw.
const wire = <T>(schema: { safeParse: (value: unknown) => { success: true; data: T } | { success: false } }) =>
  z.unknown().transform((value, ctx) => {
    const parsed = schema.safeParse(value);
    if (parsed.success) return parsed.data;
    ctx.addIssue({ code: "custom", message: "not jarvis's wire" });
    return z.NEVER;
  });

const Recorded = z.strictObject({
  height: z.int().positive(),
  page: z.string().max(200 * 1024),
  functions: wire(FunctionList),
});
/** A realm as a recorded node holds it at one height: its page and its functions (vm/qrender, vm/qfuncs), written in
 * its case or named from chains/, the case's words after its page. */
export const Chain = z.union([
  Recorded,
  z
    .strictObject({ recorded: z.string().regex(/^[a-z0-9-]+$/), then: z.string().min(1).optional() })
    .transform(({ recorded, then = "" }) => {
      const chain = Recorded.parse(
        JSON.parse(readFileSync(new URL(`chains/${recorded}.json`, import.meta.url), "utf8")),
      );
      return { ...chain, page: chain.page + then };
    }),
]);
export type Chain = z.infer<typeof Chain>;
const common = {
  id: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/),
  about: z.string().min(10),
  // The text an injection case plants where jarvis reads it.
  planted: z.string().min(4).optional(),
  // Asked of a jarvis whose day's budgets are spent.
  spent: z.literal(true).optional(),
  // Asked this many times at once, as readers of one line or realm do.
  repeat: z.int().min(2).max(4).optional(),
  expect: Expect,
};
export const Case = z.union([
  z.strictObject({ ...common, ask: wire(JarvisAsk) }),
  z.strictObject({ ...common, translate: wire(JarvisTranslate) }),
  z.strictObject({ ...common, digest: wire(JarvisDigestRequest), chain: Chain }),
]);
export type Case = z.infer<typeof Case>;
export type Kind = "ask" | "translate" | "digest";

export const kindOf = (one: Case): Kind => ("ask" in one ? "ask" : "translate" in one ? "translate" : "digest");

// A character the files may not hold (the gate refuses hidden ones) is written `<U+202E>`, and read as itself here.
export const expanded = (text: string): string =>
  text.replace(/<U\+([0-9A-F]{4,6})>/g, (written, hex: string) => {
    const point = Number.parseInt(hex, 16);
    return point <= 0x10ffff ? String.fromCodePoint(point) : written;
  });

/** Every case of a folder's suites, each with its suite's name; throws naming the file and the case that fails. */
export function readCases(folder: string): (Case & { suite: string })[] {
  const Suite = z.strictObject({ suite: z.string(), cases: z.array(z.unknown()).min(1) });
  return readdirSync(folder)
    .filter((name) => name.endsWith(".json"))
    .sort()
    .flatMap((name) => {
      const suite = Suite.parse(JSON.parse(expanded(readFileSync(`${folder}/${name}`, "utf8"))));
      return suite.cases.map((raw, at) => {
        const parsed = Case.safeParse(raw);
        if (!parsed.success) throw new Error(`${name}: case ${String(at)}: ${parsed.error.message}`);
        return { ...parsed.data, suite: suite.suite };
      });
    });
}
