// The account's menu in the header (ADR-0002 §1, Menu and settings; DESIGN-SYSTEM.md, Layout; frames 6 and 17): logged out, the way in,
// Connect Adena, beside the device's menu (passport, settings); logged in, one pill, the account's face and its address, opening the menu
// that holds the passport, the saved messages, the settings, a name to pick and the way out. The name shown, its dialog and the menu's code
// come after the first screen, never with it.
import { shortAddress, type Address } from "@gnoworld/schemas";
import { Button, IconButton } from "@gnoworld/ui";
import { lazy, Suspense, useEffect, useState, type Dispatch, type ReactNode, type SetStateAction } from "react";
import { useJarvisHere } from "../../jarvisHere.ts";
import { onAsked } from "../../pageAsks.ts";
import { JARVIS_ASKS, loadListener, type FirstAsk } from "../jarvis/index.ts";
import { adenaHere, LoginControl, useLogin } from "../login/index.ts";
import styles from "./AccountPill.module.css";
import { useNaming, useNamelessTold } from "./naming.ts";

const JarvisListener = lazy(async () => ({ default: await loadListener() }));
const Face = lazy(async () => ({ default: (await import("./Face.tsx")).Face }));
const Opened = lazy(async () => ({ default: (await import("./OpenedJarvis.tsx")).OpenedJarvis }));
// The name is read once the first screen is up: the short address stands in until it is there.
const NameLabel = lazy(async () => ({ default: (await import("../names/index.ts")).NameLabel }));
// An account linked to others says so once, right after its login.
const LinkedNotice = lazy(async () => ({ default: (await import("./LinkedNotice.tsx")).LinkedNotice }));
const PickName = lazy(async () => ({ default: (await import("../names/index.ts")).PickName }));

// The account's pill (frame 17): its face and its short address, on the menu's trigger before and after its code comes.
function AccountPill({
  address,
  universe,
  again,
  onPickable,
}: {
  address: string;
  universe: string;
  again: number;
  onPickable: (pickable: boolean | undefined) => void;
}) {
  return (
    <>
      <Suspense fallback={null}>
        <Face address={address} />
      </Suspense>
      {/* A phone's pill is its face: the address would take the network's room (it is in the menu and the accessible name). */}
      <span className={styles["who"]}>
        <Suspense fallback={<span title={address}>{shortAddress(address)}</span>}>
          <NameLabel account={address} universe={universe} again={again} onPickable={onPickable} />
        </Suspense>
      </span>
    </>
  );
}

// The trigger as the menu draws it before its code comes: the device's menu, or the account's pill.
function Trigger({ pill, onClick }: { pill: ReactNode; onClick: () => void }) {
  return pill === null ? (
    <IconButton icon="menu" label="Menu" onClick={onClick} />
  ) : (
    <Button onClick={onClick}>
      {pill}
      <span className="visually-hidden">Your account</span>
    </Button>
  );
}

// Jarvis's panel is brought once the chat in view can ask it (jarvisHere.ts): its code is a late chunk.
function JarvisDoor() {
  const here = useJarvisHere() !== undefined;
  // An ask made while the listener's code is still on its way is kept, and handed to it.
  const [early, setEarly] = useState<FirstAsk>();
  useEffect(() => {
    if (!here) return undefined;
    const stop = new AbortController();
    for (const ask of JARVIS_ASKS)
      onAsked(
        ask,
        () => {
          setEarly((was) => was ?? ask);
        },
        stop.signal,
      );
    return () => {
      stop.abort();
      setEarly(undefined);
    };
  }, [here]);
  return here ? (
    <Suspense fallback={null}>
      <JarvisListener early={early} />
    </Suspense>
  ) : null;
}

// What comes after the first screen, each in a chunk of its own: Jarvis's listener, and the notice of a login that is linked.
function LateDoors({ justIn, address }: { justIn: boolean; address: Address | undefined }) {
  return (
    <>
      <JarvisDoor />
      {justIn && address !== undefined ? (
        <Suspense fallback={null}>
          <LinkedNotice address={address} />
        </Suspense>
      ) : null}
    </>
  );
}

// A phone's header holds no button for the way in: where Adena is found, it is the menu's first row (a phone's browser has none).
const wayIn = (phone: boolean | undefined, logIn: () => void) => (phone && adenaHere() ? logIn : undefined);

// The dialog that registers a name, brought once asked; `onSettled` counts a name settled, `onClose` is told false.
function NamingDoor({
  account,
  universe,
  onSettled,
  onClose,
}: {
  account: Address;
  universe: string;
  onSettled: Dispatch<SetStateAction<number>>;
  onClose: (naming: boolean) => void;
}) {
  return (
    <Suspense fallback={null}>
      <PickName
        account={account}
        universe={universe}
        open
        onSettled={() => {
          onSettled((count) => count + 1);
        }}
        onClose={() => {
          onClose(false);
        }}
      />
    </Suspense>
  );
}

/** The account's menu; `network`, the network's name LoginControl draws beside the way in, or beside the pill once logged in. */
export function AccountMenu({
  universe,
  network = null,
  guestNote,
  phone,
}: {
  universe: string;
  network?: ReactNode;
  guestNote?: string | undefined;
  /** Under 900 px: the network and, where Adena is found, the way in are rows of the menu, not of the header (Opened.tsx). */
  phone?: boolean;
}) {
  const { login, logIn, logOut } = useLogin();
  // A page's ask to log in (pageAsks.ts, the chat's composer for a guest): this one control answers it, the session watched once.
  useEffect(() => {
    const stop = new AbortController();
    onAsked("log-in", logIn, stop.signal);
    return () => {
      stop.abort();
    };
  }, [logIn]);
  const [asked, setAsked] = useState(false);
  const [again, setAgain] = useState(0);
  const address = login.session.kind === "in" ? login.session.address : undefined;
  const { naming, setNaming, setPickable, pickable, justIn } = useNaming(login.step !== "idle", address, universe);
  useNamelessTold(address !== undefined && pickable, setNaming);
  const ask = () => {
    setAsked(true);
  };
  const pill =
    address === undefined ? null : (
      <AccountPill address={address} universe={universe} again={again} onPickable={setPickable} />
    );
  // The trigger as the menu draws it, until the menu's code takes its place, open.
  const trigger = <Trigger pill={pill} onClick={ask} />;
  const door = asked ? (
    <Suspense fallback={trigger}>
      <Opened
        address={address}
        lead={pill}
        guestNote={guestNote}
        phone={phone}
        onConnect={wayIn(phone, logIn)}
        onLogOut={logOut}
        onPickName={
          pickable
            ? () => {
                setNaming(true);
              }
            : undefined
        }
      />
    </Suspense>
  ) : (
    trigger
  );
  return (
    <>
      {/* Logged in, the pill's box holds the account's button and, after it, the network's: siblings, never one in the other. */}
      {address === undefined ? (
        door
      ) : (
        <span className="pill-group">
          {door}
          {network}
        </span>
      )}
      {address === undefined || !naming ? null : (
        <NamingDoor account={address} universe={universe} onSettled={setAgain} onClose={setNaming} />
      )}
      <LateDoors justIn={justIn} address={address} />
      <LoginControl login={login} logIn={logIn} network={network} />
    </>
  );
}
