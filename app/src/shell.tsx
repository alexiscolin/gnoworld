// What every page sits in: the store, the page's links (F326), the header and the main column. Layout (root.tsx) wraps the
// document around it; apart, so a test can render it without the router's document components.
import { Center } from "@gnoworld/ui";
import type { ReactNode } from "react";
import { useLocation } from "react-router";
import "./plugs.ts";
import { DeviceViews } from "./features/account/index.ts";
import { useSettingsApplied } from "./features/settings/applied.ts";
import { UpdatePrompt } from "./features/update/index.ts";
import { site } from "./places.ts";
import { AppLinks } from "./routerLink.tsx";
import { ShellHeader } from "./shellHeader.tsx";
import header from "./shellHeader.module.css";
import { WatchSlot } from "./slots.tsx";
import { StoreProvider } from "./storeContext.tsx";
import { PillHost } from "./topPill.tsx";

// What reads the store: inside its provider.
function Settled() {
  useSettingsApplied();
  return null;
}

export function Shell({ children }: { children: ReactNode }) {
  const universe = site.universeAt(useLocation().pathname);
  return (
    <StoreProvider>
      <Settled />
      <AppLinks>
        <ShellHeader universe={universe} />
        <Center max="page">
          <main className={header["page"]}>{children}</main>
        </Center>
        <UpdatePrompt />
        <DeviceViews universe={universe.id} />
        <PillHost />
        <WatchSlot />
      </AppLinks>
    </StoreProvider>
  );
}
