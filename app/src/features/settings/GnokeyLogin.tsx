// The command line's login (D13880), for a computer with gnokey and no Adena: the address, the server's block to run offline, the
// file it printed pasted back, then the server's cookie. A device view (#key-login), opened by Get started's "Log in with gnokey".
import { shortAddress, type Address } from "@gnoworld/schemas";
import { Dialog, Stack } from "@gnoworld/ui";
import { pageLoginApi } from "../../lib/api/login.ts";
import { useAppStore } from "../../storeContext.tsx";
import { CommandFlow, type Flow } from "./CommandTab.tsx";

const LOGIN_FLOW: Flow = {
  kind: "login",
  verb: "Log in",
  seconds: 300,
  challenge: (address) => pageLoginApi().cliChallenge(address),
  verify: (request) => pageLoginApi().verifyFile(request),
};

export interface GnokeyLoginProps {
  open: boolean;
  onClose: () => void;
  onLoggedIn: (address: Address) => void;
}

export function GnokeyLogin({ open, onClose, onLoggedIn }: GnokeyLoginProps) {
  return (
    <Dialog
      title="Log in with gnokey"
      description="Your key signs a code offline, for a chain that does not exist: nothing is sent and nothing is spent."
      open={open}
      onClose={onClose}
    >
      <Stack space="s">
        <CommandFlow
          flow={LOGIN_FLOW}
          onDone={onLoggedIn}
          onCancel={onClose}
          done={(address) => <p role="status">Logged in as {shortAddress(address)}.</p>}
        />
      </Stack>
    </Dialog>
  );
}

/** The dialog in the page: the account the server names is the page's session, and the dialog closes. */
export function GnokeyLoginDialog({ open, onClose }: Omit<GnokeyLoginProps, "onLoggedIn">) {
  const store = useAppStore();
  return (
    <GnokeyLogin
      open={open}
      onClose={onClose}
      onLoggedIn={(address) => {
        store.getState().loginActions.signedIn(address);
        onClose();
      }}
    />
  );
}
