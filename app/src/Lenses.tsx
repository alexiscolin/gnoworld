// The tags at the hero's foot (D425), in place of the markets row: plain words at rest, cream with its count and × when picked (the counts
// at rest are More's); Live's amber dot while someone is in a world. One at a time; the light is space's and the rail's
// (lenses.ts). The row keeps its height whatever it holds, and fades in once the worlds' file is read: nothing above it moves.
import { PHONE_QUERY } from "@gnoworld/core";
import { Icon, Menu, type IconName } from "@gnoworld/ui";
import { useEffect } from "react";
import { useApp } from "./storeContext.tsx";
import { worldsFollowedIn } from "./features/follow/index.ts";
import {
  lensName,
  MORE,
  pickLens,
  setFollowing,
  SHOWN,
  startLenses,
  useLens,
  useLit,
  type LensId,
  type Lit,
} from "./lenses.ts";
import { inSystem } from "./features/universe/views.ts";
import appear from "./enter.module.css";
import styles from "./Lenses.module.css";

// How many worlds `lens` lights, of `system`'s alone where space rests at one.
function reach(lit: Lit, lens: LensId, system: string | undefined): number {
  const set = lit.sets.get(lens);
  if (set === undefined) return 0;
  return system === undefined ? set.size : [...set].filter((id) => inSystem(id, system)).length;
}

// Each tag's mark, the design system's own (Alexis, 2026-11-09: "plus gros et peut-être avec icône"); Live's is its dot, amber while someone
// is in a world.
const ICONS: Record<Exclude<LensId, "live">, IconName> = {
  active: "spark",
  games: "star",
  tokens: "seal",
  dao: "people",
  social: "chat",
  nft: "image",
  defi: "orbits",
  markets: "chart",
  identity: "key",
  ai: "comet",
  following: "bookmark",
};

function Tag({ lens, count, on, live }: { lens: LensId; count: number; on: boolean; live: boolean }) {
  return (
    <button
      type="button"
      className={`inline-center pill-ends pointer ${String(styles["tag"])} ${String(appear["enter"])}`}
      aria-pressed={on}
      onClick={() => {
        pickLens(on ? undefined : lens);
      }}
    >
      {lens === "live" ? (
        <i className={`disc ${String(styles["live"])}`} data-on={live ? "" : undefined} aria-hidden="true" />
      ) : (
        <Icon name={ICONS[lens]} />
      )}
      {lensName(lens)}
      {/* The count and the × grow in on the picked tag alone, so the row slides, never jumps, and a hover moves nothing. */}
      <span className={`with-icon ${String(styles["count"])}`} aria-hidden={!on}>
        {count}
        <Icon name="close" />
      </span>
    </button>
  );
}

// The kinds behind More, each with its count; picked, it joins the row as a tag.
function More({ lit, count }: { lit: Lit | undefined; count: (lens: LensId) => number }) {
  const more = lit === undefined ? [] : MORE.filter((each) => count(each) > 0);
  // Its trigger drawn as a tag: the row's words at one size (Lenses.module.css's .more).
  return more.length === 0 ? null : (
    <span className={styles["more"]}>
      <Menu
        trigger="More"
        label="More to light up"
        emphasis="plain"
        items={more.map((each) => ({
          label: `${lensName(each)} · ${String(count(each))}`,
          onSelect: () => {
            pickLens(each);
          },
        }))}
      />
    </span>
  );
}

export function Lenses({ universe, system }: { universe: string; system?: string | undefined }) {
  const lens = useLens();
  const lit = useLit();
  const followed = useApp((state) => worldsFollowedIn(state.device.follows, universe).join("\n"));
  // The worlds' file is read at once on a computer, where space reads it anyway; on a phone, whose home preloads none of it, at the reader's
  // first touch, so a phone that only looks pays nothing (the hero never asked it before, worldsFile.ts).
  useEffect(() => {
    if (!matchMedia(PHONE_QUERY).matches) {
      startLenses();
      return undefined;
    }
    const controller = new AbortController();
    for (const kind of ["pointerdown", "keydown", "scroll"])
      addEventListener(kind, startLenses, { once: true, passive: true, signal: controller.signal });
    return () => {
      controller.abort();
    };
  }, []);
  useEffect(() => {
    setFollowing(followed === "" ? [] : followed.split("\n"));
  }, [followed]);
  const count = (each: LensId) => (lit === undefined ? 0 : reach(lit, each, system));
  // Live always stands, its dot saying whether anyone is here; a kind that lights nothing never shows; a picked one of More joins them.
  const shown = SHOWN.filter((each) => each === "live" || count(each) > 0);
  const tags = lens !== undefined && MORE.includes(lens) ? [...shown, lens] : shown;
  return (
    <div className={styles["lenses"]} data-ready={lit === undefined ? undefined : ""}>
      <div role="toolbar" aria-label="Light up worlds" className={`scroll-row ${styles["row"] ?? ""}`}>
        {tags.map((each) => (
          <Tag
            key={each}
            lens={each}
            count={count(each)}
            on={each === lens}
            live={each === "live" && count("live") > 0}
          />
        ))}
        <More lit={lit} count={count} />
        {/* The row's end, under the scroll-row's fade: More stands clear of it, a cut tag still fades as the row scrolls. */}
        <span className={styles["end"]} aria-hidden="true" />
      </div>
    </div>
  );
}
