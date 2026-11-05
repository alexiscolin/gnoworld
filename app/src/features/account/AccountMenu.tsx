// The account's menu in the header (ADR-0002 §1, Menu and settings; DESIGN-SYSTEM.md, Layout; 8p, frames 6 and 17): logged out, the way in,
// Connect Adena, beside the device's menu (passport, settings); logged in, one pill, the account's face and its address, opening the menu
// that holds the passport, the saved messages, the settings and the way out. The name comes with slice 9. The menu's code comes at the
// trigger's first press, never with the first screen.
import { shortAddress } from "@gnoworld/schemas";
import { Button, IconButton } from "@gnoworld/ui";
import { lazy, Suspense, useState, type ReactNode } from "react";
import { LoginControl, useLogin } from "../login/index.ts";

const Face = lazy(async () => ({ default: (await import("./Face.tsx")).Face }));
const Opened = lazy(async () => ({ default: (await import("./Opened.tsx")).Opened }));

// The account's pill (frame 17): its face and its short address, on the menu's trigger before and after its code comes.
function AccountPill({ face, address }: { face: ReactNode; address: string }) {
  return (
    <>
      {face}
      <span title={address}>{shortAddress(address)}</span>
    </>
  );
}

export function AccountMenu() {
  const { login, logIn, logOut } = useLogin();
  const [asked, setAsked] = useState(false);
  const address = login.session.kind === "in" ? login.session.address : undefined;
  const ask = () => {
    setAsked(true);
  };
  const face =
    address === undefined ? null : (
      <Suspense fallback={null}>
        <Face address={address} />
      </Suspense>
    );
  // The trigger as the menu draws it, until the menu's code takes its place, open.
  const trigger =
    address === undefined ? (
      <IconButton icon="menu" label="Menu" onClick={ask} />
    ) : (
      <Button onClick={ask}>
        <AccountPill face={face} address={address} />
        <span className="visually-hidden">Your account</span>
      </Button>
    );
  return (
    <>
      {asked ? (
        <Suspense fallback={trigger}>
          <Opened
            address={address}
            lead={address === undefined ? null : <AccountPill face={face} address={address} />}
            onLogOut={logOut}
          />
        </Suspense>
      ) : (
        trigger
      )}
      <LoginControl login={login} logIn={logIn} />
    </>
  );
}
