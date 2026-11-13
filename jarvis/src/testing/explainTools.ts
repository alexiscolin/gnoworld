// The tools of a function's explanation as the entry wires them (D13920), for the tests of the toolbox and the loops: two chain
// profiles, gnomcp's reads and gnoscope's a fake that says who ran, the places of a data folder of the test's own.
import { fileURLToPath } from "node:url";
import { vi } from "vitest";
import type { Ran } from "../gnomcp.ts";
import { loadSkills } from "../skills.ts";
import { toolbox } from "../toolbox.ts";
import { cardTools } from "../tools/cards.ts";
import { gnoscopeTools } from "../tools/gnoscopeTools.ts";
import { loadPlaces, placesTool } from "../tools/places.ts";
import { capture } from "./kit.ts";
import { placesData } from "./placesData.ts";

export const data = placesData();
export const said = (words: string): Ran => ({ ok: true, text: words, isError: false });
export type Read = (name: string, args: unknown) => Promise<Ran>;

export const explainBox = (read: Read = (name) => Promise.resolve(said(`ran ${name}`))) => {
  const { log } = capture();
  const places = loadPlaces(data.folderOf());
  const profiles = { chains: ["onyx", "gnoland"], indexed: ["onyx"] };
  const calls = vi.fn<Read>(read);
  const cards = cardTools({ chains: profiles.chains, places, read: vi.fn(() => Promise.resolve(said("read"))) });
  const box = toolbox({
    profiles,
    gnomcp: { call: calls },
    skills: loadSkills(fileURLToPath(new URL("../../skills", import.meta.url))),
    places: placesTool(places),
    cards,
    gnoscope: { definitions: gnoscopeTools(["mainnet", "onyx"]), call: calls },
    log,
  });
  return { box, calls };
};
