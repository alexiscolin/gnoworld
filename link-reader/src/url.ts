// The URL rule, again: the reader trusts nothing the server says (docs/plans/link-previews.md §4). A page or a picture is read only at
// an https address on port 443 (or none), with no userinfo, a public name (no IP literal, no local name) and at most 2,048 characters.
// A name that resolves to a private address is the DNS check's and the way out's (fetch.ts), never this rule's.
import { isPublicOrigin } from "@gnoworld/core";

const MAX_URL = 2048;
// Names that never lead to a public host, beyond what core's rule refuses (core refuses local, localhost, internal, lan, onion, home.arpa).
const RESERVED = /\.(test|invalid|example|corp|localdomain)$/;

// https on 443, with no userinfo: read from the text too, since an empty one (`https://@host/`) leaves no trace in the parsed URL.
const plainHttps = (raw: string, url: URL) =>
  url.protocol === "https:" &&
  url.username === "" &&
  url.password === "" &&
  !/^https:\/\/[^/?#\\]*@/i.test(raw) &&
  (url.port === "" || url.port === "443");
const publicName = (url: URL) => isPublicOrigin(`https://${url.hostname}`) && !RESERVED.test(url.hostname);

/** The URL as a parsed `URL`, or undefined if the reader may not fetch it. */
export function readableUrl(raw: string): URL | undefined {
  const url = raw.length > MAX_URL ? null : URL.parse(raw);
  return url !== null && plainHttps(raw, url) && publicName(url) ? url : undefined;
}
