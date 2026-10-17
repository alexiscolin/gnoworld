"""guard.py: Claude Code's PreToolUse hook on Bash, WebFetch, Edit and Write (.claude/settings.json).

- git: no hook skipped (--no-verify, `commit -n`, a hooksPath override), and no forced push
  (--force*, -f, a `+` refspec, --mirror);
- gno only through gnomcp (.claude/rules/gno.md): no gnokey, no fetched realm page or RPC node,
  and no .gno file written, by any tool, before the session called a gnomcp tool. Raw RPC from
  Bash is also stopped by the sandbox, whose network list leaves out the chain's nodes.
Each command is split into its simple commands, `sh -c '...'` included, so a path or a wrapper
hides no call, and a word that merely mentions one (grep gnokey) is no call. Exit 2 blocks."""
import json
import os
import re
import shlex
import sys

SHELLS = {"sh", "bash", "zsh", "dash"}
WRITERS = {"cp", "mv", "tee", "install", "rsync", "dd"}
CHAIN_URL = re.compile(r"https?://(rpc[\w.-]*\.gno\.land|([\w-]+\.)*gno\.land/[rp]/)", re.I)


def refuse(why):
    print(f"guard: {why} (CLAUDE.md).", file=sys.stderr)
    sys.exit(2)


def commands(text):
    """The words of each simple command in a shell line, looking inside `sh -c '...'`."""
    for part in re.split(r"&&|\|\||[;|\n]", text):
        try:
            words = shlex.split(part)
        except ValueError:  # an unbalanced quote: judge the raw words
            words = part.split()
        if len(words) >= 3 and os.path.basename(words[0]) in SHELLS and words[1] == "-c":
            yield from commands(words[2])
        elif words:
            yield words


def subcommand(words):
    """git's subcommand, past its global options (`-c key=value` and `-C dir` take an argument)."""
    i = 1
    while i < len(words) and words[i].startswith("-"):
        i += 2 if words[i] in ("-c", "-C") else 1
    return words[i] if i < len(words) else ""


def check_git(words):
    """Refuse a skipped hook or a forced push."""
    if any("core.hooksPath" in w for w in words):
        refuse("core.hooksPath overridden")
    if "--no-verify" in words:
        refuse("--no-verify")
    short = [w for w in words if re.fullmatch(r"-[a-zA-Z]+", w)]
    sub = subcommand(words)
    if sub == "commit" and any("n" in flag for flag in short):
        refuse("git commit -n is --no-verify")
    if sub == "push" and (any("f" in flag for flag in short) or any(w.startswith(("--force", "+")) or w == "--mirror" for w in words[2:])):
        refuse("a forced push rewrites what others have; Alexis forces, if ever")


def writes_gno(words):
    """Whether a command writes a .gno file: by redirection, or with a copying or in-place tool."""
    targets = [words[i + 1] for i, w in enumerate(words[:-1]) if w in (">", ">>")]
    targets += [w.lstrip(">") for w in words if w.startswith(">") and w.lstrip(">")]
    program = os.path.basename(words[0])
    if program in WRITERS or (program in ("sed", "perl") and any(w.startswith("-i") for w in words)):
        targets += words[1:]
    return any(t.endswith(".gno") for t in targets)


def asked_gnomcp(transcript):
    """Whether the session called a gnomcp tool; a mention in text does not count."""

    def called(node):
        if isinstance(node, dict):
            name = str(node.get("name", ""))
            if node.get("type") == "tool_use" and name.startswith(("mcp__gnomcp__", "mcp__plugin_gnomcp")):
                return True
            return any(called(v) for v in node.values())
        return isinstance(node, list) and any(called(v) for v in node)

    try:
        with open(transcript) as f:
            return any(called(json.loads(line)) for line in f if "gnomcp" in line)
    except (OSError, ValueError):
        return False


try:
    event = json.load(sys.stdin)
    tool, given = event["tool_name"], event["tool_input"]
    if not isinstance(given, dict):
        raise TypeError
except (ValueError, KeyError, TypeError):
    refuse("unreadable hook input")

UNREAD = "no .gno before reading the chain: load the gno skill, then gno_packages or gno_read on a realm of the same shape"
if tool in ("Edit", "Write") and str(given.get("file_path", "")).endswith(".gno"):
    if not asked_gnomcp(event.get("transcript_path", "")):
        refuse(UNREAD)
elif tool == "WebFetch" and CHAIN_URL.match(str(given.get("url", ""))):
    refuse("a realm page or an RPC node: read it with gno_render or gno_read")
elif tool == "Bash":
    for words in commands(str(given.get("command", ""))):
        program = os.path.basename(words[0])
        if program == "git":
            check_git(words)
        if program == "gnokey":
            refuse("gnokey: writes and keys go through gnomcp (gno_call, gno_addpkg, sessions)")
        if program in ("curl", "wget") and any(CHAIN_URL.match(w) for w in words):
            refuse("a raw call to the chain: read it with gno_read, gno_render or gno_eval")
        if writes_gno(words) and not asked_gnomcp(event.get("transcript_path", "")):
            refuse(UNREAD)
