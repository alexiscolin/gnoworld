// The worlds' file, read once a view that needs every world opens (the passport's constellations, the search palette's systems and realms,
// 8i; a plate's connected worlds and realm card, 8g): only the cosmos's file lists them all. A read that fails gives an empty list, so a
// view falls back to what the device holds. It is the one query space reads too (features/universe/worldsFile.ts).
import type { Worlds } from "@gnoworld/schemas/indexer";
import { useQuery } from "@tanstack/react-query";
import { worldsOptions } from "./features/universe/worldsFile.ts";
import { queryClient } from "./lib/query/client.ts";

/** The file's worlds once `open`, undefined while they come. */
export function useWorldsFile(open: boolean): Worlds["worlds"] | undefined {
  const { data, isError } = useQuery({ ...worldsOptions(), enabled: open }, queryClient);
  return data?.worlds ?? (isError ? [] : undefined);
}
