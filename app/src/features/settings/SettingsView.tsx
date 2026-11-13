// The settings (ADR-0002 §1, Menu and settings; slice 8's answer 4): every choice in one place, only those whose feature exists: display,
// privacy, the accounts, this device. Each takes effect at once, with no reload (settings.ts applies them), and is kept on this device. No
// setting hides a safety notice: they change quality, motion and choices alone.
import { Button, Dialog, Stack } from "@gnoworld/ui";
import { useDeviceView } from "../../deviceViews.ts";
import { useApp } from "../../storeContext.tsx";
import { CountryChoice } from "../chat/index.ts";
import { lazy, Suspense } from "react";
import { DeviceSection } from "./DeviceSection.tsx";
import { DisplaySection } from "./DisplaySection.tsx";
import { Section } from "./Section.tsx";

// The accounts, the logged-in one first with its face, come once the settings are open and an account is logged in.
const AccountsSection = lazy(async () => ({ default: (await import("./AccountsSection.tsx")).AccountsSection }));

// Logged out, Accounts holds the one thing that needs no login: freeing a command-line key (D13940).
function ReleaseSection() {
  const [, open] = useDeviceView();
  return (
    <Section id="settings-accounts" title="Accounts">
      <p className="meta">Log in to link accounts.</p>
      <div>
        <Button
          onClick={() => {
            open("release");
          }}
        >
          Release a command-line key
        </Button>
      </div>
    </Section>
  );
}

export function SettingsView({ open, onClose }: { open: boolean; onClose: () => void }) {
  const session = useApp(({ login }) => login.session);
  const account = session.kind === "in" ? session.address : undefined;
  return (
    <Dialog
      title="Settings"
      description="Kept on this device. Each takes effect at once."
      wide
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
        {account === undefined ? (
          <ReleaseSection />
        ) : (
          <Suspense fallback={null}>
            <AccountsSection account={account} />
          </Suspense>
        )}
        <DeviceSection account={account} />
      </Stack>
    </Dialog>
  );
}
