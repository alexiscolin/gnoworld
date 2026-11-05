// A world's pinned actions (D271), as the data file holds them and as the site gives them: each with the view of its own realm in the
// world's universe, whose path names the chain the action is read and signed on.

/** A call a world's team pins: its label, the call, and its realm's view. */
export interface PinnedCall {
  label: string;
  action: { realm: string; function: string; args: Readonly<Record<string, string>> };
  view: string;
}

/** A pinned action as the data file holds it. */
export interface PinnedRow {
  label: string;
  realm: string;
  function: string;
  args: Readonly<Record<string, string>>;
}

/** The site's view of a realm in a universe: /r/<path> in the default one, /net/<id>/r/<path> in another. */
export const realmViewOf = (universe: { id: string; isDefault: boolean }, realm: string): string =>
  `${universe.isDefault ? "" : `/net/${universe.id}`}/r/${realm.slice("gno.land/r/".length)}`;

/** A world's pinned rows, each with its view in the world's universe. */
export const pinnedOf = (rows: readonly PinnedRow[], universe: { id: string; isDefault: boolean }): PinnedCall[] =>
  rows.map(({ label, realm, function: name, args }) => ({
    label,
    action: { realm, function: name, args },
    view: realmViewOf(universe, realm),
  }));
