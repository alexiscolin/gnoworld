// The header: the logo at the left; in the middle where one is, Galaxy, System and World, each named by the place it leads to, that world's
// chat, and beside them how one looks at it, Space or Map (D424, D444, shellWays.tsx); at the right the network ("Testnet" when it is one), the search,
// the bell (8c's slot) and the account's menu, which holds the passport. Drawn once the page wakes: a not-found path is served
// the page written at /, which must hydrate as the path's own (F4692). The bars stay over the full chat, which they open and close.
import { Cluster, Logo } from "@gnoworld/ui";
import { Fragment, useRef } from "react";
import { Link, useLocation } from "react-router";
import { useWoken } from "./features/home/clock.ts";
import { asksFull } from "./fullChat.ts";
import { AccountMenu } from "./features/account/index.ts";
import { Network } from "./features/account/Network.tsx";
import { useViewsIndicator } from "./viewsIndicator.ts";
import { SearchButton, SearchPalette } from "./features/search/index.ts";
import { site, type UniverseView, type View } from "./places.ts";
import { ChatWay, levelsOf, useSeenPlaces, Ways, type Level } from "./shellWays.tsx";
import { BellSlot } from "./slots.tsx";
import { useApp } from "./storeContext.tsx";
import styles from "./shellHeader.module.css";

// The search, the bell and the account's menu.
function Account({ universe }: { universe: UniverseView }) {
  return (
    <Cluster space="2xs">
      <SearchButton className={styles["wideSearch"] ?? ""} emphasis="outline" />
      <BellSlot />
      <AccountMenu
        universe={universe.id}
        network={<Network name={universe.name} testnet={universe.testnet} inPill />}
      />
    </Cluster>
  );
}

// A level: its mark, colourless (stars, a sun, a planet), its word and the name of the place it leads to, in a pill of its own (D444);
// in the full chat the name folds into the word, the bar steady as rooms and worlds change (D503). One past the level in view is a place
// this tab saw, not one that holds it: dimmed, its mark hollow.
function LevelLink({
  level,
  current,
  beyond,
  bare,
}: {
  level: Level;
  current: View | undefined;
  beyond: boolean;
  bare: boolean;
}) {
  return (
    <Link
      to={level.path}
      className={`no-edge ${String(styles["view"])}`}
      aria-current={level.view === current ? "page" : undefined}
      aria-description={level.holds}
      data-beyond={beyond ? "" : undefined}
      data-bare={bare ? "" : undefined}
      // A phone shows the galaxy's mark alone: its word stays its name.
      aria-label={level.name === undefined ? level.label : undefined}
    >
      <i className={styles["mark"]} data-level={level.view} aria-hidden="true" />
      {level.name === undefined ? (
        <span className={styles["word"]}>{level.label}</span>
      ) : (
        <span className={styles["named"]}>
          <small className={styles["level"]}>{level.label}</small>
          {/* A system's namespace in mono, as an address is read; a world's name in the interface's face, a weight over. */}
          <span className={`${styles["name"] ?? ""} truncate`} data-level={level.view}>
            {level.name}
          </span>
        </span>
      )}
    </Link>
  );
}

export function ShellHeader({ universe }: { universe: UniverseView }) {
  const { pathname, search } = useLocation();
  // In the full chat the cream is Chat's: no level is in view, each leaves the chat for its place in space.
  const full = asksFull(new URLSearchParams(search));
  const current = full ? undefined : site.viewAt(universe, pathname);
  const woken = useWoken();
  // The session known, the account's pill or the way in names the network (D330, D340): the header's own row waits for it alone.
  const pilled = useApp(({ login }) => login.session.kind !== "unknown");
  const barRef = useRef<HTMLElement>(null);
  useViewsIndicator(barRef, full ? "chat" : current, woken);
  const { levels, world } = levelsOf(universe, pathname);
  const at = levels.findIndex((level) => level.view === current);
  useSeenPlaces(universe, pathname);
  return (
    <header className={styles["header"]}>
      <Link to="/" className={styles["logo"]} aria-label="gnoworld">
        <Logo wordmark />
      </Link>
      <div className={styles["bars"]}>
        <nav aria-label="Views" className={`${styles["views"] ?? ""} control-bar`} ref={barRef}>
          <span className={styles["fill"]} aria-hidden="true" />
          {levels.map((level, index) => (
            // Drawn anew once the page wakes: a path served the page written at / hydrates the light that page holds, as hydration
            // patches no attribute (react-dom 19.3.1), and a new link takes the path's own (F4880).
            <Fragment key={`${level.view}:${String(woken)}`}>
              {index === 0 ? null : <span className={styles["chevron"]} aria-hidden="true" />}
              <LevelLink level={level} current={current} beyond={at !== -1 && index > at} bare={full} />
            </Fragment>
          ))}
          <ChatWay key={String(woken)} world={world} />
          {/* A phone's search, in the pill as it was: the account's row has no room for it at 320 px. */}
          <span className={`${styles["divider"] ?? ""} ${styles["phoneSearch"] ?? ""}`} aria-hidden="true" />
          <SearchButton className={`round-controls ${styles["phoneSearch"] ?? ""}`} emphasis="plain" />
        </nav>
        {/* Drawn anew once the page wakes, as the levels are (F4880). */}
        <Ways key={String(woken)} world={current === "world"} />
      </div>
      <SearchPalette universe={universe} />
      <div className={styles["end"]}>
        <p className={`${styles["network"] ?? ""} ${pilled ? (styles["pilled"] ?? "") : ""}`}>
          <Network name={universe.name} testnet={universe.testnet} />
        </p>
        {/* One item of the phone's header row: the controls with the account; the network and the account, whose menu holds the
            passport, never drop (DESIGN-SYSTEM.md, Layout). */}
        <Account universe={universe} />
      </div>
    </header>
  );
}
