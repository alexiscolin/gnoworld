import fc from "fast-check";
import { describe, expect, it } from "vitest";
import type { Rules } from "../roles/roles.ts";
import { ruleVerdict } from "./rules.ts";

const RULES: Rules = {
  bannedWords: ["spam", "Scam Coin", "c++", "a.b", "(x", ".*", "́", "​", "Spàm"],
  linksPerMessage: 3,
  mentionsPerMessage: 5,
  linksForNewAccount: 2,
};
const OLD = { newAccount: false };
const NEW = { newAccount: true };
const links = (n: number): string => Array.from({ length: n }, (_, i) => `https://e${String(i)}.test/x`).join(" ");
const ADDRESS = "g1jg8mtutu9khhfwc4nxmuhcpftf0pajdhfvsqf5";
const mentions = (n: number): string =>
  Array.from({ length: n }, (_, i) => (i % 2 === 0 ? `@name${String(i)}` : ADDRESS)).join(" ");

describe("the rules' banned words", () => {
  it.each([
    ["the word itself", "this is spam"],
    ["in capitals", "this is SPAM"],
    ["in full-width letters", "this is ｓｐａｍ"],
    ["with an accent", "this is spàm"],
    ["with a zero-width space inside", "sp​am"],
    ["a banned phrase, its spaces as typed", "buy scam  coin now"],
    ["at the end, before punctuation", "spam!"],
    ["before an apostrophe", "spam's"],
    ["after a hyphen", "anti-spam"],
    ["before an underscore, which is no letter", "spam_x"],
    ["a word with signs, as written", "learn c++ today"],
    ["a word with a dot, as written", "the a.b plan"],
  ])("hides %s", (_, text) => {
    expect(ruleVerdict(text, RULES, OLD)).toBe("banned_word");
  });

  it.each([
    ["a longer word that holds it", "spammer and spamming"],
    ["a word it is part of, across a hyphen", "anti-spamfilter"],
    ["a letter of another script against it", "яspam"],
    ["a digit against it", "spam1"],
    ["a dot read as any letter", "the axb plan"],
    ["a word that is only an accent or a zero-width space", "plain words"],
    ["no banned word", "hello world"],
  ])("leaves %s", (_, text) => {
    expect(ruleVerdict(text, RULES, OLD)).toBeUndefined();
  });

  it("never throws, and finishes, whatever the text", () => {
    fc.assert(
      fc.property(fc.string({ unit: "binary", maxLength: 2000 }), (text) => {
        expect(() => ruleVerdict(text, RULES, OLD)).not.toThrow();
      }),
    );
    expect(ruleVerdict(`${"a ".repeat(50_000)}spam`, RULES, OLD)).toBe("banned_word");
    expect(ruleVerdict("\uD800 spam", RULES, OLD)).toBe("banned_word");
  });
});

describe("the rules' banned words as the file writes them", () => {
  it("finds a word the file wrote with spaces around it", () => {
    expect(ruleVerdict("spam", { ...RULES, bannedWords: [" spam "] }, OLD)).toBe("banned_word");
  });
});

describe("the rules' banned words in scripts written without spaces", () => {
  it("finds a word of Chinese, Japanese or Thai inside a sentence, and nothing it does not hold", () => {
    const rules = { ...RULES, bannedWords: ["广告", "スパム", "โฆษณา"] };
    const texts = ["这是广告内容", "これはスパムです", "นี่คือโฆษณานะ", "这是内容"];
    expect(texts.map((text) => ruleVerdict(text, rules, OLD))).toEqual([
      "banned_word",
      "banned_word",
      "banned_word",
      undefined,
    ]);
  });

  it("finds either kind in a world that bans both, each line holding one", () => {
    const rules = { ...RULES, bannedWords: ["spam", "广告"] };
    expect(["buy spam now", "这是广告内容", "fine words"].map((text) => ruleVerdict(text, rules, OLD))).toEqual([
      "banned_word",
      "banned_word",
      undefined,
    ]);
  });
});

