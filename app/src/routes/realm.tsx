// A realm's view: /r/<path> in the default universe, /net/<id>/r/<path> in another. A client route with no page written
// ahead (docs/plans/slice-5-part-2.md §1): the static host's fallback serves it under the catch-all's policy, and the
// browser's loader answers the 404 for a path that is no realm's. The page is read from the chain inside the view.
import { data, useLoaderData, type MetaArgs } from "react-router";
import { PlaceError } from "../features/errors/index.ts";
import { RealmView } from "../features/realms/index.ts";
import { useEntered } from "../features/universe/index.ts";
import { realmMeta } from "../meta.ts";
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
  // A realm's view is a world's page, a place entered: the rail and the labels link a world with no hub there (ADR-0003 §4).
  useEntered();
  return <RealmView {...found} />;
}

export function ErrorBoundary() {
  return <PlaceError what="realm" />;
}
