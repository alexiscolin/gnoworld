// Slice 8's discovery in 8a's slots (slots.tsx): the passport's expedition and quests, the arrival's line and the quests' watcher, all in one
// chunk asked when first drawn or asked; the watcher once a chat session is open, the one place a talk step is done. This file is on every
// first screen: it holds none of them, and asks one import, so it carries one list of what to preload.
import { lazy, Suspense } from "react";
import { plug } from "../../slots.tsx";
import { useApp } from "../../storeContext.tsx";

const discovery = () => import("./discovery.ts").then(({ parts }) => parts());
const Expedition = lazy(() => discovery().then(({ ExpeditionSection }) => ({ default: ExpeditionSection })));
const Quests = lazy(() => discovery().then(({ QuestsSection }) => ({ default: QuestsSection })));
const Watch = lazy(() => discovery().then(({ DiscoveryWatch }) => ({ default: DiscoveryWatch })));

function Watching() {
  const talking = useApp(({ chat }) => chat.me !== undefined);
  return talking ? (
    <Suspense fallback={null}>
      <Watch />
    </Suspense>
  ) : null;
}

plug("passportExpedition", Expedition);
plug("passportQuests", Quests);
plug("discoveryWatch", Watching);
plug("arrivalLine", (arrival, change) => discovery().then(({ arrive }) => arrive(arrival, change)));
