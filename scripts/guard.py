"""guard.py: Claude Code's PreToolUse hook on Bash, WebFetch, Edit and Write (.claude/settings.json).

- git: no hook skipped (--no-verify or a prefix of it, `commit -n`, a hooksPath override, a
  GIT_CONFIG variable, commit-tree), no forced push; any other push asks Alexis first;
- no recursive delete (rm -r, find -delete or -exec rm) of a path from a variable that may be empty, which
  reaches / or the current folder: only ${name:?}, which stops the shell first;
- gno only through gnomcp (.claude/rules/gno.md): no gnokey, no fetched realm page or RPC node,
  and no .gno file written, by any tool, before the session loaded the gno skill and called a
  gnomcp tool. Raw RPC from Bash is also stopped by the sandbox's network list.
Each command is split into its simple commands, looking inside `sh -c`, `eval`, `$(...)` and
wrappers (env, xargs, timeout...), so none hides a call; a word that only mentions one (grep
gnokey) is no call. A seatbelt, not a wall: exit 2 blocks, and settings.json blocks on a crash."""
import itertools
import json
import os
import re
import shlex
import sys

SHELLS = {"sh", "bash", "zsh", "dash"}
WRAPPERS = {"env", "nohup", "time", "timeout", "nice", "stdbuf", "command", "builtin", "noglob", "exec", "xargs", "sudo", "doas"}
KEYWORDS = {"!", "{", "}", "if", "then", "else", "elif", "do", "while", "until"}  # words that open a command, not name it
SEPARATORS = {";", "&&", "||", "|", "&", "(", ")", ";;", "|&"}
TAKES_ARG = {"-u", "--unset", "-C", "--chdir", "-S", "-s", "-k", "-n", "-I", "-P", "-L", "-d"}  # wrappers' options
INTERPRETERS = {"python", "python3", "node", "perl", "ruby", "deno", "bun"}
WRITERS = {"cp", "mv", "tee", "install", "rsync", "dd"}
CHAIN_URL = re.compile(r"https?://(rpc[\w.-]*\.gno\.land|([\w-]+\.)*gno\.land/[rp]/)", re.I)
ASSIGNMENT = re.compile(r"[A-Za-z_]\w*=.*")
# A variable, a parameter or a command's output that may be empty: any but ${name:?...}.
UNGUARDED = re.compile(r"\$(?:\{(?![A-Za-z_]\w*:\?)|[A-Za-z_\d@*#?$!(-]|$)|`")
# find's options before its paths, BSD's and GNU's: -f names a path, -D takes a word.
FIND_OPTION = re.compile(r"-[HLPEXdsx]+|-[fD]|-O\d*|--")


def refuse(why):
    print(f"guard: {why} (CLAUDE.md).", file=sys.stderr)
    sys.exit(2)


def unwrap(words):
    """The command itself, past leading VAR=value words and wrappers with their options."""
    while words:
        if ASSIGNMENT.fullmatch(words[0]) or words[0] in KEYWORDS:
            words = words[1:]
        elif os.path.basename(words[0]) in WRAPPERS:
            words = words[1:]
            while words and (words[0].startswith("-") or ASSIGNMENT.fullmatch(words[0]) or re.fullmatch(r"[\d.]+[smhd]?", words[0])):
                words = words[2:] if words[0] in TAKES_ARG else words[1:]
        else:
            return words
    return words


def simple_commands(text):
    """Each simple command's words, line by line, split at the shell's separators outside quotes."""
    for line in text.split("\n"):
        lexer = shlex.shlex(line, posix=True, punctuation_chars=True)
        lexer.whitespace_split = True
        try:
            tokens = list(lexer)
        except ValueError:  # an unbalanced quote (a heredoc's body, a message over several lines): judge the raw words
            tokens = re.sub(r"([;|&()])", r" \1 ", line).split()
        words = []
        for token in tokens:
            if token in SEPARATORS:
                yield words
                words = []
            else:
                words.append(token)
        yield words


def commands(text):
    """The words of each simple command in a shell line, looking inside `sh -c`, `eval`, `$(...)` and backticks."""
    text = text.replace("\\\n", "")  # a continued line is one line to the shell
    for inner in re.findall(r"\$\(([^()]*)\)|`([^`]*)`", text):
        yield from commands("".join(inner))
    for raw in simple_commands(text):
        if any(w.upper().startswith("GIT_CONFIG") or "hookspath" in w.lower() for w in raw):
            refuse("git's hooks overridden (core.hooksPath, a GIT_CONFIG variable)")
        words = unwrap(raw)
        if len(words) >= 3 and os.path.basename(words[0]) in SHELLS and re.fullmatch(r"-[a-zA-Z]*c[a-zA-Z]*", words[1]):
            yield from commands(words[2])
        elif words and words[0] == "eval":
            yield from commands(" ".join(words[1:]))
        elif words:
            yield words


def subcommand(words):
    """git's subcommand, past its global options (`-c key=value` and `-C dir` take an argument)."""
    i = 1
    while i < len(words) and words[i].startswith("-"):
        i += 2 if words[i] in ("-c", "-C") else 1
    return words[i] if i < len(words) else ""


