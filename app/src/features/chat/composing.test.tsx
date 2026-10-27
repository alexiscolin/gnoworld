import type * as core from "@gnoworld/core";
import { foldEdits, type Line } from "@gnoworld/core";
import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useComposing } from "./composing.ts";
import type { Shown } from "./shown.tsx";

vi.mock("@gnoworld/core", async (importOriginal) => {
  const real = await importOriginal<typeof core>();
  return { ...real, foldEdits: vi.fn(real.foldEdits) };
});

// 4d-dm-bar: what the composer is told of the line it answers or corrects, in a direct message and in a room.
// The reader's account, which wrote the lines but "theirs" (m2).
const ME = "g1reader";
const line = (id: string, text: string, account = ME): Line => ({
  id,
  time: `2026-10-25T10:00:0${id.slice(1)}.000Z`,
  from: "a",
  account,
  text,
  kind: "message",
});
const LINES = [line("m1", "my words"), line("m2", "theirs", "g1other")];

let root: Root;
type Composed = ReturnType<typeof useComposing>;
let latest: Composed | undefined;
const say = vi.fn<Shown["say"]>(() => true);
function Probe({
  kind,
  lines,
  refused,
  who,
  me,
  seen,
}: {
  kind: "dm" | "room";
  who: string;
  me: string | undefined;
  lines: readonly Line[];
  refused: Refusal | undefined;
  seen: (result: Composed) => void;
}) {
  const shown = {
    kind,
    key: `${kind}:${who}`,
    view: { state: { lines } },
    writer: { refused },
    say,
  } as unknown as Shown;
  const result = useComposing(shown, me);
  useEffect(() => {
    seen(result);
  });
  return null;
}
interface Refusal {
  count: number;
  draft: string;
  why: string;
  tags?: { reply?: string; edit?: string };
}
const refusal = (count: number, tags?: Refusal["tags"]): Refusal => ({
  count,
  draft: "fixed",
  why: "Not sent.",
  ...(tags === undefined ? {} : { tags }),
});
const render = ({
  kind,
  lines,
  refused,
  who,
  me = ME,
}: {
  kind: "dm" | "room";
  lines: readonly Line[];
  refused?: Refusal;
  who: string;
  me?: string | null;
}) => {
  act(() => {
    root.render(
      <Probe
        kind={kind}
        lines={lines}
        refused={refused}
        who={who}
        me={me ?? undefined}
        seen={(result) => {
          latest = result;
        }}
      />,
    );
  });
};
const draw = (kind: "dm" | "room" = "dm", lines: readonly Line[] = LINES, refused?: Refusal) => {
  render({ kind, lines, ...(refused === undefined ? {} : { refused }), who: "x" });
};
// A direct message with another account, to tell conversations apart.
const drawWith = (who: string, refused?: Refusal) => {
  render({ kind: "dm", lines: LINES, ...(refused === undefined ? {} : { refused }), who });
};
const now = () => {
  if (latest === undefined) throw new Error("nothing drawn");
  return latest;
};

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  root = createRoot(document.createElement("div"));
  latest = undefined;
});
afterEach(() => {
  act(() => {
    root.unmount();
  });
  vi.clearAllMocks();
});

