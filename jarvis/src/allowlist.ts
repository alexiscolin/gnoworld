// These are Jarvis's second and third locks (ADR-0002 §5). The model is offered only the tools in this table. Each call
// it makes is checked first by its name, and then by its tool's own strict Zod object, before anything runs. Every call
// and every refusal is logged with the tool's name, but never with the arguments, because the arguments are model output.
// If the model makes up a tool name that is not even a valid name, the log records one fixed word instead of it.
import { z } from "zod";
import type { Log } from "@gnoworld/service/log";

/** A tool. It has a name, a description that the model reads, and a strict Zod object that its arguments must pass. */
export interface Definition<
  Name extends string = string,
  Args extends z.ZodObject<z.core.$ZodShape, z.core.$strict> = z.ZodObject<z.core.$ZodShape, z.core.$strict>,
> {
  readonly name: Name;
  readonly description: string;
  readonly args: Args;
}

/** One tool as the model is offered it, in the SDK's `Tool` shape. Its schema is generated from the same Zod object. */
interface Offered {
  name: string;
  description: string;
  input_schema: { type: "object"; [key: string]: unknown };
}

/** A call that the allowlist let through. It has the tool's name and its arguments as that tool's schema parsed them. */
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

/** Whether a text is a valid name: a lower-case letter followed by up to 63 lower-case letters, digits or underscores. */
export function isName(text: string): boolean {
  return /^[a-z][a-z0-9_]{0,63}$/.test(text);
}

/** Builds the table of these tools. It throws if a name is used twice or is not a valid name. */
export function allowlist<const D extends Definition>(definitions: readonly D[], log: Log): Allowlist<D> {
  const table = new Map<string, D>();
  for (const definition of definitions) {
    if (!isName(definition.name)) throw new Error(`jarvis tool ${JSON.stringify(definition.name)}: not a name`);
    if (table.has(definition.name)) throw new Error(`jarvis tool ${definition.name}: defined twice`);
    table.set(definition.name, definition);
  }
  // The model writes the input, so the schema it reads describes the input. A field with a default is one the model may leave out.
  const offered = definitions.map(({ name, description, args }) => ({
    name,
    description,
    input_schema: { ...z.toJSONSchema(args, { io: "input" }), type: "object" as const },
  }));
  return {
    // Return a full copy, schemas included, so that anything a caller changes (such as a prompt-cache mark) is never offered later.
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
      // Zod parsed these arguments with this very definition's schema, but TypeScript cannot link a union's name to its arguments.
      return { ok: true, name: definition.name, args: parsed.data } as Call<D>;
    },
  };
}
