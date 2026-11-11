// A room's questions to Jarvis, 30 an hour (D13985), a sliding hour: the time of each is kept, and a question past the
// 30th of the last hour is refused. The check and the count are one synchronous step. Memory alone, 10,000 rooms, the
// room asked in longest ago forgotten first.
import { remember } from "../remember.ts";

export const ROOM_QUESTIONS = 30;
const HOUR = 60 * 60_000;

export interface RoomCap {
  // Counts a question of the room at `at`; false, counting nothing, once its hour holds 30.
  take: (room: string, at: number) => boolean;
  // A question taken at `at` given back: jarvis made nothing for it.
  give: (room: string, at: number) => void;
}

export function makeRoomCap({ max = 10_000 }: { max?: number } = {}): RoomCap {
  const rooms = new Map<string, number[]>();
  return {
    take(room, at) {
      const times = (rooms.get(room) ?? []).filter((time) => time > at - HOUR);
      if (times.length >= ROOM_QUESTIONS) return false;
      times.push(at);
      remember(rooms, [room, times], max);
      return true;
    },
    give(room, at) {
      const times = rooms.get(room);
      const index = times?.indexOf(at) ?? -1;
      if (times !== undefined && index >= 0) times.splice(index, 1);
    },
  };
}
