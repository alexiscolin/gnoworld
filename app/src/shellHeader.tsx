// The header as the video's frames 1, 20 and 37 draw it: the logo at the left, the views Earth, Cosmos and List in the middle
// with search inside their pill, the network the page is in ("Testnet" when it is one) and the login at the right. A control
// stands here only when it works: Jarvis, chat, the passport and the bell join as their slices land. On the cosmos, the pill's
// views say where one looks, two icons after them how, shown while a scene runs (7v; on a phone apart from the bar, F4691), and
// drawn once the page wakes: a not-found path is served the page written at /, which must hydrate as the path's own (F4692).
import { Chip, Icon, Logo } from "@gnoworld/ui";
import { Link, useLocation } from "react-router";
import { useWoken } from "./features/home/clock.ts";
import { LoginControl } from "./features/login/index.ts";
import { SearchPalette } from "./features/search/index.ts";
// The switch's own module, not the universe's door: the header is on every page, which loads no scene's door for it.
import { ViewSwitch } from "./features/universe/ViewSwitch.tsx";
import { site, type UniverseView, type View } from "./places.ts";
import styles from "./shellHeader.module.css";

export function ShellHeader({ universe }: { universe: UniverseView }) {
  const current = site.viewAt(universe, useLocation().pathname);
  const woken = useWoken();
  // The list has no page of its own in a universe: it is the one page of the site. Each view says what it holds to a screen reader alone;
  // nothing is drawn under the tabs (ADR-0003, 2c).
  const views: { view: View; label: string; path: string; holds: string }[] = [
    { view: "earth", label: "Earth", path: universe.earth.path, holds: "where everyone talks" },
    { view: "cosmos", label: "Cosmos", path: universe.home.path, holds: "every world" },
    { view: "list", label: "List", path: "/list", holds: "every world, as text" },
  ];
  return (
    <header className={styles["header"]}>
      <Link to="/" className={styles["logo"]} aria-label="gnoworld">
        <Logo wordmark />
      </Link>
      <nav aria-label="Views" className={`${styles["views"] ?? ""} control-bar`}>
        {views.map((view) => (
          <Link
            key={view.view}
            to={view.path}
            className={styles["view"]}
            aria-current={view.view === current ? "page" : undefined}
            aria-description={view.holds}
          >
            {view.label}
          </Link>
        ))}
        <span className={styles["divider"]} aria-hidden="true" />
        {current === "cosmos" && woken ? (
          <ViewSwitch>
            <span className={styles["divider"]} aria-hidden="true" />
          </ViewSwitch>
        ) : null}
        <SearchPalette />
      </nav>
      <div className={styles["end"]}>
        <p className={styles["network"]}>
          {universe.name}
          {universe.testnet ? (
            <span className={styles["caution"]}>
              <Icon name="warning" />
              <Chip tone="warm">Testnet</Chip>
            </span>
          ) : null}
        </p>
        <LoginControl />
      </div>
    </header>
  );
}
