// Adena as the page finds it (window.adena, read as outside data): present or not, and its version. The sign of
// an extension is its AddEstablish; anything else, a getter that throws included, is a result, never a throw.

/** The extension's first version with SignArbitrary, which the login needs (slice 9's plan, 9b). */
export const MIN_SIGN_IN = "1.22.2";
// The version is drawn later, so its length is bounded; cut, it no longer reads as one and asks for an update.
const VERSION_CHARS = 32;

export type Detected = { ok: true; version: string | undefined } | { ok: false; reason: "missing" | "failed" };

/** One read of a method: an object's key read twice may answer twice differently. */
export function method(adena: unknown, name: string): ((...args: unknown[]) => unknown) | undefined {
  if (typeof adena !== "object" || adena === null) return undefined;
  const found: unknown = Reflect.get(adena, name);
  if (typeof found !== "function") return undefined;
  return (...args: unknown[]): unknown => {
    const result: unknown = Reflect.apply(found, adena, args);
    return result;
  };
}

/** Whether there is an extension, and the version it says, read once; undefined when it says none. */
export function detect(adena: unknown): Detected {
  try {
    if (typeof adena !== "object" || adena === null || method(adena, "AddEstablish") === undefined)
      return { ok: false, reason: "missing" };
    const version: unknown = Reflect.get(adena, "version");
    return { ok: true, version: typeof version === "string" ? version.slice(0, VERSION_CHARS) : undefined };
  } catch {
    return { ok: false, reason: "failed" };
  }
}

const parse = (version: string): number[] | undefined => /^(\d+)\.(\d+)\.(\d+)$/.exec(version)?.slice(1).map(Number);

/** Whether a version is below a minimum: an unreadable one is, an update is asked; none said is not, its methods say. */
export function isOlder(version: string | undefined, minimum: string): boolean {
  if (version === undefined) return false;
  const [have, need] = [parse(version), parse(minimum)];
  if (have === undefined || need === undefined) return true;
  const at = have.findIndex((part, i) => part !== need[i]);
  return at !== -1 && (have[at] ?? 0) < (need[at] ?? 0);
}
