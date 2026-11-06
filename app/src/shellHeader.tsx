// The header as the video's frames 1, 20, 37 and 93 draw it: the logo at the left, the views Earth, Universe and List in the middle
// with search inside their pill; at the right the network ("Testnet" when it is one), Jarvis (slice 10: coming soon), the chat, the
// passport's counter, the bell (8c's slot) and the account's menu. On the cosmos, the pill's
// views say where one looks, two icons after them how, shown while a scene runs (7v; on a phone apart from the bar, F4691), and
// drawn once the page wakes: a not-found path is served the page written at /, which must hydrate as the path's own (F4692).
import { Button, Chip, Cluster, ComingSoon, Icon, Logo } from "@gnoworld/ui";
import { Link, useLocation } from "react-router";
import { setCosmosChat, useCosmosChat } from "./cosmosChat.ts";
import { useWoken } from "./features/home/clock.ts";
import { useDeviceView } from "./deviceViews.ts";
import { AccountMenu } from "./features/account/index.ts";
import { PassportCounter } from "./features/passport/Counter.tsx";
import { SearchPalette } from "./features/search/index.ts";
// The switch's own module, not the universe's door: the header is on every page, which loads no scene's door for it.
import { ViewSwitch } from "./features/universe/ViewSwitch.tsx";
// The count alone, from its own module: the header reads what the home or the scene read, and asks for nothing.
import { useWorldsDrawn } from "./features/universe/worldsDrawn.ts";
import { site, type UniverseView, type View } from "./places.ts";
import { BellSlot } from "./slots.tsx";
import styles from "./shellHeader.module.css";

// The chat's pill, cream while the chat is docked (frame 23): a link to the Earth's chat, but on the cosmos, where the chat docks over the
// scene (frame 143) and the pill opens and shuts it.
function ChatPill({ universe, current }: { universe: UniverseView; current: View | undefined }) {
  const { pathname } = useLocation();
  const woken = useWoken();
  const open = useCosmosChat();
  if (current === "cosmos" && woken)
    return (
      <Button
        icon="chat"
        emphasis={open ? "solid" : "outline"}
        onClick={() => {
          setCosmosChat(!open);
        }}
      >
        Chat
      </Button>
    );
  const docked = current === "earth" || /\/w\/[^/]+$/.test(pathname);
  // Drawn anew once the page wakes, as the views are: a path served another page's markup keeps its light otherwise (F4880).
  return (
    <Button key={String(woken)} href={universe.earth.path} icon="chat" emphasis={docked ? "solid" : "outline"}>
      Chat
    </Button>
  );
}

export function ShellHeader({ universe }: { universe: UniverseView }) {
  const { pathname } = useLocation();
  const current = site.viewAt(universe, pathname);
  const [, openView] = useDeviceView();
  const listed = useWorldsDrawn();
  const woken = useWoken();
  // The list has no page of its own in a universe: it is the one page of the site. Each view says what it holds to a screen reader alone;
  // nothing is drawn under the tabs (ADR-0003, 2c).
  const views: { view: View; label: string; path: string; holds: string }[] = [
    { view: "earth", label: "Earth", path: universe.earth.path, holds: "where everyone talks" },
    { view: "cosmos", label: "Universe", path: universe.home.path, holds: "every world" },
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
            // Drawn anew once the page wakes: a path served the page written at / hydrates the light that page holds, as hydration
            // patches no attribute (react-dom 19.3.1), and a new link takes the path's own (F4880).
            key={`${view.view}:${String(woken)}`}
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
        <SearchPalette universe={universe} />
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
        {/* One item of the phone's header row: the controls with the account. Under 1,280 px Jarvis, the chat and the counter drop (the menu
            keeps the passport): the network and the account never drop (DESIGN-SYSTEM.md, Layout). */}
        <Cluster space="2xs">
          <span className={styles["drops"]}>
            <ComingSoon name="Jarvis" icon="spark" words="Jarvis" />
          </span>
          <span className={styles["drops"]}>
            <ChatPill universe={universe} current={current} />
          </span>
          <span className={styles["drops"]}>
            <PassportCounter
              universe={universe.id}
              listed={listed}
              onOpen={() => {
                openView("passport");
              }}
            />
          </span>
          <BellSlot />
          <AccountMenu universe={universe.id} />
        </Cluster>
      </div>
    </header>
  );
}
