// node --test tests/e2e/crowd.test.mjs: the crowd refuses every base that is not the workshop's own machine.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { countryOf, keyOf, languages, parse, saidBy, scriptOf } from "./crowd.mjs";

test("refuses any base but 127.0.0.1 or localhost", () => {
  for (const base of [
    "https://gnoworld.example",
    "http://10.0.0.5:5198",
    "http://127.0.0.1.evil.com",
    "http://localhost@evil.com",
    "https://127.0.0.1",
  ])
    assert.throws(() => parse(["--base", base]), /only the workshop/, base);
  assert.equal(parse([]).base, "http://127.0.0.1:5198");
  assert.equal(parse(["--base", "http://localhost:5198", "--people", "3"]).writers, 3);
});

test("reads the demo's script: its lines, its one world, the writers each room needs", () => {
  const file = new URL("crowd-script.txt", import.meta.url);
  const { lines, rooms } = scriptOf(readFileSync(file, "utf8"), 6);
  assert.ok(lines.length >= 20);
  assert.deepEqual(rooms, [
    "earth",
    "govdao",
    "gnoswap",
    "/r/nym-alexiscolin000/gnogolf/golf/v2",
    "earth/builders",
    "earth/lisbon-meetup",
  ]);
  for (const room of rooms)
    for (const kind of ["say", "reply", "thread", "react", "vote", "edit"])
      assert.ok(
        lines.some((line) => line.room === room && line.kind === kind),
        `${room} has a ${kind}`,
      );
  assert.ok(lines.every(({ text }) => text.length > 0 && !/^@jarvis/i.test(text)));
  const path = join(tmpdir(), "crowd-script-test.txt");
  writeFileSync(path, "earth|hello\n# a note\n\n");
  assert.deepEqual(parse(["--script", path, "--every", "3"]).script, {
    lines: [{ room: "earth", kind: "say", text: "hello" }],
    rooms: ["earth"],
  });
  assert.equal(parse(["--script", path]).every, 10);
  assert.equal(parse(["--script", path]).minutes, 0);
  assert.equal(parse(["--script", path, "--minutes", "15"]).minutes, 15);
});

test("reads a reply, a thread's line, a reaction, a break and a poll's bars", () => {
  const { lines } = scriptOf(
    "earth|a list:\\n- one\\n- two\nearth|reply|yes\nearth|thread|in it\nearth|react|👍\nearth|/poll Q? | a | b",
    1,
  );
  assert.deepEqual(
    lines.map(({ kind, text }) => [kind, text]),
    [
      ["say", "a list:\n- one\n- two"],
      ["reply", "yes"],
      ["thread", "in it"],
      ["react", "👍"],
      ["say", "/poll Q? | a | b"],
    ],
  );
});

test("refuses a script that cannot be said as written", () => {
  assert.throws(() => scriptOf("earth|a\nearth|react|🙂", 5), /a reaction is one of/);
  assert.throws(() => scriptOf("earth|reply|a", 5), /comes after a line said there/);
  assert.throws(() => scriptOf("earth|a\nmars|b", 5), /hub's world/);
  assert.throws(() => scriptOf("earth|a\n/r/|b", 5), /hub's world/);
  assert.throws(() => scriptOf("earth|a\ngovdao|b\nbubble|c", 2), /a writer in each/);
  assert.throws(() => scriptOf("earth|@jarvis what is a realm", 5), /never starts with @jarvis/);
  assert.throws(() => scriptOf("earth|a\ngovdao|b", 1), /a writer in each/);
  assert.throws(() => scriptOf("", 5), /a script line/);
});

const PLAIN = ["say", "reply", "thread", "edit"];
const CARD = /^\/(market|trending|proposals|poll)\b/i;
const marks = (text) => text.match(/\*\*|`|^> |^- |\n|@\{prev\}|^\/me /gm)?.join("") ?? "";
const script = () => scriptOf(readFileSync(new URL("crowd-script.txt", import.meta.url), "utf8"), 6);

test("the language table holds every plain line of every room, in the room's language, its marks kept", () => {
  const { lines, rooms } = script();
  assert.deepEqual(Object.keys(languages).sort(), [...rooms].sort());
  assert.deepEqual(
    rooms.map((room) => [room, languages[room].language, languages[room].country]),
    [
      ["earth", "fr", "FR"],
      ["govdao", "de", "DE"],
      ["gnoswap", "it", "IT"],
      ["/r/nym-alexiscolin000/gnogolf/golf/v2", "es", "ES"],
      ["earth/builders", "ja", "JP"],
      ["earth/lisbon-meetup", "pt", "PT"],
    ],
  );
  for (const room of rooms) {
    const wanted = lines.filter((line) => line.room === room && PLAIN.includes(line.kind) && !CARD.test(line.text));
    assert.deepEqual(
      Object.keys(languages[room].lines).sort(),
      [...new Set(wanted.map(({ text }) => text))].sort(),
      room,
    );
    for (const [english, said] of Object.entries(languages[room].lines)) {
      assert.notEqual(said, english, `${room}: ${english}`);
      assert.equal(marks(said), marks(english), `${room}: ${english}`);
    }
  }
});

test("the script itself is in English, its foreign lines left to the table", () => {
  for (const { text, kind } of script().lines) if (PLAIN.includes(kind)) assert.match(text, /^[\x20-\x7e\n]*$/, text);
});

test("only a room's first writer speaks its language; the others, and a card, say the script's line", () => {
  const { rooms } = script();
  const first = { n: 1, guest: false };
  const room = rooms[1];
  const english = "gm, anyone reading the new GovDAO proposal?";
  assert.equal(saidBy(first, rooms, room, english), languages[room].lines[english]);
  assert.equal(saidBy({ n: 1 + rooms.length, guest: false }, rooms, room, english), english);
  assert.equal(saidBy({ n: 1, guest: true }, rooms, room, english), english);
  assert.equal(saidBy(first, rooms, room, "/poll A? | a | b"), "/poll A? | a | b");
  assert.equal(saidBy(first, rooms, room, "no such line"), "no such line");
  assert.equal(saidBy(first, undefined, room, english), english);
  assert.equal(countryOf({ n: 1 }, rooms), "DE");
  assert.equal(countryOf({ n: 1 + rooms.length }, rooms), "US");
  assert.equal(countryOf({ n: 1 + 2 * rooms.length }, rooms), undefined);
  assert.equal(countryOf({ n: 1 }, undefined), undefined);
});

test("finds a line again by the words the room shows, not the marks typed", () => {
  assert.equal(keyOf("gm **bold** and *italic* here"), "gm bold and italic here");
  assert.equal(keyOf("- one\n- two"), "one");
  assert.equal(keyOf("1. first\n2. second"), "first");
  assert.equal(keyOf("/me waves hello"), "waves hello");
  assert.equal(keyOf("> a quote"), "a quote");
  assert.equal(keyOf("hello @g1abc how are you"), "hello");
});
