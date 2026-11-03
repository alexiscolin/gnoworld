// "Here, right now" (frame 26): the people the chat's rooms list, once the page has connected. Before that, and for rooms with
// nobody yet in them, the store holds nothing to say: no fact is drawn, never a 0, its place kept empty. The rate stays out: no source gives it.
import { lazy, Suspense } from "react";
import type { AppState } from "../../store/index.ts";
import { useApp } from "../../storeContext.tsx";
import styles from "./Here.module.css";

// The fact's figure comes in its own chunk, once there is someone to count: the first screen does not pay for it.
const Facts = lazy(() => import("./Facts.tsx").then(({ Facts }) => ({ default: Facts })));

const people = ({ chat }: AppState) =>
  chat.me === undefined ? 0 : new Set(Object.values(chat.rooms).flatMap((room) => room.members)).size;

export function Here() {
  const here = useApp(people);
  // Under the plate's breakpoint the place is the fact's height, drawn or not: the count comes after the door and the chat (7e), and nothing
  // under it moves. The place holds no child while the fact is not drawn, so the stylesheet frees it from 1,280 px.
  return (
    <div className={styles["here"]}>
      {here === 0 ? null : (
        <Suspense fallback={null}>
          <Facts here={here} />
        </Suspense>
      )}
    </div>
  );
}
