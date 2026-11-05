// The first signals' places on a world's page (slice 9h, frames 90 to 97): the arrival banners, mounted as one element, and
// the plate's "First charted by", at the end of the description. The banners' chunk is asked once a person is logged in (who
// charts on arrival), the plate's small one once the stream has told a signal: a page without either draws nothing and asks
// for nothing more, and this file is all a world's first screen carries of them (budgets.spec.ts).
import { lazy, Suspense, type ComponentProps } from "react";
import { useApp } from "../../storeContext.tsx";

const Arrived = lazy(() => import("./Banners.tsx").then(({ Arrived: shown }) => ({ default: shown })));
const ChartedBy = lazy(() => import("./ChartedBy.tsx").then(({ ChartedBy: shown }) => ({ default: shown })));

export function Arrival(props: ComponentProps<typeof Arrived>) {
  const awake = useApp(({ login }) => login.session.kind === "in");
  return awake ? (
    <Suspense fallback={null}>
      <Arrived {...props} />
    </Suspense>
  ) : null;
}

export function FirstCharted({ world }: { world: string }) {
  const told = useApp(({ signals }) => signals.length > 0);
  return told ? (
    <Suspense fallback={null}>
      <ChartedBy world={world} />
    </Suspense>
  ) : null;
}
