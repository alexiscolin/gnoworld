import { describe, expect, it } from "vitest";
import { pinProblem, saveProblem } from "./problem.ts";

// 4d's R9: each refusal of a pin, an unpin or a save has its own sentence; the reader is never left with silence, nor with
// one cause worded as another (a full room is no limit of requests).
describe("what the page says of a pin the server refused", () => {
  it.each([
    ["full", "This room has ten pins already. Unpin one first."],
    ["too_many", "Too many pins and unpins in a minute. Try again shortly."],
    ["forbidden", "Only this world's moderators can pin in this room."],
    ["unauthenticated", "Your session ended: log in again."],
    ["not_found", "This message is no longer in the room's history."],
    ["refused", "This message cannot be pinned: only a plain message of an account can."],
    ["not_ready", "The chat server could not be reached. Try again in a moment."],
    ["unavailable", "The chat server could not be reached. Try again in a moment."],
    ["internal", "The chat server could not be reached. Try again in a moment."],
    ["network", "The chat server could not be reached. Try again in a moment."],
    ["malformed", "Something unexpected came back. Please try again."],
    ["unsupported", "Something unexpected came back. Please try again."],
    ["too_large", "Something unexpected came back. Please try again."],
  ] as const)("says %s in its own words", (reason, line) => {
    expect(pinProblem(reason, "pin")).toEqual({ title: "Could not pin the message.", line });
  });

  it("says an unpin of a line that is not pinned as it is, and every other cause as a pin's", () => {
    expect(pinProblem("not_found", "unpin")).toEqual({
      title: "Could not unpin the message.",
      line: "It is not pinned any more.",
    });
    expect(pinProblem("too_many", "unpin")).toEqual({
      title: "Could not unpin the message.",
      line: "Too many pins and unpins in a minute. Try again shortly.",
    });
  });
});

describe("what the page says of a save the device did not take", () => {
  it("names the limit of 200 and what to do, and a line that cannot be saved", () => {
    expect(saveProblem("full")).toEqual({
      title: "Could not save the message.",
      line: "You have 200 saved messages. Remove one first.",
    });
    expect(saveProblem("none")).toEqual({
      title: "Could not save the message.",
      line: "This message cannot be saved.",
    });
  });
});
