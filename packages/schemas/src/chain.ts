// What the browser reads from a chain's RPC (slice 5 part 2, 5g-reads). Only the fields a read uses are named: an added field
// neither breaks a read nor travels on, because these envelopes are read from gno's source, not recorded (chainFixture.ts).
import { z } from "./zod.ts";

const Refusal = z.object({ "@type": z.string(), value: z.optional(z.string()) });

/** The envelope of the three `abci_query` reads. `result` and `error` are each optional: which is missing is the reader's call. */
export const QueryAnswer = z.object({
  result: z.optional(
    z.object({
      response: z.object({
        ResponseBase: z.object({
          Error: z.optional(z.nullable(Refusal)),
          Data: z.optional(z.nullable(z.string())),
        }),
      }),
    }),
  ),
  error: z.optional(z.object({})),
});
export type QueryAnswer = z.infer<typeof QueryAnswer>;

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

/** The node's `/status`: the latest block's height (an int64 is a string) and its own time. */
export const StatusAnswer = z.object({
  result: z.object({
    sync_info: z.object({
      latest_block_height: z.string().check(z.regex(/^[0-9]+$/)),
      latest_block_time: z.iso.datetime(),
    }),
  }),
});
export type StatusAnswer = z.infer<typeof StatusAnswer>;
