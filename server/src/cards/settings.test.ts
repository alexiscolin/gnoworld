import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { loadConfig } from "../config.ts";

// L3 (docs/plans/link-previews.md §7 "config.ts", D13906 "off by default", Q11): LINK_CARDS is a kill switch, off unless set, and it needs the
// reader's address; the card thresholds are stricter for `sexual` than the lines'. config.ts is tier 1.
const dir = mkdtempSync(join(tmpdir(), "gnoworld-cards-config-"));
afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});
const pepper = join(dir, "pepper");
writeFileSync(pepper, "a-pepper-of-forty-characters-0123456789\n");
const ENV = { DATABASE: join(dir, "server.db"), LOG_PEPPER_FILE: pepper };

describe("the cards' settings", () => {
  it("are off by default, with no reader and thresholds already stricter on `sexual`", () => {
    const { cards } = loadConfig(ENV);
    expect(cards.enabled).toBe(false);
    expect(cards.readerUrl).toBeUndefined();
    expect(cards.thresholds.sexual).toBe(0.3);
  });

  it("keep an operator's lower `sexual` threshold, and carry the other thresholds over", () => {
    const low = loadConfig({ ...ENV, MODERATION_THRESHOLDS: '{"sexual":0.1,"hate":0.8}' }).cards.thresholds;
    expect(low).toEqual({ sexual: 0.1, hate: 0.8 });
    const high = loadConfig({ ...ENV, MODERATION_THRESHOLDS: '{"sexual":0.9,"hate":0.8}' }).cards.thresholds;
    expect(high).toEqual({ sexual: 0.3, hate: 0.8 });
  });

  it("turn on with LINK_CARDS=1 and the reader's address", () => {
    const { cards } = loadConfig({ ...ENV, LINK_CARDS: "1", LINK_READER_URL: "http://link_reader:8084" });
    expect(cards.enabled).toBe(true);
    expect(cards.readerUrl).toBe("http://link_reader:8084");
  });

  it.each(["0", ""])("take LINK_CARDS=%j as off", (value) => {
    expect(loadConfig({ ...ENV, LINK_CARDS: value, LINK_READER_URL: "http://link_reader:8084" }).cards.enabled).toBe(
      false,
    );
  });

  it.each(["yes", "true", "on", "2"])("refuse LINK_CARDS=%j: a kill switch is 1 or 0, never a guess", (value) => {
    expect(() => loadConfig({ ...ENV, LINK_CARDS: value, LINK_READER_URL: "http://link_reader:8084" })).toThrow();
  });

  it("refuse LINK_CARDS=1 with no reader's address: a switch on with nowhere to read is a mistake to tell at start", () => {
    expect(() => loadConfig({ ...ENV, LINK_CARDS: "1" })).toThrow();
  });

  it.each(["http://link_reader:8084", "http://reader.internal", "http://10.0.0.5:8084"])(
    "accept the reader's address %j",
    (url) => {
      expect(loadConfig({ ...ENV, LINK_CARDS: "1", LINK_READER_URL: url }).cards.readerUrl).toBe(url);
    },
  );

  it.each([
    "https://example.com/",
    "ftp://x",
    "not a url",
    "http://user:pw@link_reader:8084",
    "http://link_reader:8084/path",
  ])("refuse the reader's address %j: only the reader's own origin on the private network", (url) => {
    expect(() => loadConfig({ ...ENV, LINK_CARDS: "1", LINK_READER_URL: url })).toThrow();
  });
});
