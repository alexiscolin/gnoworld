# guard_git.py: Claude Code's PreToolUse hook on git commands (.claude/settings.json).
# A git hook is never skipped (CLAUDE.md): it refuses --no-verify, `git commit -n` and a
# hooksPath override, and lets everything else through. Exit 2 blocks the call.
import json
import re
import shlex
import sys


def refuse(why):
    print(f"guard_git: {why}. Git hooks are never skipped (CLAUDE.md).", file=sys.stderr)
    sys.exit(2)


try:
    command = json.load(sys.stdin)["tool_input"]["command"]
except (ValueError, KeyError, TypeError):
    refuse("unreadable hook input")

if "core.hooksPath" in command:
    refuse("core.hooksPath overridden")
for part in re.split(r"&&|\|\||[;|\n]", command):
    try:
        words = shlex.split(part)
    except ValueError:  # an unbalanced quote: judge the raw words
        words = part.split()
    if "--no-verify" in words:
        refuse("--no-verify")
    if "git" in words and "commit" in words and any(re.fullmatch(r"-[a-zA-Z]*n[a-zA-Z]*", w) for w in words):
        refuse("git commit -n is --no-verify")
