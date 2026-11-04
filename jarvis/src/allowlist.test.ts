import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { logger } from "../../server/src/log.ts";
import { allowlist, isName } from "./allowlist.ts";
import { gnomcpTools } from "./gnomcpTools.ts";

const PEPPER = "a-pepper-of-forty-characters-0123456789";

// The lines a logger writes, each without its time.
const capture = () => {
  const lines: string[] = [];
  return {
    log: logger(PEPPER, (line) => lines.push(line)),
    written: () => lines.map((line) => line.replace(/^\{"time":"[^"]+",/, "{")),
  };
};

// Two tools of a test's own, built in each test: a lookup and a strict object for its arguments.
// Echo's arguments parse to something other than what was sent (a text trimmed, a count defaulted), so a test can tell
// the parsed arguments from the input.
const echo = () => ({
  name: "echo",
  description: "Says a short text back.",
  args: z.strictObject({ text: z.string().trim().max(8), times: z.int().min(1).max(3).default(1) }),
});
const height = () => ({
  name: "height",
  description: "The chain's latest block height.",
  args: z.strictObject({ profile: z.enum(["onyx", "gnoland1"]) }),
});

describe("allowlist: what the model is offered", () => {
  it("offers exactly its table, in its order, each schema drawn from the tool's own Zod object", () => {
    const { log } = capture();
    const tools = allowlist([echo(), height()], log);
    expect(tools.offered()).toEqual([
      {
        name: "echo",
        description: "Says a short text back.",
        input_schema: z.toJSONSchema(echo().args, { io: "input" }),
      },
      {
        name: "height",
        description: "The chain's latest block height.",
        input_schema: z.toJSONSchema(height().args, { io: "input" }),
      },
    ]);
    // The model writes the input: a field with a default is one it may leave out.
    expect(tools.offered()[0]?.input_schema["required"]).toEqual(["text"]);
  });

  it("offers gnomcp's reads name for name, each a strict object schema made of JSON alone", () => {
    const { log } = capture();
    const definitions = gnomcpTools({ chains: ["onyx", "gnoland1"], indexed: ["onyx"] });
    const offered = allowlist(definitions, log).offered();
    expect(offered.map((tool) => tool.name)).toEqual(definitions.map((definition) => definition.name));
    for (const tool of offered) {
      expect(tool.input_schema.type).toBe("object");
      expect(tool.input_schema["additionalProperties"]).toBe(false);
      // What reaches the API is the JSON text of the object: nothing but JSON, and the same object back.
      expect(JSON.parse(JSON.stringify(tool))).toStrictEqual(tool);
    }
  });

  it("gives a new list each time, so a caller that changes one changes nothing offered after", () => {
    const { log } = capture();
    const tools = allowlist([echo()], log);
    const first = tools.offered();
    first.push({ name: "bash", description: "A shell.", input_schema: { type: "object" } });
    // A tool and its schema too: 10e marks the last tool for the prompt cache, and the schema stays the Zod object's.
    const [tool] = first;
    if (tool === undefined) throw new Error("echo was not offered");
    tool.description = "Runs any shell command.";
    tool.input_schema["properties"] = { command: { type: "string" } };
    Object.assign(tool, { cache_control: { type: "ephemeral" } });
    expect(tools.offered()).toStrictEqual([
      {
        name: "echo",
        description: "Says a short text back.",
        input_schema: { ...z.toJSONSchema(echo().args, { io: "input" }), type: "object" },
      },
    ]);
  });
});

describe("allowlist: every call checked and logged", () => {
  it("accepts a call by its name and its arguments, returns them parsed, and logs the call without them", () => {
    const { log, written } = capture();
    const tools = allowlist([echo(), height()], log);
    expect(tools.check("echo", { text: " planted ", times: 2 })).toStrictEqual({
      ok: true,
      name: "echo",
      args: { text: "planted", times: 2 },
    });
    expect(tools.check("echo", { text: "hi" })).toStrictEqual({
      ok: true,
      name: "echo",
      args: { text: "hi", times: 1 },
    });
    expect(written()).toEqual([
      `{"event":"jarvis_tool_call","tool":"echo"}\n`,
      `{"event":"jarvis_tool_call","tool":"echo"}\n`,
    ]);
    expect(written().join("")).not.toContain("planted");
  });

  it.each(["gno_call", "gno_addpkg", "gno_key_send", "gno_run", "gno_faucet_fund", "bash", "web_fetch"])(
    "refuses %s, which is no tool of its table, and logs the refusal by that name",
    (name) => {
      const { log, written } = capture();
      const tools = allowlist(gnomcpTools({ chains: ["onyx"], indexed: ["onyx"] }), log);
      expect(tools.check(name, { profile: "onyx", path: "gno.land/r/demo/boards" })).toEqual({
        ok: false,
        reason: "unknown_tool",
      });
      expect(written()).toEqual([`{"event":"jarvis_tool_refused","tool":"${name}","reason":"unknown_tool"}\n`]);
    },
  );

  it.each(["constructor", "__proto__", "toString", "hasOwnProperty", "valueOf"])(
    "refuses %s, a name every object answers to",
    (name) => {
      const { log } = capture();
      expect(allowlist([echo()], log).check(name, {})).toEqual({ ok: false, reason: "unknown_tool" });
    },
  );

  it.each([
    () => "Bash",
    () => "../echo",
    () => "echo now",
    () => "",
    () => `e${"x".repeat(64)}`,
    () => `echo${String.fromCodePoint(0x202e)}`,
    () => `echo\n{"event":"jarvis_tool_call","tool":"echo"}`,
  ])("logs a name the model made up, off the pattern, as one fixed word (%#)", (made) => {
    const { log, written } = capture();
    const name = made();
    expect(allowlist([echo()], log).check(name, { text: "hi" })).toEqual({ ok: false, reason: "unknown_tool" });
    expect(written()).toEqual([`{"event":"jarvis_tool_refused","tool":"<malformed>","reason":"unknown_tool"}\n`]);
  });

  it.each([
    ["an extra field", () => ({ text: "hi", shell: "planted-argument" })],
    ["a wrong type", () => ({ text: 42 })],
    ["an over-long string", () => ({ text: "planted-argument" })],
    ["a number out of range", () => ({ text: "hi", times: 4 })],
    ["a missing field", () => ({ times: 1 })],
    ["no object", () => "planted-argument"],
    ["null", () => null],
    ["an array", () => ["planted-argument"]],
  ])("refuses %s, and logs the refusal by the tool's name and nothing the arguments held", (_case, input) => {
    const { log, written } = capture();
    expect(allowlist([echo()], log).check("echo", input())).toEqual({ ok: false, reason: "bad_arguments" });
    expect(written()).toEqual([`{"event":"jarvis_tool_refused","tool":"echo","reason":"bad_arguments"}\n`]);
  });

  it("never throws, and accepts a call only for a name of its table whose schema reads the arguments", () => {
    const names = fc.oneof(fc.constantFrom("echo", "height", "gno_call", "__proto__"), fc.string({ unit: "binary" }));
    fc.assert(
      fc.property(names, fc.jsonValue(), (name, input) => {
        const { log, written } = capture();
        const tools = allowlist([echo(), height()], log);
        const result = tools.check(name, input);
        const schema = name === "echo" ? echo().args : name === "height" ? height().args : undefined;
        expect(result.ok).toBe(schema?.safeParse(input).success ?? false);
        expect(written()).toHaveLength(1);
      }),
    );
  });
});

describe("allowlist: its table", () => {
  it("refuses a table that names a tool twice", () => {
    const { log } = capture();
    expect(() => allowlist([echo(), height(), echo()], log)).toThrow("jarvis tool echo: defined twice");
  });

  it.each(["Echo", "load-skill", "1echo", "", `e${"x".repeat(64)}`])(
    "refuses a tool named %j, which is no name",
    (name) => {
      const { log } = capture();
      expect(() => allowlist([{ ...echo(), name }], log)).toThrow(`jarvis tool ${JSON.stringify(name)}: not a name`);
    },
  );

  it("takes a name of a lower-case letter, then up to 63 lower-case letters, digits and underscores", () => {
    expect(isName("a")).toBe(true);
    expect(isName(`a${"b_9".repeat(21)}`)).toBe(true);
    expect(isName(`a${"b".repeat(64)}`)).toBe(false);
    expect(isName("gno_read")).toBe(true);
    expect(isName("_read")).toBe(false);
    expect(isName("read\n")).toBe(false);
    expect(isName("read ")).toBe(false);
  });
});
