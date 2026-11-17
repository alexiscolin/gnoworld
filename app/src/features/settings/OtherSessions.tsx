// Settings, Accounts: "Log out my other sessions" (ADR-0002 §4, a login revocable in the settings): busy while the server
// is asked, then one line, done or the failure in the words the linked accounts use (but a session that ended says its own).
import { Button, Cluster } from "@gnoworld/ui";
import { useState } from "react";
import { pageSessionsApi } from "../../lib/api/sessions.ts";
import { linkProblem } from "./linkWords.ts";
import { useSignInAgain } from "./useSignInAgain.ts";

export function OtherSessions() {
  const [said, setSaid] = useState("");
  const [busy, setBusy] = useState(false);
  const [stale, setStale] = useState(false);

  async function logOut(): Promise<void> {
    setSaid("");
    setBusy(true);
    setStale(false);
    const done = await pageSessionsApi().logoutOthers();
    setBusy(false);
    if (done.ok) setSaid("Your other sessions are logged out.");
    else if (done.reason === "unauthenticated") {
      setSaid("Your session has ended. Sign in again to log out your other sessions.");
      setStale(true);
    } else setSaid(linkProblem(done.reason));
  }

  const again = useSignInAgain(() => {
    logOut().catch(reportError);
  });

  return (
    <Cluster space="xs" wrap="scroll">
      <Button
        size="s"
        emphasis="quiet"
        disabled={busy}
        onClick={() => {
          logOut().catch(reportError);
        }}
      >
        Log out my other sessions
      </Button>
      {stale ? (
        <Button size="s" onClick={again.ask} disabled={again.waiting}>
          Sign in again to confirm
        </Button>
      ) : null}
      <span role="status" className="meta">
        {said}
      </span>
    </Cluster>
  );
}
