// What of a markdown answer a room may be told: its links only to the door's hosts, and a plain one-line excerpt of it.
import { GUEST_LINE_BYTES, GUEST_LINE_MAX } from "../guest/rules.ts";
import { onList } from "./refuse.ts";

// An inline link or image: [text](target "title"). A target is one token with no parenthesis.
const LINK = /(!?)\[([^\]\n]*)\]\(\s*<?([^()\s<>]*)>?(?:\s+(?:"[^"\n]*"|'[^'\n]*'))?\s*\)/g;
// Every other way markdown, or a client reading it, makes a link: a reference, an autolink, a bare scheme, a scheme-relative target.
const OTHER_LINKS = [
  /\]\(/,
  /\]\[/,
  /^\s{0,3}\[[^\]]+\]:/m,
  /<[^\s<>]*[.:/@][^\s<>]*>/,
  /(?:^|[\s(<["'])\/\/[^\s/]/,
  /\b(?:javascript|vbscript|file|ftp|mailto|tel|blob|data):\S/i,
];
// A domain followed by a path, which many clients make a link with no scheme.
const BARE = /(?<![\w@.-])((?:[a-z0-9-]+\.)+[a-z]{2,})(?::\d+)?\/\S*/gi;

// An https URL to a host of `hosts`, with no login in it.
function onHostUrl(target: string, hosts: readonly string[]): boolean {
  const url = URL.parse(target);
  return url?.protocol === "https:" && url.username === "" && url.password === "" && onList(url.hostname, hosts);
}

/** How many links the markdown holds, all https to a host of `hosts` with no login in them; none when any other link is in it. */
export function allowedLinks(markdown: string, hosts: readonly string[]): number | undefined {
  const links = [...markdown.matchAll(LINK)];
  if (links.some(([, image, , target]) => image === "!" || !onHostUrl(target ?? "", hosts))) return undefined;
  const rest = markdown.replace(LINK, " ");
  if (OTHER_LINKS.some((form) => form.test(rest))) return undefined;
  for (const [, host = ""] of rest.matchAll(BARE)) if (!onList(host.toLowerCase(), hosts)) return undefined;
  return links.length;
}

/** The markdown as plain words on one line: links as their text, no emphasis, heading, list or quote mark. */
function flatten(markdown: string): string {
  return markdown
    .replace(LINK, "$2")
    .replace(/```[^\n]*\n?/g, " ")
    .replace(/^\s{0,3}(?:#{1,6}\s+|>\s?|[-*+]\s+|\d+[.)]\s+)/gm, "")
    .replace(/(\*\*|__|~~)(.+?)\1/gs, "$2")
    .replace(/(?<![\w*])([*_])(?=\S)(.+?)(?<=\S)\1(?![\w*])/gs, "$2")
    .replace(/[`*]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** The flattened answer cut, at a word when it can be, to a guest's line: 280 characters and 400 bytes, an ellipsis on a cut one. */
export function excerptOf(markdown: string): string {
  const text = flatten(markdown);
  if (Array.from(text).length <= GUEST_LINE_MAX && Buffer.byteLength(text) <= GUEST_LINE_BYTES) return text;
  let cut = "";
  let [chars, bytes] = [0, 0];
  for (const each of text) {
    bytes += Buffer.byteLength(each);
    chars += 1;
    if (chars > GUEST_LINE_MAX - 1 || bytes > GUEST_LINE_BYTES - 3) break;
    cut += each;
  }
  const space = cut.lastIndexOf(" ");
  return `${(space > cut.length / 2 ? cut.slice(0, space) : cut).trimEnd()}…`;
}
