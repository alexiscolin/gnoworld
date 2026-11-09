// The settings (ADR-0002 §1, Menu and settings; slice 8's answer 4): every choice in one place, only those whose feature exists: display,
// privacy, the account, this device. Each takes effect at once, with no reload (settings.ts applies them), and is kept on this device. No
// setting hides a safety notice: they change quality, motion and choices alone.
import { shortAddress, type Address } from "@gnoworld/schemas";
import { Avatar, Dialog, Sidebar, Stack } from "@gnoworld/ui";
import { useApp } from "../../storeContext.tsx";
import { CountryChoice } from "../chat/index.ts";
import { DeviceSection } from "./DeviceSection.tsx";
import { DisplaySection } from "./DisplaySection.tsx";
import { Section } from "./Section.tsx";
import styles from "./Settings.module.css";

// The account's face, the nebula drawn from its address (decisions.md, 2026-10-20: no longer an astronaut), and its address; the name
// is picked in the account's menu (9f), which reads it from the chain.
function Account({ account }: { account: Address }) {
  return (
    <Sidebar align="center">
      <Avatar address={account} name={shortAddress(account)} size="l" decorative />
      <Stack space="3xs">
        <span className={styles["address"]} title={account}>
          {shortAddress(account)}
        </span>
        <span className="meta">
          Your nebula is drawn from your address. Your name is picked in your account's menu.
        </span>
      </Stack>
    </Sidebar>
  );
}

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
      <Stack space="m">
        <DisplaySection />
        <Section id="settings-privacy" title="Privacy">
          {account === undefined ? (
            <p className="meta">Log in to say where you speak from.</p>
          ) : (
            <CountryChoice account={account} />
          )}
        </Section>
        <Section id="settings-account" title="Account">
          {account === undefined ? (
            <p className="meta">Log in to see your name and your nebula.</p>
          ) : (
            <Account account={account} />
          )}
        </Section>
        <DeviceSection account={account} />
      </Stack>
    </Dialog>
  );
}
