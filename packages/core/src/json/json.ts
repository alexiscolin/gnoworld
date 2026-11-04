// JSON at a boundary (D121, D122): the value of a text, or nothing for a text that is no JSON, which the boundary's schema
// then refuses by its place; and where a fault sits in a data file, written the same way by the app's build and Jarvis.

/** The value a JSON text writes; undefined for a text that is no JSON, never an error (JSON writes no undefined). */
export function jsonOf(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** A value's place in a data file, from its path: `[0].slug`, `hubs[2].universe`; `(file)` for the whole file. */
export function placeIn(path: readonly PropertyKey[]): string {
  if (path.length === 0) return "(file)";
  return path
    .map((key) => (typeof key === "number" ? `[${String(key)}]` : `.${String(key)}`))
    .join("")
    .replace(/^\./, "");
}
