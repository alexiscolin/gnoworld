// Whether a login has just run its course in this page and left an account logged in: not a session found as the page loaded. True until the
// next login begins or the account leaves.
import { useState } from "react";

export function useJustLoggedIn(connecting: boolean, address: string | undefined): boolean {
  const [during, setDuring] = useState(false);
  const [just, setJust] = useState(false);
  if (connecting && !during) {
    setDuring(true);
    setJust(false);
  }
  if (during && !connecting) {
    setDuring(false);
    setJust(address !== undefined);
  }
  return just && address !== undefined;
}