describe("useComposing", () => {
  it("folds no line while none is chosen, a conversation drawn again and again", () => {
    draw();
    draw("dm", [...LINES, line("m3", "more")]);
    draw("dm", [...LINES, line("m3", "more"), line("m4", "and more")]);
    expect(vi.mocked(foldEdits)).not.toHaveBeenCalled();
  });

  it("drops a reply asked before when an edit is asked, and sends the correction without it", () => {
    draw();
    act(() => now().view.onReply?.("m2"));
    expect(now().writer.replying?.id).toBe("m2");
    act(() => now().view.onEdit?.("m1"));
    expect(now().writer.replying).toBeUndefined();
    expect(now().writer.editing?.text).toBe("my words");
    act(() => {
      now().writer.onSay?.("my words, fixed");
    });
    expect(say).toHaveBeenCalledExactlyOnceWith("my words, fixed", { edit: "m1" });
    expect(now().writer.replying).toBeUndefined();
  });

  it("sends nothing for words left as they were, trimmed, and closes the edit", () => {
    draw();
    act(() => now().view.onEdit?.("m1"));
    let went: boolean | undefined;
    act(() => {
      went = now().writer.onSay?.("  my words ");
    });
    expect(went).toBe(true);
    expect(say).not.toHaveBeenCalled();
    expect(now().writer.editing).toBeUndefined();
  });

  it("keeps the edit open when the correction did not go, and closes it, its box taking the focus, when it did", () => {
    draw();
    act(() => now().view.onEdit?.("m1"));
    say.mockReturnValueOnce(false);
    act(() => {
      now().writer.onSay?.("changed");
    });
    expect(now().writer.editing?.text).toBe("my words");
    expect(now().writer.focus).toBeUndefined();
    act(() => {
      now().writer.onSay?.("changed");
    });
    expect(now().writer.editing).toBeUndefined();
    expect(now().writer.focus).toBe(true);
  });

  it("takes the focus back to the box when an edit is cancelled, for its conversation alone", () => {
    draw();
    act(() => now().view.onEdit?.("m1"));
    act(() => now().writer.onCancelEdit?.());
    expect(now().writer.focus).toBe(true);
    draw("room");
    expect(now().writer.focus).toBeUndefined();
    draw();
    expect(now().writer.focus).toBeUndefined();
  });

  // slice-4-room-edit (docs/decisions.md, 2026-10-28): a room's lines are corrected as a direct message's are.
  const edit = (id: string) => {
    act(() => now().view.onEdit?.(id));
  };
  const save = (words: string) => {
    act(() => {
      now().writer.onSay?.(words);
    });
  };

  it("offers a room an edit, its line's words in the composer, and sends the correction tagged with the line", () => {
    draw("room");
    edit("m1");
    expect(now().writer.editing?.text).toBe("my words");
    save("my words, fixed");
    expect(say).toHaveBeenCalledExactlyOnceWith("my words, fixed", { edit: "m1" });
    expect(now().writer.editing).toBeUndefined();
    expect(now().writer.focus).toBe(true);
  });

  it("sends nothing for a room's words left as they were, and keeps its edit open when the correction did not go", () => {
    draw("room");
    edit("m1");
    save(" my words ");
    expect(say).not.toHaveBeenCalled();
    expect(now().writer.editing).toBeUndefined();
    edit("m1");
    say.mockReturnValueOnce(false);
    save("changed");
    expect(now().writer.editing?.text).toBe("my words");
  });

  // R6 (redpass-red): the menu offers Edit on the reader's own lines alone, and the composer holds the same line: an
  // edit asked for another's line, by a buggy caller, would send a correction Ergo's bot hides as not_their_edit, a
  // strike against its sender.
  it.each(["dm", "room"] as const)("opens no edit of a line that is not the reader's, in a %s", (kind) => {
    draw(kind);
    edit("m2");
    expect(now().writer.editing).toBeUndefined();
    expect(now().writer.onCancelEdit).toBeUndefined();
    edit("m1");
    expect(now().writer.editing?.text).toBe("my words");
  });

  it.each([
    ["a guest", null],
    ["another account", "g1other"],
  ])("opens no edit for %s as the reader of the line", (_, me) => {
    render({ kind: "room", lines: LINES, who: "x", me });
    edit("m1");
    expect(now().writer.editing).toBeUndefined();
  });

  it("drops a room's reply when an edit is asked, and ends the edit when a reply is asked", () => {
    draw("room");
    act(() => now().view.onReply?.("m2"));
    edit("m1");
    expect(now().writer.replying).toBeUndefined();
    act(() => now().view.onReply?.("m2"));
    expect(now().writer.editing).toBeUndefined();
    expect(now().writer.replying?.id).toBe("m2");
  });

  it("offers no edit of a room's orphan correction, and keeps a room's edit its room's alone", () => {
    draw("room", [...LINES, { ...line("m3", "a correction"), edits: "m9" }]);
    edit("m3");
    expect(now().writer.editing).toBeUndefined();
    draw("room");
    edit("m1");
    expect(now().writer.editing?.text).toBe("my words");
    render({ kind: "room", lines: LINES, who: "y" });
    expect(now().writer.editing).toBeUndefined();
    expect(now().writer.focus).toBeUndefined();
  });

  // /code-review on 4d's DM bar (CR7): Reply asked during an edit was stored and hidden by the writer, then came back
  // over the next composer, on a line the reader may have forgotten.
  it("ends an edit when a reply is asked, and sends the answer without the correction", () => {
    draw();
    act(() => now().view.onEdit?.("m1"));
    act(() => now().view.onReply?.("m2"));
    expect(now().writer.editing).toBeUndefined();
    expect(now().writer.replying?.id).toBe("m2");
    act(() => {
      now().writer.onSay?.("an answer");
    });
    expect(say).toHaveBeenCalledExactlyOnceWith("an answer", { reply: "m2" });
  });

  it("asks nothing of the focus when a reply is asked with no edit open", () => {
    draw();
    act(() => now().view.onReply?.("m2"));
    expect(now().writer.focus).toBeUndefined();
  });

  // /code-review on 4d's DM bar (CR5): a line with `edits` set is an orphan correction, whose original left the window:
  // a correction of it would name a line nothing folds into, and show as a new one.
  it("offers no edit of an orphan correction", () => {
    const orphan: Line = { ...line("m3", "a correction"), edits: "m9" };
    draw("dm", [...LINES, orphan]);
    act(() => now().view.onEdit?.("m3"));
    expect(now().writer.editing).toBeUndefined();
  });

  // /code-review on 4d's DM bar (CR6): the line's text is what compose sent after its one-slash escape; the box showed it
  // as it is, where a changed "/x2" reads as an unknown command and an unchanged "/x" was a plain "/x".
  it("shows a line that starts with a slash as the box needs it, and sends it escaped again when changed", () => {
    draw("dm", [line("m1", "/x"), line("m2", "theirs")]);
    act(() => now().view.onEdit?.("m1"));
    expect(now().writer.editing?.text).toBe("//x");
    act(() => {
      now().writer.onSay?.("//x2");
    });
    expect(say).toHaveBeenCalledExactlyOnceWith("//x2", { edit: "m1" });
  });

  it("sends nothing for a slashed line left as it was", () => {
    draw("dm", [line("m1", "/x"), line("m2", "theirs")]);
    act(() => now().view.onEdit?.("m1"));
    act(() => {
      now().writer.onSay?.("//x");
    });
    expect(say).not.toHaveBeenCalled();
    expect(now().writer.editing).toBeUndefined();
  });

  // /code-review on 4d's DM bar (CR2): a refused correction came back as a plain draft, and the next Send posted it as a
  // new message beside the original; a refused reply lost its link to the line.
  it("takes a refused correction up again: its line edited, its box the draft put back, its refusal told", () => {
    draw();
    draw("dm", LINES, refusal(1, { edit: "m1" }));
    expect(now().writer.editing).toEqual({ text: "my words", asked: 1, back: true });
    act(() => {
      now().writer.onSay?.("fixed");
    });
    expect(say).toHaveBeenCalledExactlyOnceWith("fixed", { edit: "m1" });
    expect(now().writer.editing).toBeUndefined();
  });

  it("takes a refused reply up again, and a later refusal again", () => {
    draw();
    draw("dm", LINES, refusal(1, { reply: "m2" }));
    expect(now().writer.replying?.id).toBe("m2");
    act(() => {
      now().writer.onSay?.("answer");
    });
    expect(say).toHaveBeenLastCalledWith("answer", { reply: "m2" });
    expect(now().writer.replying).toBeUndefined();
    draw("dm", LINES, refusal(2, { reply: "m1" }));
    expect(now().writer.replying?.id).toBe("m1");
  });

  it("takes a refused line's tags in place of the reply asked since, and drops the reply of a correction", () => {
    draw();
    act(() => now().view.onReply?.("m1"));
    draw("dm", LINES, refusal(1, { reply: "m2" }));
    expect(now().writer.replying?.id).toBe("m2");
    draw("dm", LINES, refusal(2, { edit: "m1" }));
    expect(now().writer.replying).toBeUndefined();
    expect(now().writer.editing?.back).toBe(true);
  });

  it("takes nothing up while a correction is open, a refusal with no tags, nor one heard as the conversation came in view", () => {
    draw("dm", LINES, refusal(3, { reply: "m2" }));
    expect(now().writer.replying).toBeUndefined();
    draw("dm", LINES, refusal(4));
    expect(now().writer.replying).toBeUndefined();
    act(() => now().view.onEdit?.("m1"));
    draw("dm", LINES, refusal(5, { reply: "m2" }));
    expect(now().writer.replying).toBeUndefined();
    expect(now().writer.editing).toEqual({ text: "my words", asked: 1 });
  });

  // The second red pass on the DM bar (R7): a refusal heard while another conversation was in view was dropped as its own
  // came in view, and the next Send posted a new message. Decided: it is taken up as its conversation comes into view.
  it("takes up a refusal heard while another conversation was in view, as its own comes into view", () => {
    drawWith("a");
    drawWith("b", refusal(1, { edit: "m1" }));
    expect(now().writer.editing).toEqual({ text: "my words", asked: 1, back: true });
    drawWith("c", refusal(1, { reply: "m2" }));
    expect(now().writer.replying?.id).toBe("m2");
  });

  it("takes a refusal up once: a conversation left and come back to is not asked again", () => {
    drawWith("a");
    drawWith("b", refusal(1, { reply: "m2" }));
    act(() => {
      now().writer.onSay?.("answer");
    });
    expect(now().writer.replying).toBeUndefined();
    drawWith("a");
    drawWith("b", refusal(1, { reply: "m2" }));
    expect(now().writer.replying).toBeUndefined();
  });

  it("says a refusal heard while a correction is open leaves its draft a new message, and tells no other", () => {
    draw();
    act(() => now().view.onEdit?.("m1"));
    draw("dm", LINES, refusal(1, { edit: "m2" }));
    expect(now().writer.editing).toEqual({ text: "my words", asked: 1 });
    expect(now().writer.refused?.why).toBe("Not sent. It will go as a new message, not as the correction it was.");
    draw("dm", LINES, refusal(2));
    expect(now().writer.refused).toBeUndefined();
  });

  it("says it of a reply too, and of a refusal that keeps its place: no word to a refusal taken up", () => {
    draw();
    act(() => now().view.onEdit?.("m1"));
    draw("dm", LINES, refusal(1, { reply: "m2" }));
    expect(now().writer.refused?.why).toBe("Not sent. It will go as a new message, not as the reply it was.");
    act(() => {
      now().writer.onSay?.("my words");
    });
    draw("dm", LINES, refusal(2, { reply: "m2" }));
    expect(now().writer.refused).toBeUndefined();
    expect(now().writer.replying?.id).toBe("m2");
  });

  it("takes up a refusal heard in a room or of a line gone from the window by no line", () => {
    draw("room");
    draw("room", LINES, refusal(1, { edit: "m1" }));
    expect(now().writer.editing).toBeUndefined();
    draw("dm", LINES, refusal(1, { reply: "m9" }));
    expect(now().writer.replying).toBeUndefined();
  });
});
