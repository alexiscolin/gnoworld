// F2819: the one rule for an address reached from data (an RPC, an indexer), shared by the build's CSP and the server's way out.

/**
 * A bare https origin whose name is not a local one: lower-case labels, one dot at least, a final label that starts with a letter (no
 * IPv4), not `.local`, `.localhost`, `.internal`, `.lan`, `.onion` or `.home.arpa`, a port of 1 to 65535 with no leading zero, no
 * wildcard, path, quote, space, `;` or `,`. Names only: `*.nip.io` resolves private, and only the server's egress proxy checks (F5553).
 */
export function isPublicOrigin(origin: string): boolean {
  const match = /^https:\/\/((?:[a-z0-9-]+\.)+[a-z][a-z0-9-]*)(?::([1-9][0-9]{0,4}))?$/.exec(origin);
  if (match === null) return false;
  const last = match[1]?.split(".").at(-1) ?? "";
  const private_ = ["local", "localhost", "internal", "lan", "onion"].includes(last);
  return !private_ && !match[1]?.endsWith(".home.arpa") && Number(match[2] ?? 0) <= 65_535;
}
