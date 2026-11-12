// The account's menu in the header (ADR-0002 §1, Menu and settings; DESIGN-SYSTEM.md, Layout; 8p, frames 6 and 17): logged out, the way in,
// Connect Adena, beside the device's menu (passport, settings); logged in, one pill, the account's face and its address, opening the menu
// that holds the passport, the saved messages, the settings, a name to pick (9f) and the way out. The name shown, its dialog and the menu's code
// come after the first screen, never with it.
import { shortAddress, type Address } from "@gnoworld/schemas";
import { Button, IconButton } from "@gnoworld/ui";
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { useJarvisHere } from "../../jarvisHere.ts";
import { onAsked } from "../../pageAsks.ts";
import type { FirstAsk } from "../jarvis/index.ts";
import { LoginControl, useLogin } from "../login/index.ts";
import { useJustLoggedIn } from "./justLoggedIn.ts";
import { useNaming, useNamelessTold } from "./naming.ts";

const JarvisListener = lazy(async () => ({ default: (await import("../jarvis/index.ts")).JarvisListener }));
const Face = lazy(async () => ({ default: (await import("./Face.tsx")).Face }));
const Opened = lazy(async () => ({ default: (await import("./OpenedJarvis.tsx")).OpenedJarvis }));
// The name (9f) is read once the first screen is up: the short address stands in until it is there.
const NameLabel = lazy(async () => ({ default: (await import("../names/index.ts")).NameLabel }));
// An account linked to others says so once, right after its login (owners' moderation, part 5).
const LinkedNotice = lazy(async () => ({ default: (await import("./LinkedNotice.tsx")).LinkedNotice }));
const PickName = lazy(async () => ({ default: (await import("../names/index.ts")).PickName }));

// The account's pill (frame 17): its face and its short address, on the menu's trigger before and after its code comes.
function AccountPill({
  face,
  address,
  universe,
  again,
  onPickable,
  network,
}: {
  face: ReactNode;
  network: ReactNode;
  address: string;
  universe: string;
  again: number;
  onPickable: (pickable: boolean | undefined) => void;
}) {
  return (
    <>
      {face}
      <Suspense fallback={<span title={address}>{shortAddress(address)}</span>}>
        <NameLabel account={address} universe={universe} again={again} onPickable={onPickable} />
      </Suspense>
      {network}
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
const JARVIS_ASKS = ["jarvis", "jarvis-catch-up", "jarvis-ask", "jarvis-said"] as const satisfies readonly FirstAsk[];

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
function LateDoors({ connecting, address }: { connecting: boolean; address: Address | undefined }) {
  const justIn = useJustLoggedIn(connecting, address);
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

/** The account's menu; `network`, the network's name its pill carries once logged in (D330). */
export function AccountMenu({ universe, network = null }: { universe: string; network?: ReactNode }) {
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
  const { naming, setNaming, setPickable, pickable } = useNaming(login.step !== "idle", address, universe);
  useNamelessTold(address !== undefined && pickable, setNaming);
  const ask = () => {
    setAsked(true);
  };
  const face =
    address === undefined ? null : (
      <Suspense fallback={null}>
        <Face address={address} />
      </Suspense>
    );
  const pill =
    address === undefined ? null : (
      <AccountPill
        face={face}
        network={network}
        address={address}
        universe={universe}
        again={again}
        onPickable={setPickable}
      />
    );
  // The trigger as the menu draws it, until the menu's code takes its place, open.
  const trigger = <Trigger pill={pill} onClick={ask} />;
  return (
    <>
      {asked ? (
        <Suspense fallback={trigger}>
          <Opened
            address={address}
            lead={pill}
            onLogOut={logOut}
            {...(pickable
              ? {
                  onPickName: () => {
                    setNaming(true);
                  },
                }
              : {})}
          />
        </Suspense>
      ) : (
        trigger
      )}
      {address === undefined || !naming ? null : (
        <Suspense fallback={null}>
          <PickName
            account={address}
            universe={universe}
            open={naming}
            onSettled={() => {
              setAgain((count) => count + 1);
            }}
            onClose={() => {
              setNaming(false);
            }}
          />
        </Suspense>
      )}
      <LateDoors connecting={login.step !== "idle"} address={address} />
      <LoginControl login={login} logIn={logIn} network={network} />
    </>
  );
}
