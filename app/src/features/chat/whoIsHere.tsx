// Who is here in an account's chat (moved out of Loaded.tsx): each a button to write to them, which opens the conversation and
// gives its composer the focus (U12), with the country each declared.
import type { Line } from "@gnoworld/core";
import { useState } from "react";
import { useSearchParams } from "react-router";
import { asksFull } from "./full.ts";
import { dmParams } from "./names.ts";
import { People } from "./People.tsx";

// The conversation opened from who is here, whose composer takes the focus as its button goes (U12): asked while it is
// in view, `partner` the one in view, never again once the reader left it (CR6).
export function useOpened(partner: string | undefined) {
  const [opened, setOpened] = useState<{ partner: string; seen: boolean }>();
  if (opened?.seen === false && partner === opened.partner) setOpened({ ...opened, seen: true });
  if (opened?.seen === true && partner !== opened.partner) setOpened(undefined);
  return {
    focus: opened !== undefined && opened.partner === partner,
    open: (other: string) => {
      setOpened({ partner: other, seen: false });
    },
  };
}

// Who is here, a button on each to write to them: it opens the conversation (`open`) and asks for it in the address.
// Apart from the room's element, which each line draws again: who is here keeps its drawing (the compiler).
export function useWhoIsHere(
  state: { members: readonly string[]; lines: readonly Line[] } | undefined,
  { connected, me }: { connected: boolean; me: string | undefined },
  open: (partner: string) => void,
) {
  const [params, setParams] = useSearchParams();
  const full = asksFull(params);
  const onMessage = (other: string) => {
    open(other);
    setParams(dmParams(other, full));
  };
  return (
    <People
      members={state?.members ?? []}
      connected={connected}
      me={me}
      onMessage={onMessage}
      canFollow
      lines={state?.lines}
    />
  );
}
