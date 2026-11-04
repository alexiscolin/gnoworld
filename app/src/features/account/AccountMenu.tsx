// The account's menu in the header (ADR-0002 §1, Menu and settings; DESIGN-SYSTEM.md, Layout): the passport, the saved messages for an
// account, the settings. Logged in, its trigger wears the account's face. The login stays beside it, with the address and "Log out", until
// the menu takes the logout too: that moves the login's own control (app/src/features/login/, tier 1), a change of its own. The name comes
// with slice 9; help with the feature that brings it. The menu's code comes at the trigger's first press, never with the first screen.
import { Button, IconButton } from "@gnoworld/ui";
import { lazy, Suspense, useState } from "react";
import { useApp } from "../../storeContext.tsx";
import { LoginControl } from "../login/index.ts";

const Face = lazy(async () => ({ default: (await import("./Face.tsx")).Face }));
const Opened = lazy(async () => ({ default: (await import("./Opened.tsx")).Opened }));

export function AccountMenu() {
  const session = useApp(({ login }) => login.session);
  const [asked, setAsked] = useState(false);
  const address = session.kind === "in" ? session.address : undefined;
  const ask = () => {
    setAsked(true);
  };
  // The trigger as the menu draws it, until the menu's code takes its place, open.
  const trigger =
    address === undefined ? (
      <IconButton icon="menu" label="Menu" onClick={ask} />
    ) : (
      <Button onClick={ask}>
        <Suspense fallback={null}>
          <Face address={address} />
        </Suspense>
        <span className="visually-hidden">Your account</span>
      </Button>
    );
  return (
    <>
      {asked ? (
        <Suspense fallback={trigger}>
          <Opened
            address={address}
            face={
              address === undefined ? null : (
                <Suspense fallback={null}>
                  <Face address={address} />
                </Suspense>
              )
            }
          />
        </Suspense>
      ) : (
        trigger
      )}
      <LoginControl />
    </>
  );
}
