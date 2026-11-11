// The asks refused without a model (D13985): a long piece of writing (a poem, an essay, a story, 500 words or more), code
// of another language or stack with no gno, realm or package named, a long text pasted to translate, an instruction to
// ignore its instructions, a link written as a link to a host off the list. Bypassable by design: a determined asker
// rewords, and the day's caps (strikes, share, room) catch the rest. Left to the model: code with no language named, a short
// piece of writing, a bare dotted name that looks like a host (`ufmt.Sprintf`, `main.gno`), a host written without a scheme.
const WRITE =
  /\b(?:write|compose|draft|generate|create|tell)\b(?:\W+\w+){0,3}?\W+(?:poems?|essays?|stor(?:y|ies)|articles?|novels?|haiku|sonnets?|lyrics)\b/i;
const WORDS = /\b(\d[\d,]*)[\s-]*words?\b/gi;
const OTHER =
  /\b(?:python|javascript|typescript|java|rust|solidity|ruby|php|sql|html|css|react|golang|bash|swift|kotlin|c\+\+|c#)\b|\bGo\b/i;
const CODE = /\b(?:write|give|show|generate|create|code|script|implement|program|snippet|contract)\b/i;
const GNO = /\b(?:gno|realms?|packages?)\b|gno\.land/i;
const PASTED = 300;
const IGNORE =
  /\b(?:ignore|disregard|forget|override)\s+(?:(?:all|any|your|the|my|these|those|previous|prior|earlier|above|system|of|and|everything)\s+)*(?:instructions?|prompts?|rules|directives?|guidelines?)\b|\b(?:ignore|disregard|forget)\s+all\s+(?:previous|prior|earlier|above)\b/i;
// A link as a link: a scheme and `//`, a bare `//`, or `www.`; its host is what follows the last `@` of its authority.
const LINK = /\b[a-z][a-z0-9+.-]*:\/\/[^\s/?#]*|(?<![\w/:.])\/\/[^\s/?#]*|(?<![\w.@/-])www\.[^\s/?#]*/gi;

// A link's host as a browser reads it: its authority is what follows its scheme, and a backslash ends it.
const hostOf = (link: string): string | undefined =>
  URL.parse(link.startsWith("www.") ? `https://${link}` : link, "https://base.invalid")?.hostname.replace(/\.$/, "");

const words = (question: string): boolean =>
  [...question.matchAll(WORDS)].some(([, count]) => Number((count ?? "").replaceAll(",", "")) >= 500);

// ponytail: a text's length in UTF-16 units, near its code points for a pasted document.
const pasted = (question: string): boolean => /\btranslat/i.test(question) && question.length > PASTED;

const offTheList = (question: string, hosts: readonly string[]): boolean =>
  [...question.matchAll(LINK)].some((match) => {
    const host = hostOf(match[0]);
    return host === undefined || host === "" || !hosts.some((listed) => host === listed || host.endsWith(`.${listed}`));
  });

const otherCode = (question: string): boolean => CODE.test(question) && OTHER.test(question) && !GNO.test(question);

export function refusedWithoutModel(question: string, hosts: readonly string[]): boolean {
  return (
    WRITE.test(question) ||
    words(question) ||
    otherCode(question) ||
    pasted(question) ||
    IGNORE.test(question) ||
    offTheList(question, hosts)
  );
}
