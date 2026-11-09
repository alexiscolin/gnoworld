// The home's hero (frames 1 to 8): the kicker, the big number, its line and the two big actions. The number counts the people online, as
// the video's "671 ONLINE", and the line the countries those who show theirs name and the worlds drawn (Alexis, 2026-11-04: "Les gens, comme
// la vidéo"); where the server does not say (another universe, a server down), the number counts the worlds the page gives it, as before.
// No sample: none while none is known.
import type { PresencePeople } from "@gnoworld/schemas/indexer";
import { Icon, Kicker } from "@gnoworld/ui";
import { useRef, type CSSProperties, type ReactNode } from "react";
import { Link } from "react-router";
import type { UniverseView } from "../../places.ts";
import { GoExplore } from "./GoExplore.tsx";
import styles from "./Hero.module.css";
import { Lenses } from "../../Lenses.tsx";
import { useSwapped } from "../../swapped.ts";

// ADR-0003 §2, 2a: what a world is, after the count; nothing of it where the universe holds none.
const TALK = ". Each one is a place to talk.";

// The line's count, its figure and its word: the figure's room kept while the number comes (7n). While it comes, a page read with no script
// says "Worlds in", a sentence (F4641); the stylesheet draws the count's word.
const WORLDS = { one: "world", many: "worlds", coming: "Worlds", data: "figure" } as const;

function Count({ count }: { count: number | undefined }) {
  return (
    <strong className={styles["count"]}>
      <span className={styles["figure"]} data-hero={WORLDS.data}>
        {count}
      </span>
      {count === undefined ? (
        <span className={styles["coming"]}>{WORLDS.coming}</span>
      ) : (
        ` ${count === 1 ? WORLDS.one : WORLDS.many}`
      )}
    </strong>
  );
}

/** Who is online once the server said, or "coming" while it is asked. */
export type People = PresencePeople | "coming";

// The people's line, which the number beside it begins (Alexis, 2026-11-09: short, read with the number): "3 people exploring 594 worlds."
function PeopleLine({ people, worlds }: { people: PresencePeople; worlds: number | undefined }) {
  return (
    <h1 className={styles["heading"]} tabIndex={-1}>
      {people.online === 1 ? "person exploring " : "people exploring "}
      <Count count={worlds} />.
    </h1>
  );
}

// The worlds' line, where no server counts people: "18 worlds in Onyx. Each one is a place to talk."
function WorldsLine({ name, worlds, coming }: { name: string; worlds: number | undefined; coming: boolean }) {
  return (
    <>
      <h1 className={styles["heading"]} tabIndex={-1}>
        {worlds === undefined && !coming ? (
          `Worlds in ${name}`
        ) : (
          <>
            <Count count={worlds} />
            {` in ${name}`}
          </>
        )}
      </h1>
      {worlds === 0 ? null : TALK}
    </>
  );
}

// The big number: the people online, "Online" its kicker, or the worlds where no server counts people. A figure space keeps its line while
// none is known: the page does not jump when it comes.
function Big({ people, worlds }: { people: People | undefined; worlds: number | undefined }) {
  const shown = people === undefined ? worlds : people === "coming" ? undefined : people.online;
  return (
    <p className={styles["number"]} data-hero="number">
      {shown ?? "\u2007"}
    </p>
  );
}

/** A system space rests at (7v): its id, its name and how many worlds it holds. */
interface Resting {
  readonly id: string;
  readonly name: string;
  readonly worlds: number | undefined;
}

// A system's name where the number stands, as large as its letters let it be on the hero's width.
function Named({ name }: { name: string }) {
  return (
    <h1
      className={`${styles["name"] ?? ""} truncate`}
      tabIndex={-1}
      style={{ "--_chars": String(name.length) } as CSSProperties}
    >
      {name}
    </h1>
  );
}

// The line: the people online, the worlds where no server counts them, or a system's worlds.
function Line({ universe, worlds, people, coming, system }: HeroProps & { coming: boolean }) {
  if (system !== undefined)
    return (
      <>
        <Count count={system.worlds} />
        {`, a namespace on ${universe.name}.`}
      </>
    );
  return typeof people === "object" ? (
    <PeopleLine people={people} worlds={worlds} />
  ) : (
    <WorldsLine name={universe.name} worlds={worlds} coming={coming} />
  );
}

