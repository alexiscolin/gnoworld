// The header as the video's frames 1, 20 and 37 draw it: the logo at the left, the views Earth, Cosmos and List in the middle
// with search inside their pill, the network the page is in ("Testnet" when it is one) and the login at the right. A control
// stands here only when it works: Jarvis, chat, the passport and the bell join as their slices land.
import { Chip, Icon, Logo } from "@gnoworld/ui";
import { Link, useLocation } from "react-router";
import { LoginControl } from "./features/login/index.ts";
import { SearchPalette } from "./features/search/index.ts";
import { site, type UniverseView, type View } from "./places.ts";
import styles from "./shellHeader.module.css";

export function ShellHeader({ universe }: { universe: UniverseView }) {
  const current = site.viewAt(universe, useLocation().pathname);
  // The list has no page of its own in a universe: it is the one page of the site.
  const views: { view: View; label: string; path: string }[] = [
    { view: "earth", label: "Earth", path: universe.earth.path },
    { view: "cosmos", label: "Cosmos", path: universe.home.path },
    { view: "list", label: "List", path: "/list" },
  ];
  return (
    <header className={styles["header"]}>
      <Link to="/" className={styles["logo"]} aria-label="gnoworld">
        <Logo wordmark />
      </Link>
      <nav aria-label="Views" className={styles["views"]}>
        {views.map((view) => (
          <Link
            key={view.view}
            to={view.path}
            className={styles["view"]}
            aria-current={view.view === current ? "page" : undefined}
          >
            {view.label}
          </Link>
        ))}
        <span className={styles["divider"]} aria-hidden="true" />
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
        <LoginControl universe={universe.id} />
      </div>
    </header>
  );
}
