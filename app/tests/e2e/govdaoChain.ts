// GovDAO's chain as the journeys read it: its realm's page RECORDED on onyx-1 (tests/chain/recorded: its first line is the recording's own
// comment), and, for its pinned Vote (D271), the realm's functions, NOT recorded, written in the shape of vm/qfuncs.
import { readFileSync } from "node:fs";
import { queryEnvelope, statusEnvelope } from "@gnoworld/chain/testing/envelopes";
import { realmType } from "@gnoworld/core";
import { hydrated, type Page } from "./fixtures.ts";
import { scriptedErgo } from "./scripted.ts";

export const RPC = "https://rpc.onyx.testnets.gno.land/**";
export const HOME = readFileSync(new URL("../chain/recorded/onyx-1-gov-dao-home.md", import.meta.url), "utf8")
  .split("\n")
  .slice(1)
  .join("\n");
export const CORS = { "access-control-allow-origin": "*", "content-type": "application/json" };

const field = (Name: string, Type: string) => ({ Name, Type, Value: "" });
const VOTING = [
  {
    FuncName: "MustVoteOnProposalSimple",
    Params: [{ Name: "cur", Type: realmType(), Value: "" }, field("pid", "int64"), field("option", "string")],
    Results: null,
  },
];

/** GovDAO's page open at `width`, its chain answering its page and `functions`, its chat's #govdao a visitor's with no line. */
export async function openGovdao(page: Page, width: number, functions: unknown = VOTING): Promise<void> {
  await page.setViewportSize({ width, height: width < 600 ? 844 : 1080 });
  await page.route(RPC, (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/status")
      return route.fulfill({ headers: CORS, body: JSON.stringify(statusEnvelope(796379, "2026-10-31T09:46:00Z")) });
    const asked = decodeURIComponent(url.searchParams.get("path") ?? "");
    const data = asked.includes("qfuncs") ? JSON.stringify(functions) : HOME;
    return route.fulfill({ headers: CORS, body: JSON.stringify(queryEnvelope({ data })) });
  });
  await page.routeWebSocket(/\/ws$/, (ergo) => {
    scriptedErgo(ergo, "guest-zzzzzz", { room: "#govdao", history: [] });
  });
  await page.goto("/w/govdao");
  await hydrated(page);
}
