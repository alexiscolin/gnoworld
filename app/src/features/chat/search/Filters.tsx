// The chat search's filters under its field: the room, the sender, a link, the time (the canvas's chips), each writing its word into the field.
import { shortAddress } from "@gnoworld/schemas";
import { Chip, Cluster, Select } from "@gnoworld/ui";
import { roomLabel } from "../names.ts";
import { parseFind, setFilter, TIMES } from "./filters.ts";
import type { ChatSearchProps } from "./ChatSearch.tsx";

// A room's name in the field: its label, or its whole id when two rooms of the world share the label.
const wordOf = (room: string, rooms: readonly string[]) =>
  rooms.filter((each) => roomLabel(each) === roomLabel(room)).length > 1 ? room : roomLabel(room);

export function Filters({
  text,
  onText,
  time,
  onTime,
  who,
}: Pick<ChatSearchProps, "text" | "onText" | "time" | "onTime" | "who">) {
  const parsed = parseFind(text, who);
  const people = who.members.filter((member) => member !== who.me && member.startsWith("g1"));
  return (
    <div role="group" aria-label="Filters">
      <Cluster space="2xs">
        <Select
          label="In"
          value={parsed.room ?? ""}
          options={[
            { value: "", label: "In: all rooms" },
            ...who.rooms.map((room) => ({ value: room, label: `In: ${roomLabel(room)}` })),
          ]}
          onChange={(room) => {
            onText(setFilter(text, "in", room === "" ? undefined : wordOf(room, who.rooms)));
          }}
        />
        <Select
          label="From"
          value={parsed.from ?? ""}
          options={[
            { value: "", label: "From: anyone" },
            ...(who.me === undefined ? [] : [{ value: who.me, label: "From: me" }]),
            ...people.map((member) => ({ value: member, label: `From: ${shortAddress(member)}` })),
          ]}
          onChange={(from) => {
            onText(setFilter(text, "from", from === "" ? undefined : from === who.me ? "@me" : from));
          }}
        />
        <Chip
          selected={parsed.link}
          onClick={() => {
            onText(setFilter(text, "has", parsed.link ? undefined : "link"));
          }}
        >
          Has a link
        </Chip>
        <Select
          label="Time"
          value={time}
          options={TIMES}
          onChange={(value) => {
            onTime(TIMES.find((each) => each.value === value)?.value ?? "any");
          }}
        />
      </Cluster>
    </div>
  );
}