describe("the rules' links and mentions", () => {
  it("allows the links a message may carry, and hides one more", () => {
    expect(ruleVerdict(links(3), RULES, OLD)).toBeUndefined();
    expect(ruleVerdict(links(4), RULES, OLD)).toBe("links");
    expect(ruleVerdict("see www.e.test and www.f.test and www.g.test and www.h.test", RULES, OLD)).toBe("links");
  });

  it("counts a link however it is written, and once each", () => {
    const four = (link: string) => [1, 2, 3, 4].map((n) => link.replace("N", String(n))).join(" ");
    expect(ruleVerdict(four("HTTPS://N.TEST"), RULES, OLD)).toBe("links");
    expect(ruleVerdict(four("http://N.test"), RULES, OLD)).toBe("links");
    expect(ruleVerdict(four("ｈｔｔｐｓ：／／N.test"), RULES, OLD)).toBe("links");
    expect(ruleVerdict("https://www.a.test https://www.b.test https://www.c.test", RULES, OLD)).toBeUndefined();
  });

  it("counts each link written, however they are joined: a comma, a slash, one inside another's address", () => {
    const two = { ...RULES, linksPerMessage: 2 };
    expect(ruleVerdict("http://a.test,http://b.test,http://c.test", two, OLD)).toBe("links");
    expect(ruleVerdict("www.a.test,www.b.test,www.c.test", two, OLD)).toBe("links");
    expect(ruleVerdict("https://a.test/?u=http://x.test https://b.test", two, OLD)).toBe("links");
    expect(ruleVerdict("https://a.test/www.b https://c.test", two, OLD)).toBe("links");
    expect(ruleVerdict("https://www.a.test https://www.b.test", two, OLD)).toBeUndefined();
  });

  it("leaves a bare domain uncounted: no scheme, no www (a known limit)", () => {
    expect(ruleVerdict("gno.land/r/a bit.ly/b c.test d.test", RULES, OLD)).toBeUndefined();
  });

  it("allows the mentions a message may carry, @names and addresses alike, and hides one more", () => {
    expect(ruleVerdict(mentions(5), RULES, OLD)).toBeUndefined();
    expect(ruleVerdict(mentions(6), RULES, OLD)).toBe("mentions");
    expect(ruleVerdict("@a @a @a @a @a @a", RULES, OLD)).toBe("mentions");
  });

  it("counts no email address or short g1 word as a mention", () => {
    expect(ruleVerdict("a@b.test c@d.test e@f.test g@h.test i@j.test k@l.test g1ven", RULES, OLD)).toBeUndefined();
  });

  it("counts a mention after punctuation, and still no email address", () => {
    expect(ruleVerdict("@a,@b,@c,@d,@e,@f", RULES, OLD)).toBe("mentions");
    expect(ruleVerdict("(@a) (@b) (@c) (@d) (@e) .@f", RULES, OLD)).toBe("mentions");
    expect(ruleVerdict("a@b.test,c@d.test,e@f.test,g@h.test,i@j.test,k@l.test", RULES, OLD)).toBeUndefined();
  });

  it("allows a new account fewer links: two, not three", () => {
    expect(ruleVerdict(links(2), RULES, NEW)).toBeUndefined();
    expect(ruleVerdict(links(3), RULES, NEW)).toBe("new_account_links");
    expect(ruleVerdict(links(4), RULES, NEW)).toBe("new_account_links");
  });

  it("holds a new account to the general limit where its own is the larger", () => {
    const generous: Rules = { ...RULES, linksForNewAccount: 5 };
    expect(ruleVerdict(links(4), generous, NEW)).toBe("links");
  });

  it("names the first rule a message breaks: banned words, then links, then mentions", () => {
    expect(ruleVerdict(`spam ${links(4)}`, RULES, OLD)).toBe("banned_word");
    expect(ruleVerdict(`${links(4)} ${mentions(6)}`, RULES, OLD)).toBe("links");
    expect(ruleVerdict(`${links(3)} ${mentions(6)}`, RULES, NEW)).toBe("new_account_links");
  });

  it("applies a world's own rules: no banned word, no limit set to zero", () => {
    const strict: Rules = { bannedWords: [], linksPerMessage: 0, mentionsPerMessage: 0, linksForNewAccount: 0 };
    expect(ruleVerdict("spam", strict, OLD)).toBeUndefined();
    expect(ruleVerdict(links(1), strict, OLD)).toBe("links");
    expect(ruleVerdict("@someone", strict, OLD)).toBe("mentions");
  });
});

describe("the rules on a line's way in (3k)", () => {
  it("hide a line too fast, and an edit of a line not the author's, before any other rule", () => {
    expect(ruleVerdict("spam", RULES, { ...OLD, tooFast: true })).toBe("too_fast");
    expect(ruleVerdict("spam", RULES, { ...OLD, foreignEdit: true })).toBe("not_their_edit");
    expect(ruleVerdict("spam", RULES, { ...OLD, unknownEdit: true })).toBe("unknown_edit");
    expect(ruleVerdict("hello", RULES, { ...OLD, tooFast: true, foreignEdit: true })).toBe("too_fast");
    expect(ruleVerdict("hello", RULES, { ...OLD, tooFast: false, foreignEdit: false })).toBeUndefined();
  });
});
