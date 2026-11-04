"""guard.py: Claude Code's PreToolUse hook on Bash, WebFetch, Edit and Write (.claude/settings.json).

- git: no hook skipped (--no-verify or a prefix of it, `commit -n`, a hooksPath override, a
  GIT_CONFIG variable, commit-tree), no forced push; any other push asks Alexis first; git's own
  folders, never a command's (GIT_DIR, GIT_COMMON_DIR, GIT_WORK_TREE, --git-dir, --work-tree,
  core.worktree): a commit pointed at another one runs that folder's hooks, or none;
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
# A function's body is commands too: `(` opens one form, and `{` the other where it opens a command, after `f()` or `function f`
# (F4922: a call inside one passed unread); elsewhere `{` is a word (`-m {`: lot 2's S2-1). `<(` and `>(` open a process's.
SEPARATORS = {";", "&&", "||", "|", "&", "(", ")", ";;", "|&", "<(", ">("}
# shlex keeps a run of these marks as one token (`;(`, `&&(`, `f()(`): each separator in it, and each redirection, is a token of its own.
MARKS = re.compile(r"&>>?|[<>]&|>\||>>|&&|\|\||;;|\|&|[<>]\(|[;&|()<>]")
TAKES_ARG = {"-u", "--unset", "-C", "--chdir", "-S", "-s", "-k", "-n", "-I", "-P", "-L", "-d"}  # wrappers' options
INTERPRETERS = {"python", "python3", "node", "perl", "ruby", "deno", "bun"}
WRITERS = {"cp", "mv", "tee", "install", "rsync", "dd"}
GIT_PLACES = {"GIT_DIR", "GIT_COMMON_DIR", "GIT_WORK_TREE"}  # where git reads its hooks, config and work tree
SETTERS = {"export", "declare", "typeset", "readonly", "local"}  # builtins that give a variable a value or export it
# git's global options whose argument may come as the next word (git 2.53), beside -c and -C; --git-dir and --work-tree are refused.
GIT_TAKES_ARG = {"-c", "-C", "--namespace", "--config-env", "--attr-source", "--shallow-file"}
CHAIN_URL = re.compile(r"https?://(rpc[\w.-]*\.gno\.land|([\w-]+\.)*gno\.land/[rp]/)", re.I)
ASSIGNMENT = re.compile(r"[A-Za-z_]\w*\+?=.*")  # `+=` appends, and gives a value as `=` does
# A variable, a parameter or a command's output that may be empty: any but ${name:?...}.
UNGUARDED = re.compile(r"\$(?:\{(?![A-Za-z_]\w*:\?)|[A-Za-z_\d@*#?$!(-]|$)|`")
# find's options before its paths, BSD's and GNU's: -f names a path, -D takes a word.
FIND_OPTION = re.compile(r"-[HLPEXdsx]+|-[fD]|-O\d*|--")


def refuse(why):
    print(f"guard: {why} (CLAUDE.md).", file=sys.stderr)
    sys.exit(2)


def git_place(word):
    """Whether a word gives one of git's folders a value (NAME=value, NAME+=value) or names it (export NAME)."""
    return word.split("=", 1)[0].rstrip("+") in GIT_PLACES


def split_line(words):
    """env's -S, alone or after its options that take no argument (-iS, -0vS), or --split-string: the words of the line it splits,
    then the words after it; None for any other option (-uSHELL is -u SHELL: lot 2's S2-2). env runs that line: a command, not one of
    env's words. A line holding an escape or a variable is refused, which env expands as no shell does (BSD's \\_ is a space: S2-8)."""
    joined = re.fullmatch(r"--split-string=(.*)|-[0iv]*S(.+)", words[0])
    if words[0] == "--split-string" or re.fullmatch(r"-[0iv]*S", words[0]):
        line, rest = (words[1] if len(words) > 1 else ""), words[2:]
    elif joined:
        line, rest = joined.group(1) if joined.group(1) is not None else joined.group(2), words[1:]
    else:
        return None
    if "\\" in line or "$" in line:
        refuse("env -S with an escape or a variable, which env expands as no shell does: write the command out")
    try:
        return shlex.split(line) + rest
    except ValueError:
        return line.split() + rest


