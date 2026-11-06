// What is wrong with the texts typed in a call card's fields, as they are typed: apart from the request (request.ts), whose schema
// only a signature needs.
import { callArgs, callFields, textProblem, type Param, type Problem } from "@gnoworld/core";

/** The problem of each field's text, none for a good one; no field for a call the card does not carry. A missing text is an empty one. */
export function problemsOf({
  params,
  texts,
}: {
  params: readonly Param[];
  texts: readonly string[];
}): (Problem | undefined)[] {
  const fields = callFields(params);
  if (!fields.ok) return [];
  const padded = fields.fields.map((_, index) => texts[index] ?? "");
  const typed = callArgs(params, padded);
  const found = typed.ok || typed.why !== "fields" ? [] : typed.problems;
  return padded.map((text, index) => found[index] ?? textProblem(text));
}
