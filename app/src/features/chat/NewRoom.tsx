// A room anyone signed in makes on the Earth (D394): a button, and a small dialog with the room's name, where the server's
// refusal is said. The name is typed as words and sent as the slug the server takes (core's rule: a-z, 0-9, single hyphens).
import { RoomName } from "@gnoworld/schemas";
import { Button, Dialog, Field, IconButton, Stack } from "@gnoworld/ui";
import { useState, type SyntheticEvent } from "react";
import { useNavigate } from "react-router";
import { pageRoomsApi } from "../../lib/api/rooms.ts";
import { useFull } from "./full.ts";
import { roomHref } from "./names.ts";
import { roomsChanged } from "./roomsListed.ts";

type Reason =
  Awaited<ReturnType<ReturnType<typeof pageRoomsApi>["make"]>> extends infer R
    ? R extends { ok: false; reason: infer Why }
      ? Why
      : never
    : never;

// What each refusal says to the person who typed the name.
const SAID: Partial<Record<Reason, string>> = {
  refused: "That name is not allowed, or a room already has it. Try another.",
  too_many: "You made 3 rooms today, or the Earth is full. Try again tomorrow.",
  not_ready: "The name could not be checked just now. Try again in a moment.",
  unauthenticated: "Your session ended: connect Adena again to make a room.",
  // A signed-in reader refused: the server holds no room-making for them here (a world's rooms are its moderators').
  forbidden: "Rooms here are made by the place's moderators.",
};

/** The slug a typed name makes: lower case, each run of other characters a hyphen, none at the ends. */
const slugOf = (typed: string): string =>
  typed
    .normalize("NFKD")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "");

export function NewRoom() {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string>();
  const [working, setWorking] = useState(false);
  const navigate = useNavigate();
  const full = useFull();
  const slug = slugOf(typed);
  const valid = RoomName.safeParse(slug).success;
  const submit = (event: SyntheticEvent) => {
    event.preventDefault();
    if (!valid || working) return;
    setWorking(true);
    setError(undefined);
    pageRoomsApi()
      .make(slug)
      .then(
        (made) => {
          setWorking(false);
          if (!made.ok) {
            setError(SAID[made.reason] ?? "The room could not be made. Try again.");
            return;
          }
          setOpen(false);
          setTyped("");
          roomsChanged();
          return navigate(roomHref(made.value.room, full));
        },
        () => {
          setWorking(false);
          setError("The room could not be made. Try again.");
        },
      );
  };
  return (
    <>
      <IconButton
        icon="plus"
        label="New room"
        size="xs"
        onClick={() => {
          setOpen(true);
        }}
      />
      <Dialog
        title="New room"
        kicker="THE EARTH"
        description="Anyone signed in can make three rooms a day. A room nobody writes in for 14 days is archived."
        open={open}
        onClose={() => {
          setOpen(false);
        }}
      >
        <form onSubmit={submit}>
          <Stack space="s">
            <Field
              label="Name"
              value={typed}
              onChange={setTyped}
              placeholder="coffee lovers"
              help={
                slug === "" ? "Letters and numbers; the room is #earth/your-name." : `The room will be #earth/${slug}.`
              }
              {...(error === undefined ? {} : { error })}
            />
            <Button emphasis="solid" type="submit" disabled={!valid || working}>
              Make the room
            </Button>
          </Stack>
        </form>
      </Dialog>
    </>
  );
}
