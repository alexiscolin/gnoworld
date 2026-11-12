// "Get started" (D13017): what a Connect with no Adena opens in place of a bare "Install Adena", step by step. It watches for Adena (the
// window's focus, a light poll while open) and, once it is there, offers the same Connect as the header's, with no reload.
import { Button, Cluster, Dialog, Disclosure } from "@gnoworld/ui";
import { useEffect, useState } from "react";
import { NEW_TAB } from "../../lib/newTab.ts";
import { adenaHere as here } from "./getStartedAsk.ts";
import styles from "./GetStarted.module.css";

// Adena's own install links, read from adena.app on 2026-11-12: its phone apps are "coming soon", so a phone is told to use a computer.
const CHROME = "https://chromewebstore.google.com/detail/adena/oefglhbffgfkcpboeackfgdagmlnihnh";
const FIREFOX = "https://addons.mozilla.org/en-US/firefox/addon/adena/";
// The faucet linked from onyx.testnets.gno.land's own page (fetched 2026-11-12).
const FAUCET = "https://faucet.gno.land";
const POLL_MS = 2000;

/** Whether Adena is in the page, read again at the window's focus and every two seconds while `watching`. */
function useAdena(watching: boolean): boolean {
  const [found, setFound] = useState(here);
  useEffect(() => {
    if (!watching) return undefined;
    const read = () => {
      setFound(here());
    };
    const poll = setInterval(read, POLL_MS);
    window.addEventListener("focus", read);
    return () => {
      clearInterval(poll);
      window.removeEventListener("focus", read);
    };
  }, [watching]);
  return found;
}

export interface GetStartedProps {
  open: boolean;
  /** Closes it: "Continue as a guest", Esc and Close. */
  onClose: () => void;
  /** The header's own login. */
  onConnect: () => void;
}

export function GetStarted({ open, onClose, onConnect }: GetStartedProps) {
  const found = useAdena(open);
  const firefox = navigator.userAgent.includes("Firefox/");
  return (
    <Dialog title="Get started" kicker="GNO.LAND" open={open} onClose={onClose}>
      <ol className={styles["steps"]}>
        <li>
          <strong>What this is.</strong> gno.land is a blockchain where programs, called realms, are written in Gno and
          read in the open. Here you can talk in each world's chat (no wallet needed), follow worlds, and call a realm's
          functions with Adena.
        </li>
        <li>
          <strong>Install Adena.</strong> Adena is the wallet that proves who you are.{" "}
          <a href={firefox ? FIREFOX : CHROME} {...NEW_TAB}>
            {firefox ? "Get Adena for Firefox" : "Get Adena for Chrome, Brave or Edge"}
          </a>
          . On a phone, use a computer: Adena has no phone app yet.
        </li>
        <li>
          <strong>Create or import an account in Adena.</strong> Write the secret phrase down and never give it to
          anyone: gnoworld never asks for it.
        </li>
        <li>
          <strong>Come back here.</strong>{" "}
          {found ? "Adena is here." : "This page sees Adena as soon as it is installed; no reload."}
        </li>
      </ol>
      <Disclosure title="Further, if you want" size="s">
        <p className={styles["further"]}>
          Test tokens are only needed to call realms, never to chat:{" "}
          <a href={FAUCET} {...NEW_TAB}>
            the faucet
          </a>{" "}
          gives some on the test network. Once connected, you can also pick a name for your account.
        </p>
      </Disclosure>
      <Cluster>
        {found ? (
          <Button emphasis="solid" onClick={onConnect}>
            Connect
          </Button>
        ) : null}
        <Button onClick={onClose}>Continue as a guest</Button>
      </Cluster>
    </Dialog>
  );
}
