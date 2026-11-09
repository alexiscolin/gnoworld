import { describe, expect, it } from "vitest";
import { STYLES, styleOf, type StyleId } from "./styles.ts";

const realm = (path: string, functions: string[] = [], imports: string[] = []) => ({ path, functions, imports });
const styles = (...args: Parameters<typeof realm>): readonly StyleId[] => styleOf(realm(...args));

describe("styleOf", () => {
  it("reads a game from its name or its moves", () => {
    expect(styles("gno.land/r/me/connect4_v2")).toContain("games");
    expect(styles("gno.land/r/me/x", ["JoinPvpLobby"])).toContain("games");
    expect(styles("gno.land/r/me/x", ["Play"])).toContain("games");
  });

  it("reads tokens, NFTs and DeFi from what a realm imports", () => {
    expect(styles("gno.land/r/me/x", ["BalanceOf", "Transfer", "TotalSupply"])).toContain("tokens");
    expect(styles("gno.land/r/me/x", [], ["gno.land/p/nt/grc20/v0"])).toContain("tokens");
    expect(styles("gno.land/r/me/x", [], ["gno.land/p/nt/grc721/v0"])).toContain("nft");
    expect(styles("gno.land/r/me/x", ["TokenURI"])).toContain("nft");
    expect(styles("gno.land/r/me/x", [], ["gno.land/r/gnoland/wugnot"])).toContain("defi");
    expect(styles("gno.land/r/me/pool")).toContain("defi");
  });

  it("reads governance, identity, markets, social and agents", () => {
    expect(styles("gno.land/r/me/x", ["Propose", "Vote"])).toContain("dao");
    expect(styles("gno.land/r/me/x", [], ["gno.land/r/gov/dao/v3/impl"])).toContain("dao");
    expect(styles("gno.land/r/me/x", [], ["gno.land/r/sys/users"])).toContain("identity");
    expect(styles("gno.land/r/me/x", ["Buy", "List"])).toContain("markets");
    expect(styles("gno.land/r/me/guestbook")).toContain("social");
    expect(styles("gno.land/r/me/x", ["Post"])).toContain("social");
    expect(styles("gno.land/r/me/helper_agent")).toContain("ai");
  });

  it("reads a lab from its name", () => {
    expect(styles("gno.land/r/me/counter")).toEqual(["lab"]);
    expect(styles("gno.land/r/me/probe_v2")).toContain("lab");
  });

  it("matches a short word whole only, and a version directory by the name before it", () => {
    expect(styles("gno.land/r/me/chain")).toEqual([]);
    expect(styles("gno.land/r/me/mail")).toEqual([]);
    expect(styles("gno.land/r/gnoswap/pool/v1")).toContain("defi");
  });

  it("leaves a realm no rule reads with no style, and lists every style once", () => {
    expect(styles("gno.land/r/me/zzz")).toEqual([]);
    expect(new Set(STYLES.map(({ id }) => id)).size).toBe(STYLES.length);
  });
});
