import { typingAt, type Typing } from "@gnoworld/core";
import { Fragment, useEffect, useState } from "react";
import { isAccount } from "./names.ts";
import { Person } from "./Person.tsx";
import styles from "./RoomView.module.css";

// Who is typing, by name, on the page's clock (its own a room: CR4), drawn again as the next one's time ends, a timer
// firing early never seen as before it (CR6); under the lines and out of every live region, so a screen reader hears
// the lines and not each pause of another's.
export function Typists({ typing }: { typing: Typing | undefined }) {
  const [now, setNow] = useState(() => Date.now());
  const next = Math.min(...Object.values(typing ?? {}).filter((until) => until > now));
  useEffect(() => {
    if (next === Infinity) return;
    const timer = setTimeout(() => {
      setNow(Math.max(Date.now(), next));
    }, next - Date.now());
    return () => {
      clearTimeout(timer);
    };
  }, [next]);
  const nicks = typingAt(typing, now);
  const verb = nicks.length === 1 ? "is" : "are";
  // Up to three by name, which a wide screen holds; the line is cut to one (U2), its whole in its title: the names in
  // full, a guest said so.
  const named = nicks.map((nick, at) => (
    <Fragment key={nick}>
      {at === 0 ? "" : at === nicks.length - 1 ? " and " : ", "}
      <Person name={nick} guest={!isAccount(nick)} />
    </Fragment>
  ));
  const whole = nicks.map((nick) => (isAccount(nick) ? nick : `${nick} (guest)`));
  const title = `${whole.length > 1 ? `${whole.slice(0, -1).join(", ")} and ` : ""}${whole.at(-1) ?? ""} ${verb} typing`;
  return (
    <p className={["meta", styles["typing"]].join(" ")} title={nicks.length === 0 ? undefined : title}>
      {nicks.length === 0 ? null : nicks.length > 3 ? (
        "Several people are typing"
      ) : (
        <>
          {named} {verb} typing
        </>
      )}
    </p>
  );
}
