// What every page sits in: the store, the page's links (F326), the header and the main column. Layout (root.tsx) wraps the
// document around it; apart, so a test can render it without the router's document components.
import { Center } from "@gnoworld/ui";
import { useEffect, type ReactNode } from "react";
import "./plugs.ts";
import { useDrawnPath } from "./drawnPath.ts";
import { DeviceViews } from "./features/account/index.ts";
import { DockedChatHost, FullChatHost } from "./features/chat/index.ts";
import { useSettingsApplied } from "./features/settings/applied.ts";
import { holdsShell, revealShell } from "./features/universe/index.ts";
import { UpdatePrompt } from "./features/update/index.ts";
import { WelcomeSlot } from "./features/welcome/index.ts";
import { queryClient } from "./lib/query/client.ts";
import { site } from "./places.ts";
import { AppLinks } from "./routerLink.tsx";
import { ShellHeader } from "./shellHeader.tsx";
import header from "./shellHeader.module.css";
import column from "./shell.module.css";
import { WatchSlot } from "./slots.tsx";
import { StoreProvider } from "./storeContext.tsx";
import { PillHost } from "./topPill.tsx";

const SHELL_HELD_MS = 350;

// The query client listens to the tab's focus and the network once mounted (QueryClientProvider does it for a provider's; the hooks here pass the
// client themselves): a fresh read when the tab is seen again after fifteen seconds, and the paused ones when the network is back.
function useQueriesMounted() {
  useEffect(() => {
    queryClient.mount();
    return () => {
      queryClient.unmount();
    };
  }, []);
}

// What reads the store: inside its provider.
function Settled() {
  useSettingsApplied();
  return null;
}

export function Shell({ children }: { children: ReactNode }) {
  useQueriesMounted();
  const universe = site.universeAt(useDrawnPath());
  // The header was held out of sight at the first paint (root.tsx): a page with a scene to wait for lets it in with the scene; any other (or a
  // page whose loader is slow, which mounts after this) lets it in once the page has had a moment to mount.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!holdsShell()) revealShell(true);
    }, SHELL_HELD_MS);
    return () => {
      clearTimeout(timer);
    };
  }, []);
  return (
    <StoreProvider>
      <Settled />
      <AppLinks>
        <ShellHeader universe={universe} />
        <Center max="page">
          <main className={`${String(header["page"])} ${String(column["unmounted"])}`}>{children}</main>
        </Center>
        <UpdatePrompt />
        <WelcomeSlot />
        <DeviceViews universe={universe.id} />
        <PillHost />
        <DockedChatHost />
        <FullChatHost />
        <WatchSlot />
      </AppLinks>
    </StoreProvider>
  );
}
