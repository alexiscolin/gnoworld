// The hero's people online (8i), asked once the page runs and while `wanted` (the default universe's home: the relay's rooms are its own):
// "coming" while it is asked, none when the server does not say and in the page the build writes, which a reader with no script reads, so
// the hero counts the worlds there as before (F4641). A home that mounts again (the way back from a page's flight) opens with the kept count.
import { useQuery } from "@tanstack/react-query";
import { queryClient } from "../../lib/query/client.ts";
import { useWoken } from "./clock.ts";
import type { People } from "./Hero.tsx";
import { peopleOptions } from "./peopleQuery.ts";

export function usePeople(wanted: boolean): People | undefined {
  const woken = useWoken();
  const { data, isError } = useQuery({ ...peopleOptions, enabled: wanted }, queryClient);
  if (!wanted || !woken) return undefined;
  // The reader is on the site: never fewer than one online (Alexis, 2026-11-07, D352).
  if (data !== undefined) return { ...data, online: Math.max(1, data.online) };
  return isError ? undefined : "coming";
}
