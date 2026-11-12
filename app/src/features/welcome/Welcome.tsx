// The welcome card: a first visit's three ways in, over space at the bottom left. A chunk of its own, asked once the page rests.
import { Button, Card, Cluster, IconButton } from "@gnoworld/ui";
import { useState, type KeyboardEvent, type MouseEvent } from "react";
import { useLocation, useNavigate } from "react-router";
import { fullChatHref, leaveDock } from "../../fullChat.ts";
import { site } from "../../places.ts";
import { adenaHere, askGetStarted } from "../login/index.ts";
import { focusComposer } from "./focusComposer.ts";
import { seen } from "./seen.ts";
import styles from "./Welcome.module.css";

/** The card; closed it stays drawn, inert and faded, so that it leaves as it came. */
export function Welcome() {
  const [open, setOpen] = useState(true);
  const navigate = useNavigate();
  const universe = site.universeAt(useLocation().pathname);
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
      aria-label="Welcome"
      className={styles["welcome"]}
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
            <IconButton icon="close" label="Close" emphasis="plain" size="xs" onClick={using(() => undefined)} />
          }
        />
        <Card.Body>
          <p className="meta">
            gno.land is a blockchain whose programs anyone can read. Fly to a world, read its chat, say hi.
          </p>
        </Card.Body>
        <Card.Actions>
          <Cluster space="2xs" wrap="no">
            <Button size="s" emphasis="solid" onClick={using(askGetStarted)}>
              {adenaHere() ? "Connect Adena" : "Get started"}
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
