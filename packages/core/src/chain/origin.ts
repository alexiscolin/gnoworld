// F2819: the one rule for an address reached from data (an RPC, an indexer), shared by the build's CSP and the server's way out.

/**
 * A bare https origin on a public name: lower-case labels, one dot at least, a final label that starts with a letter (so no
 * IPv4 address in any spelling URL() folds), none of `.local`, `.localhost`, `.internal`, and a port of 1 to 65535 with no
 * leading zero. No wildcard, path, quote, space, `;` or `,`.
 */
export function isPublicOrigin(origin: string): boolean {
  const match = /^https:\/\/((?:[a-z0-9-]+\.)+[a-z][a-z0-9-]*)(?::([1-9][0-9]{0,4}))?$/.exec(origin);
  if (match === null) return false;
  const last = match[1]?.split(".").at(-1) ?? "";
  return !["local", "localhost", "internal"].includes(last) && Number(match[2] ?? 0) <= 65_535;
}
