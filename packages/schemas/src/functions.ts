// The text of `vm/qfuncs`, in a file of its own: only a realm's view reads it, and a module shared with the first screen's
// reads (chain.ts) would carry it into the first screen's chunk (budgets.spec.ts: 27 B over the cap).
import { z } from "./zod.ts";

const Variable = z.object({ Name: z.string(), Type: z.string() });

/** The text of `vm/qfuncs`: null (the text `null`) for a realm with no exported function; a nil Go list is null (json_encode.go:262). */
export const FunctionList = z.nullable(
  z.array(
    z.object({
      FuncName: z.string(),
      Params: z.optional(z.nullable(z.array(Variable))),
      Results: z.optional(z.nullable(z.array(Variable))),
    }),
  ),
);
export type FunctionList = z.infer<typeof FunctionList>;