def unwrap(words):
    """The command itself, past leading VAR=value words and wrappers with their options; and the VAR=value words it was given there,
    env's and those of env -S's line included."""
    given = []
    while words:
        if ASSIGNMENT.fullmatch(words[0]):
            given.append(words[0])
            words = words[1:]
        elif words[0] in KEYWORDS:
            words = words[1:]
        elif os.path.basename(words[0]) in WRAPPERS:
            env = os.path.basename(words[0]) == "env"
            words = words[1:]
            while words and (words[0].startswith("-") or ASSIGNMENT.fullmatch(words[0]) or re.fullmatch(r"[\d.]+[smhd]?", words[0])):
                line = split_line(words) if env else None
                if line is not None:
                    words = line
                    continue
                if ASSIGNMENT.fullmatch(words[0]):
                    given.append(words[0])
                words = words[2:] if words[0] in TAKES_ARG else words[1:]
        else:
            return words, given
    return words, given


# Each character a quote or a substitution holds that the split must not see, swapped for one of its own; unshield gives them back.
QUOTED = ";&|()<>{}\n"  # in quotes: the marks and a newline
SHIELDED = {c: chr(0xE000 + ord(c)) for c in QUOTED + " \t'\"\\"}  # in a $(...), <(...) or >(...): its spaces and quotes too
unshield = lambda word: word.translate({ord(v): k for k, v in SHIELDED.items()})


def closing(text, at):
    """Where the `)` is that closes the `(` at `at`, past nested ones, quotes and escapes; None when the text holds none."""
    depth, quote, k = 0, "", at
    while k < len(text):
        c = text[k]
        if c == "\\" and quote != "'":
            k += 2
            continue
        if quote:
            quote = "" if c == quote else quote
        elif c in "'\"":
            quote = c
        elif c in "()":
            depth += 1 if c == "(" else -1
            if depth == 0:
                return k
        k += 1
    return None


def scan(text):
    """The text with every quoted or escaped mark and newline, and the whole of each $(...), <(...) and >(...), swapped for characters
    of their own, so that only the shell's own separators split it (lot 1's R1: a quoted '{' split `git commit -m '{' -n`; lot 2's
    S2-6: `-F <(echo x) -n` split it too); and the commands of those substitutions, each to be read in its turn. $'...' is a quote
    whose backslash escapes (S2-11)."""
    out, spans, quote, i = [], [], "", 0
    while i < len(text):
        c, after = text[i], text[i + 1:i + 2]
        end = closing(text, i + 1) if after == "(" and quote != "'" and quote != "$'" and (c == "$" or (c in "<>" and not quote)) else None
        if end is not None:
            spans.append(text[i + 2:end])
            out.append(c + "".join(SHIELDED.get(x, x) for x in text[i + 1:end + 1]))
            i = end + 1
        elif c == "\\" and quote != "'" and after:
            out += [c, SHIELDED.get(after, after)]
            i += 2
        elif c == "$" and after == "'" and not quote:
            out += ["$", "'"]
            quote, i = "$'", i + 2
        else:
            if c == "'" and quote in ("", "'", "$'") or c == '"' and quote in ("", '"'):
                quote = "" if quote else c
            elif quote and c in QUOTED:
                c = SHIELDED[c]
            out.append(c)
            i += 1
    return "".join(out), spans


HEREDOC = re.compile(r"<<-?\s*(['\"]?)([A-Za-z_][\w.-]*)\1")


def without_bodies(text):
    """The text without its heredocs' bodies, whose lines are read one by one, never as quotes held open over the next lines."""
    out, end = [], None
    for line in text.split("\n"):
        if end is not None:
            end = None if line.strip() == end else end
            continue
        out.append(line)
        found = HEREDOC.search(line)
        end = found.group(2) if found else None
    return "\n".join(out)


