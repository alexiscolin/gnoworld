// The home's hero (frames 1 to 8): the kicker, the big number, its line and the two big actions. The number counts the people online, as
// the video's "671 ONLINE", and the line the countries those who show theirs name and the worlds drawn (Alexis, 2026-11-04: "Les gens, comme
// la vidéo"); where the server does not say (another universe, a server down), the number counts the worlds the page gives it, as before.
// No sample: none while none is known.
import type { PresencePeople } from "@gnoworld/schemas/indexer";
import { Icon, Kicker } from "@gnoworld/ui";
import type { ReactNode } from "react";
import { Link } from "react-router";
import type { UniverseView } from "../../places.ts";
import { GoExplore } from "./GoExplore.tsx";
import styles from "./Hero.module.css";
import { Live } from "./Live.tsx";

// ADR-0003 §2, 2a: what a world is, after the count; nothing of it where the universe holds none.
const TALK = ". Each one is a place to talk.";

// The line's count, its figure and its word: the figure's room kept while the number comes (7n). While it comes, a page read with no script
// says "Worlds in", a sentence (F4641); the stylesheet draws the count's word.
const WORLDS = { one: "world", many: "worlds", coming: "Worlds", data: "figure" } as const;
const COUNTRIES = { one: "country", many: "countries", coming: "Countries", data: "countries" } as const;

function Count({ count, words = WORLDS }: { count: number | undefined; words?: typeof WORLDS | typeof COUNTRIES }) {
  return (
    <strong className={styles["count"]}>
      <span className={styles["figure"]} data-hero={words.data}>
        {count}
      </span>
      {count === undefined ? (
        <span className={styles["coming"]}>{words.coming}</span>
      ) : (
        ` ${count === 1 ? words.one : words.many}`
      )}
    </strong>
  );
}

/** Who is online once the server said, or "coming" while it is asked. */
export type People = PresencePeople | "coming";

// The people's line (frame 6): "People in 31 countries, across 18 worlds."; the countries left out while nobody online shows one.
function PeopleLine({ people, worlds }: { people: PresencePeople; worlds: number | undefined }) {
  const { countries } = people;
  return (
    <h1 className={styles["heading"]} tabIndex={-1}>
      {countries === 0 ? (
        "People"
      ) : (
        <>
          {"People in "}
          <Count count={countries} words={COUNTRIES} />
        </>
      )}
      {", across "}
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

// The big number: the people online with "ONLINE" up its side (frame 6, drawn by the stylesheet, so the number's text stays the count), or
// the worlds where no server counts people. A figure space keeps its line while none is known: the page does not jump when it comes.
function Big({ people, worlds }: { people: People | undefined; worlds: number | undefined }) {
  const shown = people === undefined ? worlds : people === "coming" ? undefined : people.online;
  return (
    <p className={styles["number"]} data-hero="number" data-online={typeof people === "object" ? "" : undefined}>
      {shown ?? "\u2007"}
    </p>
  );
}

/** `coming`: no number yet, but one is on its way (the worlds' count is being read). `people`: who is online, none where no server counts
 * them. `newcomer`: the reader has entered no place yet, so the Earth's label says "Start here", the one filled call (ADR-0003 §3). */
export function Hero({
  universe,
  worlds,
  people,
  coming = false,
  newcomer = false,
}: {
  universe: UniverseView;
  worlds: number | undefined;
  people?: People | undefined;
  coming?: boolean;
  newcomer?: boolean;
}) {
  return (
    // The opening's words over the dive take its place while they show (mock-up 1), which the opening marks (ADR-0003 §1).
    <div className={styles["hero"]} data-clear="" data-yield="none">
      <Kicker dot="warm">{universe.isDefault ? "gno.land · live now" : universe.name}</Kicker>
      <Big people={people} worlds={worlds} />
      <div className={styles["row"]}>
        {/* The line keeps its figure's room while the number comes, so the actions beside it stay put (7n). The page's heading is its
            count; what a world is follows it, on the same line. */}
        <div className={styles["line"]} data-hero="line">
          {typeof people === "object" ? (
            <PeopleLine people={people} worlds={worlds} />
          ) : (
            <WorldsLine name={universe.name} worlds={worlds} coming={coming} />
          )}
        </div>
        {/* The video's pair (frame 4): Go explore filled, then Join the chat, the Earth's general room. */}
        {/* The universe marks whether the cosmos stands beside them, where the Earth's label says "Start here" to a newcomer. */}
        <div
          className={styles["actions"]}
          data-hero="actions"
          data-first={newcomer ? "" : undefined}
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
      </div>
      <Live withBlock={universe.isDefault} />
    </div>
  );
}

/** The universe's worlds, as the page lists them, beside the hero's left edge, under their kicker (ADR-0003, 2d); from 900 px the cosmos's
 * rail stands for them while it stands (7i), and marks them so. */
export function Worlds({ children }: { children: ReactNode }) {
  return (
    <nav aria-label="Worlds" className={styles["worlds"]} data-rail="none" data-yield="none">
      <Kicker>Worlds</Kicker>
      {children}
    </nav>
  );
}
