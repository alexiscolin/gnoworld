// Whether a realm exists, as far as one read says: pure, so the network's menu takes it with none of the realms feature's code
// (features/realms/known.ts keeps the hook and re-exports these).
export type Known = "unknown" | "yes" | "no";

/** What of a realm's read `knownOf` looks at (features/realms/useRealm.ts's `Realm` fits). */
interface Read {
  state: string;
  failure?: { kind: string } | undefined;
}

/** The chain's own "no realm" wins; else a page that was read or a listing in the worlds' file says yes; a down or slow chain, none. */
export function knownOf(listed: boolean, read: Read | undefined): Known {
  const failed = read?.state === "failed" ? read.failure?.kind : undefined;
  if (failed === "no-realm") return "no";
  return listed || read?.state === "read" || failed === "no-page" ? "yes" : "unknown";
}
