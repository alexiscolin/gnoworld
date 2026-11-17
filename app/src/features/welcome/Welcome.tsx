// The welcome card: a first visit's three ways in, over space at the bottom left. A chunk of its own, asked once the page rests.
import { PHONE_QUERY } from "@gnoworld/core";
import { Button, Card, Cluster, IconButton } from "@gnoworld/ui";
import { useLayoutEffect, useRef, useState, type KeyboardEvent, type MouseEvent, type RefObject } from "react";
import { useLocation, useNavigate } from "react-router";
import { fullChatHref, leaveDock } from "../../fullChat.ts";
import { askFor } from "../../pageAsks.ts";
import { site } from "../../places.ts";
import { focusComposer, useMedia } from "../chat/index.ts";
import { adenaHere, askGetStarted } from "../login/index.ts";
import { seen } from "./seen.ts";
import ring from "../../phoneClose.module.css";
import styles from "./Welcome.module.css";

// A phone's sheet starts at the composer's top edge, so it covers the composer and the row of worlds whole: --welcome-top follows the chat's dock,
// which may come after the card (its code is a chunk of its own), while the card is open; closed, it keeps its place as it fades.
function useDockTop(cardRef: RefObject<HTMLElement | null>, watching: boolean) {
  useLayoutEffect(() => {
    const sheet = cardRef.current;
    if (!watching || sheet === null) return;
    const sizes = new ResizeObserver(() => {
      const dock = document.querySelector("[data-dock]");
      if (dock !== null) sheet.style.setProperty("--welcome-top", `${String(dock.getBoundingClientRect().top)}px`);
    });
    const arrivals = new MutationObserver(() => {
      const dock = document.querySelector("[data-dock]");
      if (dock === null) return;
      arrivals.disconnect();
      sizes.observe(dock);
    });
    arrivals.observe(document.body, { childList: true, subtree: true });
    sizes.observe(document.documentElement);
    const dock = document.querySelector("[data-dock]");
    if (dock !== null) sizes.observe(dock);
    return () => {
      arrivals.disconnect();
      sizes.disconnect();
    };
  }, [cardRef, watching]);
}

/** The card; closed it stays drawn, inert and faded, so that it leaves as it came. */
export function Welcome() {
  const [open, setOpen] = useState(true);
  const navigate = useNavigate();
  const universe = site.universeAt(useLocation().pathname);
  // With Adena in the page, its own connect: Get started's dialog is for a reader with none.
  const adena = adenaHere();
  // A phone opens a world; it does not fly.
  const phone = useMedia(PHONE_QUERY);
  const cardRef = useRef<HTMLElement>(null);
  useDockTop(cardRef, phone && open);
  // Any use closes it for good.
  const using = (act: (from: HTMLElement) => void) => (event: MouseEvent<HTMLElement>) => {
    seen();
    setOpen(false);
    act(event.currentTarget);
  };
  const sayHi = (from: HTMLElement) => {
    leaveDock(from);
    Promise.resolve(navigate(fullChatHref(universe.earth.path)))
      .then(focusComposer)
      .catch(reportError);
  };
  return (
    <aside
      ref={cardRef}
      aria-label="Welcome"
      className={["appears", styles["welcome"]].join(" ")}
      data-open={open ? "" : undefined}
      inert={!open}
      onKeyDown={(event: KeyboardEvent) => {
        if (event.key !== "Escape") return;
        seen();
        setOpen(false);
      }}
    >
      <Card compact>
        <Card.Header
          kicker="Welcome"
          title="Every world here is a program on gno.land"
          level={2}
          actions={
            <span className={ring["ring"]}>
              <IconButton icon="close" label="Close" emphasis="plain" size="xs" onClick={using(() => undefined)} />
            </span>
          }
        />
        <Card.Body>
          <p className="meta">
            gno.land is a blockchain whose programs anyone can read. {phone ? "Open" : "Fly to"} a world, read its chat,
            say hi.
          </p>
        </Card.Body>
        <Card.Actions>
          <Cluster space="2xs" wrap="no">
            <Button
              size="s"
              emphasis="solid"
              onClick={using(
                adena
                  ? () => {
                      askFor("log-in");
                    }
                  : askGetStarted,
              )}
            >
              {adena ? "Connect Adena" : "Get started"}
            </Button>
            <Button size="s" emphasis="outline" onClick={using(sayHi)}>
              Say hi
            </Button>
          </Cluster>
        </Card.Actions>
      </Card>
    </aside>
  );
}