// The video's pair (frame 4): Go explore filled, then Join the chat, the Earth's general room. A system has none: both lead elsewhere
// (Alexis, 2026-11-09; its views are the header's, D433). The universe marks whether the cosmos stands beside them, where the Earth's label says "Start
// here" to a newcomer.
function Actions({ universe, system, newcomer }: Pick<HeroProps, "universe" | "system" | "newcomer">) {
  if (system !== undefined) return null;
  return (
    <div
      className={styles["actions"]}
      data-hero="actions"
      data-first={newcomer === true ? "" : undefined}
      data-cosmos="none"
    >
      <GoExplore
        places={{ earth: universe.earth.path, worlds: universe.worlds, universe: universe.id }}
        className={styles["action"]}
      />
      <Link to={universe.earth.path} className={styles["action"]} data-call="chat">
        Join the chat
        <Icon name="arrow" />
      </Link>
    </div>
  );
}

// Over the number: who is here, "Online now" in mint with a dot that beats, where the number counts them (D434); else a system's kicker or
// the universe's.
function Lead({ universe, people, system }: HeroProps) {
  return system === undefined && typeof people === "object" ? (
    <p className={`inline-center ${String(styles["online"])}`}>
      <i className={`disc ${String(styles["pulse"])}`} aria-hidden="true" />
      Online now
    </p>
  ) : (
    <Kicker dot={system === undefined ? "warm" : "world"}>
      {system !== undefined ? "gno.land · system" : universe.isDefault ? "gno.land · live now" : universe.name}
    </Kicker>
  );
}

// At the number's right, at its foot, the line, large, over the two actions (Alexis, 2026-11-09: "au-dessus des boutons"); under a
// system's name. The line keeps its figure's room while the number comes (7n); the page's heading is its count.
function Beside(props: HeroProps & { coming: boolean }) {
  return (
    <div className={styles["beside"]}>
      <div className={styles["line"]} data-hero="line">
        <Line {...props} />
      </div>
      <Actions universe={props.universe} system={props.system} newcomer={props.newcomer} />
    </div>
  );
}

interface HeroProps {
  universe: UniverseView;
  worlds: number | undefined;
  people?: People | undefined;
  coming?: boolean;
  newcomer?: boolean | undefined;
  system?: Resting | undefined;
}

/** `coming`: no number yet, but one is on its way (the worlds' count is being read). `people`: who is online, none where no server counts
 * them. `newcomer`: the reader has entered no place yet, so the Earth's label says "Start here", the one filled call (ADR-0003 §3).
 * `system`: the system space rests at, whose name takes the number's place, its worlds the line's and the tags' (the plan space-simple). */
export function Hero(given: HeroProps) {
  const heroRef = useRef<HTMLDivElement>(null);
  // A system that comes or goes: the hero's words, its actions and its tags fade out together, then the new ones fade in (D428).
  const system = useSwapped(given.system?.id ?? "", given.system, heroRef);
  const props = { ...given, system };
  const { universe } = props;
  return (
    <div className={styles["hero"]} data-clear="" data-exit="" ref={heroRef}>
      <Lead {...props} />
      {/* The number, its line and actions at its right, under it where there is no room; or a system's name, its line under it. */}
      <div className={styles["head"]}>
        {system === undefined ? <Big people={props.people} worlds={props.worlds} /> : <Named name={system.name} />}
        <Beside {...props} coming={props.coming ?? false} />
      </div>
      {/* The tags that light space (D425), in place of the markets row. */}
      {/* Space draws the default universe's worlds alone: another's hero has no tags to light them (the plan space-simple). */}
      {universe.isDefault ? <Lenses universe={universe.id} system={system?.id} /> : null}
    </div>
  );
}

/** The universe's worlds, as the page lists them, beside the hero's left edge, under their kicker (ADR-0003, 2d); from 900 px the cosmos's
 * rail stands for them while it stands (7i), and marks them so. */
export function Worlds({ children }: { children: ReactNode }) {
  return (
    <nav aria-label="Worlds" className={styles["worlds"]} data-rail="none" data-exit="">
      <Kicker>Worlds</Kicker>
      {children}
    </nav>
  );
}