def check_git(words):
    """Refuse a skipped hook or a forced push; whether this is a push, which asks first."""
    if any(len(w) >= len("--no-veri") and "--no-verify".startswith(w) for w in words):
        refuse("--no-verify, or a prefix git takes for it")
    short = [w for w in words if re.fullmatch(r"-[a-zA-Z]+", w)]
    sub = subcommand(words)
    if sub == "commit" and any("n" in flag for flag in short):
        refuse("git commit -n is --no-verify")
    if sub in ("commit-tree", "fast-import"):
        refuse(f"git {sub} makes commits no hook sees")
    if sub in ("send-pack", "http-push", "receive-pack"):
        refuse(f"git {sub} pushes with no pre-push hook")
    if any(w.lower().startswith("alias.") or w.lower().startswith("--config-env=alias.") for w in words[1:]):
        refuse("a git alias can carry any flag past these checks: write the command out")
    if sub == "push" and (any("f" in flag for flag in short) or any(w.startswith(("--force", "+")) or w == "--mirror" for w in words[2:])):
        refuse("a forced push rewrites what others have; Alexis forces, if ever")
    return sub == "push"


def writes_gno(words, text):
    """Whether a command writes a .gno file: by redirection, a copying or in-place tool, or an interpreter."""
    targets = [words[i + 1] for i, w in enumerate(words[:-1]) if w in (">", ">>")]
    targets += [w.lstrip(">") for w in words if w.startswith(">") and w.lstrip(">")]
    program = os.path.basename(words[0])
    if program in WRITERS or (program in ("sed", "perl") and any(w.startswith("-i") for w in words)):
        targets += words[1:]
    return any(t.endswith(".gno") for t in targets) or (program in INTERPRETERS and re.search(r"\.gno\b", text) is not None)


def deletes_unguarded(words):
    """Whether rm -r, or find with -delete or -exec rm, takes a path from a variable that may be empty."""
    program = os.path.basename(words[0])
    if program == "find":
        paths = list(itertools.takewhile(lambda w: w not in ("(", "!") and (not w.startswith("-") or FIND_OPTION.fullmatch(w)), words[1:]))
        runs = ("-exec", "-execdir", "-ok", "-okdir")
        deletes = "-delete" in words or any(w in runs and os.path.basename(n) == "rm" for w, n in zip(words, words[1:]))
    elif program == "rm":
        paths = [w for w in words[1:] if not w.startswith("-")]
        flags = itertools.takewhile(lambda w: w != "--", words[1:])
        deletes = any(re.fullmatch(r"-[a-zA-Z]*[rR][a-zA-Z]*", w) or w == "--recursive" for w in flags)
    else:
        return False
    return deletes and any(UNGUARDED.search(p) for p in paths)


def ready_for_gno(transcript):
    """Whether the session loaded the gno skill and called a gnomcp tool; a mention in text counts for neither."""
    found = set()

    def visit(node):
        if isinstance(node, dict):
            name, given = str(node.get("name", "")), node.get("input")
            if node.get("type") == "tool_use" and name.startswith(("mcp__gnomcp__", "mcp__plugin_gnomcp")):
                found.add("gnomcp")
            if node.get("type") == "tool_use" and name == "Skill" and isinstance(given, dict) and str(given.get("skill", "")).startswith("gnomcp:gno"):
                found.add("skill")
            for v in node.values():
                visit(v)
        elif isinstance(node, list):
            for v in node:
                visit(v)

    try:
        with open(transcript) as f:
            for line in f:
                if "gnomcp" in line:
                    visit(json.loads(line))
    except (OSError, ValueError):
        return False
    return found == {"gnomcp", "skill"}


try:
    event = json.load(sys.stdin)
    tool, given = event["tool_name"], event["tool_input"]
    if not isinstance(given, dict):
        raise TypeError
except (ValueError, KeyError, TypeError):
    refuse("unreadable hook input")

UNREAD = "no .gno before the gno skill is loaded and the chain read: the skill, then gno_packages or gno_read on a realm of the same shape"
push = False
if tool in ("Edit", "Write") and str(given.get("file_path", "")).endswith(".gno"):
    if not ready_for_gno(event.get("transcript_path", "")):
        refuse(UNREAD)
elif tool == "WebFetch" and CHAIN_URL.match(str(given.get("url", ""))):
    refuse("a realm page or an RPC node: read it with gno_render or gno_read")
elif tool == "Bash":
    text = str(given.get("command", ""))
    for words in commands(text):
        program = os.path.basename(words[0])
        if program == "git":
            push |= check_git(words)
        if program == "gnokey":
            refuse("gnokey: writes and keys go through gnomcp (gno_call, gno_addpkg, sessions)")
        if deletes_unguarded(words):
            refuse("a recursive delete of a path a variable may leave empty, reaching / or this folder: write ${name:?}")
        if program in ("curl", "wget") and any(CHAIN_URL.match(w) for w in words):
            refuse("a raw call to the chain: read it with gno_read, gno_render or gno_eval")
        if writes_gno(words, text) and not ready_for_gno(event.get("transcript_path", "")):
            refuse(UNREAD)
if push:
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "ask",
                                             "permissionDecisionReason": "a push leaves this machine: Alexis decides"}}))
