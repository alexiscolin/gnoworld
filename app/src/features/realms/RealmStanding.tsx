// A realm's standing on its plate (D530), in a chunk of its own: the indexer's reads and their schemas stay off the first screen.
import type { StatProps } from "@gnoworld/ui";
import type { Worlds } from "@gnoworld/schemas/indexer";
import { useHere } from "../../useHere.ts";
import { Figures } from "../../Standing.tsx";
import { useLastCalls } from "./useLastCalls.ts";
import { useRealmFacts } from "./useRealmFacts.ts";

type Held = Worlds["worlds"][number]["realms"][number];

const grouped = (n: number): string => n.toLocaleString("en-US");

// The blocks since a block, when both are known and in order: the realm's age, as the indexer has no time (F2950).
const since = (first: number | undefined, tip: number | undefined) =>
  first === undefined || tip === undefined || tip < first ? undefined : tip - first;

const noun = (n: number, one: string, many: string) => (n === 1 ? one : many);

const oldOf = (first: number | undefined, tip: number | undefined): StatProps | undefined => {
  const age = since(first, tip);
  return age === undefined
    ? undefined
    : {
        value: age,
        unit: noun(age, "block", "blocks"),
        caption: `old · block ${grouped(first ?? 0)}`,
        icon: "calendar",
      };
};
const callersOf = (callers: number | null | undefined): StatProps | undefined =>
  callers == null
    ? undefined
    : { value: callers, caption: `${noun(callers, "caller", "callers")} in total`, icon: "at" };
const lastOf = (last: number | null | undefined, tip: number | undefined): StatProps | undefined =>
  last == null || tip === undefined || tip < last
    ? undefined
    : { value: tip - last, unit: noun(tip - last, "block", "blocks"), caption: "since its last call", icon: "chat" };
const hereOf = (here: number): StatProps | undefined =>
  here > 0 ? { value: here, unit: "here", caption: "right now", icon: "people" } : undefined;

// What the realm is doing as figures (D530): its calls the hero once it has some, else its age in blocks; callers, its age, the last
// call and who is here small. Each says what it counts, the singular for one; one no source gave is left out, never a zero.
function figuresOf({ held, first, tip, here }: { held: Held | undefined; first?: number; tip?: number; here: number }) {
  const { callers, calls, lastHeight } = held ?? {};
  const old = oldOf(first, tip);
  const made = (hero: StatProps | undefined, rest: (StatProps | undefined)[], note?: string) => ({
    hero,
    rest: rest.filter((figure) => figure !== undefined),
    note,
  });
  if (calls == null || calls === 0) {
    return made(old, [hereOf(here)], calls === 0 ? "Nobody has called it yet." : undefined);
  }
  const hero: StatProps = { value: calls, caption: `${noun(calls, "call", "calls")} in total`, icon: "spark" };
  return made(hero, [callersOf(callers), old, lastOf(lastHeight, tip), hereOf(here)]);
}

export default function RealmStanding({
  talk,
  held,
  realm,
  indexer,
}: {
  talk: string;
  held: Held | undefined;
  realm: string;
  indexer: string;
}) {
  const here = useHere(true).get(talk) ?? 0;
  const facts = useRealmFacts(indexer, realm);
  const recent = useLastCalls(indexer, realm);
  const first = facts?.ok === true ? facts.value.firstBlock : undefined;
  const tip = recent?.ok === true ? recent.value.tip : undefined;
  return (
    <Figures
      {...figuresOf({ held, here, ...(first === undefined ? {} : { first }), ...(tip === undefined ? {} : { tip }) })}
    />
  );
}
