// Jarvis's second and third locks (ADR-0002 §5): the model is offered the tools of this table and no other, and each
// call it makes is checked by its name, then by its tool's own strict Zod object, before anything runs. Every call and
// every refusal is logged by the tool's name, a name the model made up as one fixed word, and never with the arguments,
// which are model output.
import { z } from "zod";
import type { Log } from "@gnoworld/service/log";

/** A tool: its name, what the model reads of it, and the strict Zod object its arguments must pass. */
export interface Definition<
  Name extends string = string,
  Args extends z.ZodObject<z.core.$ZodShape, z.core.$strict> = z.ZodObject<z.core.$ZodShape, z.core.$strict>,
> {
  readonly name: Name;
  readonly description: string;
  readonly args: Args;
}

/** One tool as the model is offered it, in the SDK's `Tool` shape: its schema drawn from the same Zod object. */
interface Offered {
  name: string;
  description: string;
  input_schema: { type: "object"; [key: string]: unknown };
}

/** A call the allowlist let through: its tool's name and its arguments as that tool's schema parsed them. */
type Call<D> =
  D extends Definition<infer Name, infer Args>
    ? { readonly ok: true; readonly name: Name; readonly args: z.output<Args> }
    : never;

interface Refused {
  readonly ok: false;
  readonly reason: "unknown_tool" | "bad_arguments";
}

export interface Allowlist<D extends Definition> {
  offered(): Offered[];
  check(name: string, input: unknown): Call<D> | Refused;
}

/** Whether a text is a name: a lower-case letter, then up to 63 lower-case letters, digits and underscores. */
export function isName(text: string): boolean {
  return /^[a-z][a-z0-9_]{0,63}$/.test(text);
}

/** The table of these tools; throws when one is named twice, or by no name. */
export function allowlist<const D extends Definition>(definitions: readonly D[], log: Log): Allowlist<D> {
  const table = new Map<string, D>();
  for (const definition of definitions) {
    if (!isName(definition.name)) throw new Error(`jarvis tool ${JSON.stringify(definition.name)}: not a name`);
    if (table.has(definition.name)) throw new Error(`jarvis tool ${definition.name}: defined twice`);
    table.set(definition.name, definition);
  }
  // The model writes the input, so the schema it reads is the input's: a field with a default is one it may leave out.
  const offered = definitions.map(({ name, description, args }) => ({
    name,
    description,
    input_schema: { ...z.toJSONSchema(args, { io: "input" }), type: "object" as const },
  }));
  return {
    // A copy whole, its schemas too, so what a caller changes (a mark for the prompt cache) is never offered after.
    offered: () => structuredClone(offered),
    check(name, input) {
      const definition = table.get(name);
      if (definition === undefined) {
        log("jarvis_tool_refused", { tool: isName(name) ? name : "<malformed>", reason: "unknown_tool" });
        return { ok: false, reason: "unknown_tool" };
      }
      const parsed = definition.args.safeParse(input);
      if (!parsed.success) {
        log("jarvis_tool_refused", { tool: name, reason: "bad_arguments" });
        return { ok: false, reason: "bad_arguments" };
      }
      log("jarvis_tool_call", { tool: name });
      // Zod parsed these arguments with this very definition's schema: TypeScript cannot tie a union's name to them.
      return { ok: true, name: definition.name, args: parsed.data } as Call<D>;
    },
  };
}
