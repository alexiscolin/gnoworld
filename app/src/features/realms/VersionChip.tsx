// A realm's place in its version family (D375), beside who made it: the newest says how many versions there are, an older one says a newer
// is out and links to it. Nothing for a realm with one version, or before the worlds' file has come.
import { realmRoute } from "@gnoworld/core";
import type { Worlds } from "@gnoworld/schemas/indexer";
import { Button, Chip } from "@gnoworld/ui";
import { versionsOf } from "./versions.ts";

export interface VersionChipProps {
  realm: string;
  worlds: Worlds["worlds"];
  /** The universe's own prefix, "" for the default one ("/net/<id>" otherwise). */
  prefix: string;
}

export default function VersionChip({ realm, worlds, prefix }: VersionChipProps) {
  const family = versionsOf(worlds, realm);
  if (family === undefined) return null;
  if (family.newer === undefined)
    return <Chip>{`${family.mine} · the latest of ${String(family.count)} versions`}</Chip>;
  return (
    <Button href={realmRoute(family.newer.path, prefix)} size="s">
      {`${family.mine} · ${family.newer.version} is out`}
    </Button>
  );
}
