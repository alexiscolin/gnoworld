// A build empties its folder before it writes: GNOWORLD_BUILD set but empty, which `??` keeps, would name the app itself and wipe it.
/** The folder a build writes into: app/build, or GNOWORLD_BUILD's; an empty GNOWORLD_BUILD stops the build. */
export function buildDirectoryOf(asked: string | undefined): string {
  if (asked === undefined) return "build";
  if (asked.trim() === "") throw new Error("GNOWORLD_BUILD is empty: a build empties its folder, here the app itself");
  return asked;
}
