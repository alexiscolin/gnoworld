// Settings, Accounts: "Log out my other sessions" (ADR-0002 §4, a login revocable in the settings, D13601): busy while the server
// is asked, then one line, done or the failure in the words the linked accounts use (but a session that ended says its own).
import { Button, Cluster } from "@gnoworld/ui";
import { useState } from "react";
import { pageLoginApi } from "../../lib/api/login.ts";
import { linkProblem } from "./linkWords.ts";

export function OtherSessions() {
  const [said, setSaid] = useState("");
  const [busy, setBusy] = useState(false);

  async function logOut(): Promise<void> {
    setSaid("");
    setBusy(true);
    const done = await pageLoginApi().logoutOthers();
    setBusy(false);
    if (done.ok) setSaid("Your other sessions are logged out.");
    else if (done.reason === "unauthenticated")
      setSaid("Your session has ended. Sign in again to log out your other sessions.");
    else setSaid(linkProblem(done.reason));
  }

  return (
    <Cluster space="xs">
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
      <span role="status" className="meta">
        {said}
      </span>
    </Cluster>
  );
}