def simple_commands(text):
    """Each simple command's words, split at the shell's separators outside quotes and substitutions: line by line (a heredoc's body
    too, which may be fed to a shell), and each command whose quotes hold a newline once more, whole (lot 2's S2-7:
    `git commit -m "a⏎b" --no-verify` was two lines, its flag unread)."""
    lines = [scan(line)[0] for line in text.split("\n")]
    lines += [line for line in scan(without_bodies(text))[0].split("\n") if SHIELDED["\n"] in line]
    for line in lines:
        lexer = shlex.shlex(line, posix=True, punctuation_chars=True)
        lexer.whitespace_split = True
        lexer.commenters = ""  # a `#` inside a word is the word's (lot 2's S2-5); a comment read as words fails closed
        try:
            tokens = list(lexer)
        except ValueError:  # an unbalanced quote (a heredoc's body, a message over several lines): judge the raw words
            tokens = re.sub(r"([;|&()])", r" \1 ", unshield(line)).split()
        words = []
        for token in tokens:
            for part in MARKS.findall(token) if set(token) <= set(";&|()<>") else [token]:
                if part in SEPARATORS or part == "{" and (not words or words[0] == "function"):
                    yield words
                    words = []
                else:
                    words.append(unshield(part))
        yield words


def commands(text):
    """The words of each simple command in a shell line, looking inside `sh -c`, `eval`, env -S, `$(...)`, `<(...)`, `>(...)` and
    backticks."""
    text = text.replace("\\\n", "")  # a continued line is one line to the shell
    for inner in re.findall(r"`([^`]*)`", text) + scan(text)[1] + [s for line in text.split("\n") for s in scan(line)[1]]:
        yield from commands(inner)
    for raw in simple_commands(text):
        # A config file included (include.path, includeIf) sets what it likes, hooksPath and core.worktree too (7w2's review, S10).
        if any(w.upper().startswith("GIT_CONFIG") or any(k in w.lower() for k in ("hookspath", "include.path", "includeif.")) for w in raw):
            refuse("git's hooks overridden (core.hooksPath, a config file included, a GIT_CONFIG variable)")
        words, given = unwrap(raw)
        if any(w.upper().startswith("GIT_CONFIG") for w in given):  # one given inside env -S's line
            refuse("git's hooks overridden (core.hooksPath, a config file included, a GIT_CONFIG variable)")
        # git's folders given a value before the program, through env, or by export and its kin; unset and env -u remove them.
        if any(git_place(w) for w in given) or (words and words[0] in SETTERS and any(git_place(w) for w in words[1:])):
            refuse("git pointed at folders of the command's own (GIT_DIR, GIT_COMMON_DIR, GIT_WORK_TREE): their hooks run, or none")
        if len(words) >= 3 and os.path.basename(words[0]) in SHELLS and re.fullmatch(r"-[a-zA-Z]*c[a-zA-Z]*", words[1]):
            yield from commands(words[2])
        elif words and words[0] == "eval":
            yield from commands(" ".join(words[1:]))
        elif words:
            yield words


def subcommand(words):
    """Where git's subcommand is, past its global options (GIT_TAKES_ARG's take the next word)."""
    i = 1
    while i < len(words) and words[i].startswith("-"):
        i += 2 if words[i] in GIT_TAKES_ARG else 1
    return i


def check_git(words):
    """Refuse a skipped hook, a forced push or git's folders given; whether this is a push, which asks first."""
    if any(len(w) >= len("--no-veri") and "--no-verify".startswith(w) for w in words):
        refuse("--no-verify, or a prefix git takes for it")
    short = [w for w in words if re.fullmatch(r"-[a-zA-Z]+", w)]
    at = subcommand(words)
    sub = words[at] if at < len(words) else ""
    if any(w.startswith(("--git-dir", "--work-tree")) or "core.worktree" in w.lower() for w in words[1:at]):
        refuse("git pointed at folders of the command's own (--git-dir, --work-tree, core.worktree): their hooks run, or none")
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
