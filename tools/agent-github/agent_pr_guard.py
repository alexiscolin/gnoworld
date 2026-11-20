"""A Claude Code PreToolUse hook, from the project's own settings (D14000 C, D14013): agent-pr runs outside the sandbox, so a call
naming it is taken only in one strict form, every argument from a closed set of characters: nothing chained, no glob, no variable,
nothing zsh could expand into code; the helper written with its absolute path or from the session's own home (`~/`), as the
project's settings name it. And no tool that reads (Bash, Read, Grep, Glob) may name the agent's state folder, where its token lives:
an advisory check (a respelt path passes it), the Read deny and the sandbox's denyRead being what holds.
Exit 2 refuses, the reason on stderr, and so does a call it cannot read: any other failure would let the call through.
Usage, as installed: python3 -I agent_pr_guard.py <helper's absolute path>; the call on stdin."""
import json
import os
import re
import sys

helper = sys.argv[1]
uid = os.getuid()
REPO = r"[A-Za-z0-9][A-Za-z0-9-]{0,38}/[A-Za-z0-9_][A-Za-z0-9._-]{0,99}"
FILE = rf"(?:/private)?/tmp/claude-{uid}/agent-pr/(?:[A-Za-z0-9_][A-Za-z0-9._-]*/)*[A-Za-z0-9_][A-Za-z0-9._-]*"
BRANCH = r"agent(?:/[A-Za-z0-9_][A-Za-z0-9._-]{0,99}){1,8}"
# The session's own home alone: never ~user, ~+ or ~-, a quoted or escaped tilde, a variable, or a folder below it.
NAMED = rf"(?:{re.escape(helper)}|~/\.local/bin/agent-pr)"
CALL = re.compile(rf"{NAMED} (?:push {REPO} {FILE}|open {REPO} {BRANCH} {FILE})")
READERS = {"Bash", "Read", "Grep", "Glob"}


def refuse(why):
    print(f"agent-pr guard: {why}", file=sys.stderr)
    sys.exit(2)


def check(call):
    tool, given = call.get("tool_name", ""), call.get("tool_input", {})
    if not isinstance(tool, str):
        refuse("a call it cannot read")
    if tool in READERS and ".local/share/agent-github" in json.dumps(given):
        refuse("no tool reads or names the agent's state folder (~/.local/share/agent-github): its token lives there")
    if tool == "Bash":
        command = given.get("command", "")
        # Claude Code strips the shell's quotes and escapes from a command's first word before it matches the exclusion
        # (2.1.328): the helper is looked for in the command so read, and only its one plain form taken.
        plain = re.sub(r"[\\'\"$`]", "", command)
        if ".local/bin/agent-pr" in plain or helper in plain:
            if not CALL.fullmatch(command):
                refuse(f"agent-pr is called alone, in one form: {helper} (or ~/.local/bin/agent-pr) push <owner/repo> <bundle> | open "
                       f"<owner/repo> <agent/branch> <pr file>, the files under /tmp/claude-{uid}/agent-pr/ written plainly: no variable, "
                       "glob or chaining")


try:
    check(json.load(sys.stdin))
except Exception:  # what it cannot read or check is refused: exit 1 would let the call through
    refuse("a call it cannot read")
sys.exit(0)
