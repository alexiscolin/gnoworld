// The account's menu in the header (ADR-0002 §1, Menu and settings; DESIGN-SYSTEM.md, Layout; 8p, frames 6 and 17): logged out, the way in,
// Connect Adena, beside the device's menu (passport, settings); logged in, one pill, the account's face and its address, opening the menu
// that holds the passport, the saved messages, the settings, a name to pick (9f) and the way out. The name shown, its dialog and the menu's code
// come after the first screen, never with it.
import { shortAddress } from "@gnoworld/schemas";
import { Button, IconButton } from "@gnoworld/ui";
import { lazy, Suspense, useEffect, useState, type ReactNode } from "react";
import { onAsked } from "../../pageAsks.ts";
import { LoginControl, useLogin } from "../login/index.ts";
import { useNaming, useNamelessTold } from "./naming.ts";

const Face = lazy(async () => ({ default: (await import("./Face.tsx")).Face }));
const Opened = lazy(async () => ({ default: (await import("./Opened.tsx")).Opened }));
// The name (9f) is read once the first screen is up: the short address stands in until it is there.
const NameLabel = lazy(async () => ({ default: (await import("../names/index.ts")).NameLabel }));
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
      <LoginControl login={login} logIn={logIn} network={network} />
    </>
  );
}
