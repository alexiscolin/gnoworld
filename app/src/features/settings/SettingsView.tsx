// The settings (ADR-0002 §1, Menu and settings; slice 8's answer 4): every choice in one place, only those whose feature exists: display,
// privacy, the account, this device. Each takes effect at once, with no reload (settings.ts applies them), and is kept on this device. No
// setting hides a safety notice: they change quality, motion and choices alone.
import { ComingSoon, Dialog, Stack } from "@gnoworld/ui";
import { useApp } from "../../storeContext.tsx";
import { CountryChoice } from "../chat/index.ts";
import { DeviceSection } from "./DeviceSection.tsx";
import { DisplaySection } from "./DisplaySection.tsx";
import styles from "./Settings.module.css";

export function SettingsView({ open, onClose }: { open: boolean; onClose: () => void }) {
  const session = useApp(({ login }) => login.session);
  const account = session.kind === "in" ? session.address : undefined;
  return (
    <Dialog
      title="Settings"
      description="Kept on this device. Each takes effect at once."
      open={open}
      onClose={onClose}
    >
      <Stack space="l">
        <DisplaySection />
        <section aria-labelledby="settings-privacy">
          <Stack space="xs">
            <h3 id="settings-privacy">Privacy</h3>
            {account === undefined ? (
              <p className={styles["help"]}>Log in to say where you speak from.</p>
            ) : (
              <CountryChoice account={account} />
            )}
          </Stack>
        </section>
        <section aria-labelledby="settings-account">
          <Stack space="xs">
            <h3 id="settings-account">Account</h3>
            <ComingSoon name="Your name and your astronaut">
              <span className={styles["soon"]}>Your name and your astronaut</span>
            </ComingSoon>
          </Stack>
        </section>
        <DeviceSection account={account} />
      </Stack>
    </Dialog>
  );
}
