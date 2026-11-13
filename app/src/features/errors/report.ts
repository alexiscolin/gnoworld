import type { ErrorKind } from "./kind.ts";

const MARK = "gnoworld:reloaded-for-a-new-version";

/** Reloads once for a session: the mark is kept first, and a storage that cannot keep it never reloads, so a page that stays broken cannot loop. */
export function reloadOnce(storage: Pick<Storage, "getItem" | "setItem"> | undefined, reload: () => void): boolean {
  try {
    if (storage?.getItem(MARK) !== null) return false;
    storage.setItem(MARK, "1");
  } catch {
    return false;
  }
  reload();
  return true;
}

/** What a visitor can quote: when and where, nothing of who. */
export function referenceOf(now: Date, route: string): string {
  return `${now.toISOString().slice(0, 19)}Z ${route}`;
}

/** The kinds that are the app's own fault, told to the browser's error channel: the route and the kind, no message, no user data. */
const REPORTED: ReadonlySet<ErrorKind> = new Set(["crash", "new-version"]);
export function report(kind: ErrorKind, route: string): void {
  if (REPORTED.has(kind) && typeof reportError === "function") reportError(new Error(`${kind} at ${route}`));
}

const stamps = new WeakMap<object, Date>();
// A thrown string or number cannot key a WeakMap: the last one is kept by its value.
let loose: { error: unknown; at: Date } | undefined;

/** The moment the page first needed a reference for `error`, the same on every read of it. */
export function stamp(error: unknown): Date {
  if ((typeof error === "object" && error !== null) || typeof error === "function") {
    const at = stamps.get(error) ?? new Date();
    stamps.set(error, at);
    return at;
  }
  if (loose === undefined || !Object.is(loose.error, error)) loose = { error, at: new Date() };
  return loose.at;
}
