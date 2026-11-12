// A realm's view: /r/<path> in the default universe, /net/<id>/r/<path> in another. A client route with no page written
// ahead (docs/plans/slice-5-part-2.md §1): the static host's fallback serves it under the catch-all's policy, and the
// browser's loader answers the 404 for a path that is no realm's. The page is read from the chain inside the view.
import { labelName, worldIdOf } from "@gnoworld/core";
import { data, useLoaderData, useLocation, type MetaArgs } from "react-router";
import { Arrival } from "../features/passport/Later.tsx";
import { ErrorView, RouteError, useWhere } from "../features/errors/index.ts";
import { useKnown } from "../features/realms/known.ts";
import { useWorldsFile } from "../worldsFile.ts";
import { PlaceFrame } from "./placeFrame.tsx";
import { RealmPage } from "./realmPage.tsx";
import { realmMeta } from "../meta.ts";
import { site } from "../places.ts";
import { realmAt } from "../realmAt.ts";

export function clientLoader({ request }: { request: Request }) {
  const found = realmAt(new URL(request.url).pathname);
  if (found === undefined) throw data(null, { status: 404 });
  return found;
}

export function meta({ loaderData }: MetaArgs<typeof clientLoader>) {
  return realmMeta(loaderData?.realm);
}

export default function Realm() {
  const found = useLoaderData<typeof clientLoader>();
  const world = worldIdOf(found.realm);
  const { pathname } = useLocation();
  const universe = site.universeAt(pathname).id;
  const { realm, chain } = found;
  const listed = useWorldsFile(true)?.some((each) => each.realms.some((one) => one.path === realm)) === true;
  const known = useKnown({ rpc: chain.rpc, realm, origin: chain.gnoweb }, listed);
  const where = useWhere();
  if (known === "no")
    return (
      <PlaceFrame
        label="Realm"
        plate={
          <ErrorView kind="not-found" noun="realm" size="place" where={where} note={`${realm} on ${chain.name}`} />
        }
      />
    );
  return (
    <>
      <RealmPage found={found} known={known === "yes"} />
      {known === "yes" ? (
        <Arrival universe={universe} world={world} name={labelName(world) ?? world} path={pathname} />
      ) : null}
    </>
  );
}

export function ErrorBoundary() {
  // Inside the plate, as any page's content is: never loose at the screen's corner (D535).
  return <PlaceFrame label="Realm" plate={<RouteError noun="realm" size="place" />} />;
}
