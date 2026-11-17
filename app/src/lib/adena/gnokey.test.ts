import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { GAS_FEE, GAS_WANTED } from "./gas.ts";
import { gnokeyCall } from "./gnokey.ts";

const ONYX = { chainId: "onyx-1", rpc: "https://rpc.onyx.testnets.gno.land:443" };
const CALL = { realm: "gno.land/r/sys/namereg/v0", func: "Register", args: ["nym-alice123"] };

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

// The words a POSIX shell makes of the command, the tool's name swapped for printf: what the tool would be given.
const wordsOf = (command: string): string[] => {
  expect(command.startsWith("gnokey ")).toBe(true);
  const printed = execFileSync("/bin/sh", ["-c", `printf '%s\\0' ${command.slice("gnokey ".length)}`], {
    encoding: "utf8",
  });
  return printed.split("\0").slice(0, -1);
};
const commandOf = (call = CALL): string => {
  const made = gnokeyCall(call, ONYX);
  if (!made.ok) throw new Error(`no command: argument ${String(made.argument)}`);
  return made.command;
};

describe("the command a call card prints for the command-line tool (D13880)", () => {
  it("calls the card's realm and function with its arguments, on its chain and node, with the card's deposit cap", () => {
    expect(wordsOf(commandOf())).toEqual([
      "maketx",
      "call",
      "-pkgpath",
      "gno.land/r/sys/namereg/v0",
      "-func",
      "Register",
      "-args",
      "nym-alice123",
      "-max-deposit",
      "5000000ugnot",
      "-gas-fee",
      `${String(GAS_FEE)}ugnot`,
      "-gas-wanted",
      String(GAS_WANTED),
      "-broadcast",
      "-chainid",
      "onyx-1",
      "-remote",
      "https://rpc.onyx.testnets.gno.land:443",
      "KEY",
    ]);
  });

  it("pays the chain's gas price for the gas it asks, never the old 1 GNOT (the wallet audit's low 3)", () => {
    expect(GAS_FEE).toBe(GAS_WANTED / 1000);
    expect(GAS_FEE).toBeLessThan(1_000_000);
    expect(GAS_WANTED).toBeGreaterThan(33_635_387);
  });

  it("keeps one line, and gives the shell each argument whole, whatever it holds", () => {
    const folder = mkdtempSync(join(tmpdir(), "gnoworld-quote-"));
    folders.push(folder);
    const planted = join(folder, "ran");
    const args = [
      `$(touch ${planted})`,
      `\`touch ${planted}\``,
      "it's",
      "'",
      "''",
      '"quoted" \\ back',
      `; touch ${planted}`,
      `&& touch ${planted}`,
      `| touch ${planted} &`,
      "-leading-dash",
      "--",
      "",
      "${HOME} $HOME ~ * ?",
      "é 漢字",
      "x".repeat(8192),
    ];
    const command = commandOf({ ...CALL, args });
    expect(command).not.toMatch(/[\n\r]/);
    const words = wordsOf(command);
    expect(words.filter((_, index) => words[index - 1] === "-args")).toEqual(args);
    expect(existsSync(planted)).toBe(false);
  });

  it.each([
    ["a newline", "one\ntwo"],
    ["a carriage return", "one\rtwo"],
    ["a tab", "one\ttwo"],
    ["an escape", "\u001b[31m"],
    ["a delete", "\u007f"],
    ["a C1 control", "\u0085"],
    ["a bidi override", "abc\u202edef"],
    ["a lone surrogate", "\ud800"],
  ])("prints no command for an argument with %s, and names which argument", (_name, bad) => {
    expect(gnokeyCall({ ...CALL, args: ["fine", bad] }, ONYX)).toEqual({ ok: false, argument: 1 });
  });

  it("names the first of two arguments it cannot hold, and refuses a NUL", () => {
    expect(gnokeyCall({ ...CALL, args: ["ok", "a\nb", "c\td"] }, ONYX)).toEqual({ ok: false, argument: 1 });
    expect(gnokeyCall({ ...CALL, args: ["\u0000"] }, ONYX)).toEqual({ ok: false, argument: 0 });
  });

  it("writes no -args for a function that takes none", () => {
    const words = wordsOf(commandOf({ ...CALL, args: [] }));
    expect(words).not.toContain("-args");
    expect(words.slice(0, 6)).toEqual(["maketx", "call", "-pkgpath", CALL.realm, "-func", "Register"]);
  });

  it("gives the shell the realm, the function, the chain and its node whole, whatever they hold", () => {
    const hostile = "x'; echo $(id) `id` && y";
    const made = gnokeyCall({ realm: hostile, func: hostile, args: [] }, { chainId: hostile, rpc: hostile });
    if (!made.ok) throw new Error("no command");
    const words = wordsOf(made.command);
    for (const flag of ["-pkgpath", "-func", "-chainid", "-remote"])
      expect(words[words.indexOf(flag) + 1]).toBe(hostile);
  });
});
