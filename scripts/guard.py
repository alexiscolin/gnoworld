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
gnokey) is no call. What it cannot read it refuses (7w4): a program, git's subcommand or a commit's
flags from a variable or a substitution, a list's words given to git, eval or a shell's -c of a
value, xargs feeding git or a shell, an alias, zsh's ways of running a value as code. A seatbelt,
not a wall: exit 2 blocks, and settings.json blocks on a crash."""
import fnmatch
import itertools
import json
import os
import re
import shlex
import sys

SHELLS = {"sh", "bash", "zsh", "dash", "ksh", "csh", "tcsh", "fish"}
WRAPPERS = {"env", "nohup", "time", "timeout", "nice", "stdbuf", "command", "builtin", "noglob", "exec", "xargs", "sudo", "doas"}
KEYWORDS = {"!", "{", "}", "if", "then", "else", "elif", "do", "while", "until"}  # words that open a command, not name it
# A function's body is commands too: `(` opens one form, and `{` the other where it opens a command, after `f()` or `function f`
# (F4922: a call inside one passed unread); elsewhere `{` is a word (`-m {`: lot 2's S2-1). A process's `<(` and `>(` need none since
# 7w4's R1: closed, scan() keeps it one word and reads its commands; left open, its `(` is refused as a glob qualifier.
SEPARATORS = {";", "&&", "||", "|", "&", "(", ")", ";;", "|&"}
# shlex keeps a run of these marks as one token (`;(`, `&&(`, `f()(`): each separator in it, and each redirection, is a token of its own.
MARKS = re.compile(r"&>>?|[<>]&|>\||>>|&&|\|\||;;|\|&|[<>]\(|[;&|()<>]")
TAKES_ARG = {"-u", "--unset", "-C", "--chdir", "-S", "-s", "-k", "-n", "-I", "-P", "-L", "-d", "-a"}  # wrappers' options (exec -a: S7-1)
INTERPRETERS = {"python", "python3", "node", "perl", "ruby", "deno", "bun"}
WRITERS = {"cp", "mv", "tee", "install", "rsync", "dd"}
GIT_PLACES = {"GIT_DIR", "GIT_COMMON_DIR", "GIT_WORK_TREE"}  # where git reads its hooks, config and work tree
SETTERS = {"export", "declare", "typeset", "readonly", "local"}  # builtins that give a variable a value or export it
# git's global options whose argument may come as the next word (git 2.53), beside -c and -C; --git-dir and --work-tree are refused.
GIT_TAKES_ARG = {"-c", "-C", "--namespace", "--config-env", "--attr-source", "--shallow-file"}
CHAIN_URL = re.compile(r"https?://(rpc[\w.-]*\.gno\.land|([\w-]+\.)*gno\.land/[rp]/)", re.I)
ASSIGNMENT = re.compile(r"[A-Za-z_]\w*\+?=.*", re.S)  # `+=` appends, and gives a value as `=` does; a value may hold a newline
# A variable, a parameter or a command's output that may be empty: any but ${name:?...}.
UNGUARDED = re.compile(r"\$(?:\{(?![A-Za-z_]\w*:\?)|[A-Za-z_\d@*#?$!(-]|$)|`")
# find's options before its paths, BSD's and GNU's: -f names a path, -D takes a word.
FIND_OPTION = re.compile(r"-[HLPEXdsx]+|-[fD]|-O\d*|--")
EXPANDS = re.compile(r"[$`]")  # a variable, a substitution or a backtick: a value the guard does not see
GLOB, BRACE = r"[*?]|\[[^]]*\]", r"\{[^{}]*(,|\.\.)"  # what zsh turns into file names, and into several words
# "$@", $*, ${a[@]} and zsh's $argv give a list's words, any flag among them (7w4's S4-4).
LISTS = re.compile(r"\$\{?[@*]|\[[@*]\]|\$\{?argv\b")
# zsh's flags that run a value as code (S4-2): ~ globs it, qualifiers included; in (...), e substitutes, % expands prompt escapes,
# which substitute under promptsubst, and P names a parameter whose subscript substitutes.
RUNS_VALUE = re.compile(r"[\^=#+]*(~|\([^)]*[e%P#])")  # and (#), a character by its code: a `$` the reading never sees (S6-5)
FEEDERS = {"xargs", "gxargs", "parallel"}  # programs that build a command line from their stdin
FEEDER_ARGS = {"-E", "-I", "-J", "-L", "-n", "-P", "-R", "-S", "-s", "-a", "-d"}  # their options that take the next word
# Builtins that run their words as code, now or later (the chief's addition to 7w4): eval; trap, at a signal or the shell's exit;
# zsh's sched, before a prompt, and zpty, under a terminal; let, whose subscripts substitute; bash's bind -x, complete -C and
# compgen -C, at a key or a completion; GNU parallel, through a shell (R3); zstyle -e, at a lookup (S5-6). Their words are read as
# one command line, as eval's.
EVALS = {"eval", "trap", "sched", "zpty", "let", "bind", "complete", "compgen", "parallel", "zstyle"}
# What xargs or parallel may run with words from their stdin (S5-8: `xargs env` ran a program stdin named): no wrapper, no shell.
FED = {"grep", "rg", "rm", "wc", "cat", "sed", "ls", "echo", "printf", "basename", "dirname", "head", "tail", "touch", "mkdir",
       "chmod", "cp", "mv", "file", "stat", "du", "sort", "shasum", "realpath", "readlink", "test", "kill"}
NAMERS = {"grep", "rg", "echo", "printf", "man", "which", "type"}  # programs that only read their words: a feeder among them is text
# zsh's tables that name an alias, a command's path or a function's code (zsh/parameter): `aliases[g]=git` then `g push` runs git;
# histchars and its older name, whose third character starts a comment (7w4's S5-2, S6-3); options, globsubst's and the rest (S6-2).
TABLE = r"((dis_)?([gs]?aliases|functions)|commands|histchars|HISTCHARS|options)"
TABLES = re.compile(TABLE + r"(\[.*\])?\+?=", re.S)
# Builtins that give a parameter named among their words a value (S5-4: `set -A aliases g git`, `read -A`, `printf -v`).
ASSIGNERS = {"set", "read", "print", "printf", "zparseopts"} | SETTERS
TABLE_GIVEN = ("zsh's aliases, commands or functions table, or histchars, given a value: a name the guard does not read runs a "
               "program, or a comment hides one; write it out, and to search for the word, use the Grep tool")
bare = lambda word: re.sub(r"[\\'\"]", "", word)  # a raw word as the shell gives it, its quotes and escapes removed


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


def closing(text, at, ends="()"):
    """Where the mark is that closes the one at `at` (a `(` by default, or ends[0]), past nested ones, quotes, escapes and comments;
    None when the text holds none. A comment's apostrophe opens no quote (7w4, after round 3: `"$(print -l *(e:…:) # it's⏎)"` hid
    the substitution's code)."""
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
        elif c == "#" and ends == "()" and k > at and text[k - 1] in " \t\n;&|()":  # a command's comment, to its line's end
            k = text.find("\n", k) % (len(text) + 1)
            continue
        elif c in ends:
            depth += 1 if c == ends[0] else -1
            if depth == 0:
                return k
        k += 1
    return None


def scan(text):
    """The text with every quoted or escaped mark and newline, and the whole of each $(...), <(...), >(...), `...` and ${...}, swapped for
    characters of their own, so that only the shell's own separators split it (lot 1's R1: a quoted '{' split `git commit -m '{' -n`;
    lot 2's S2-6 and lot 3's S3-4: a substitution's or an expansion's separators split it too); the commands those substitutions and
    expansions hold, each to be read in its turn; and whether a quote is still open at the end. $'...' is a quote whose backslash
    escapes (S2-11). One character for one, so an offset in the text is the same in what it gives; and where each span starts. zsh's
    flags that run an expansion's value as code are refused (7w4's S4-2: `${(e)x}`, `${~x}`)."""
    out, spans, starts, quote, i = [], [], [], "", 0
    while i < len(text):
        c, after = text[i], text[i + 1:i + 2]
        end = None
        if quote not in ("'", "$'"):
            # A process's <(, >( or zsh's =( at a word's start alone (S5-10: `zsh =(echo …)` read its file): inside one,
            # `<->(e:cmd:)` is a numeric glob with a qualifier (7w4's R1), and `a=(…)` an array.
            if after == "(" and (c == "$" or (c in "<>=" and not quote and (i == 0 or text[i - 1] in " \t\n;&|("))):
                end = closing(text, i + 1)
            elif c == "$" and after == "{":
                end = closing(text, i + 1, "{}")
                if RUNS_VALUE.match(text[i + 2:end]):
                    refuse("zsh's ~, (e), (%) or (P) on an expansion, which runs its value as code: write the command out")
                if re.match(r"[\^=#+~]*(\([^)]*\))?[\^=#+~]*" + TABLE + r"(\[[^]]*\])?:{0,2}=", text[i + 2:end]):  # S5-4, S6-4
                    refuse(TABLE_GIVEN)
            elif c == "`":
                end = next((k for k in range(i + 1, len(text)) if text[k] == "`" and text[k - 1] != "\\"), None)
        if end is not None:  # the whole span one word, its opening and closing marks swapped too but a backtick's
            # A ${...}'s `name:-word` is no command: read after `:`, as a value's words, its substitutions in their turn.
            spans.append(text[i + 1:end] if c == "`" else ": " + text[i + 2:end] if after == "{" else text[i + 2:end])
            starts.append(i + 1 if c == "`" else i + 2)
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
    return "".join(out), spans, bool(quote), starts


# A ( set against any word before it opens zsh's glob qualifiers, which run code (`*(e:cmd:)`, `*(+f)`: lot 3's S3-6; `/(e:cmd:)`:
# 7w4's S4-2; `<->(e:cmd:)`: R1), and bash's extended globs; a function's `f()`, a substitution's `$(` and an array's `=(` are none,
# and a process's `<(`, at a word's start, scan() hides.
GLOB_QUALIFIER = re.compile(r"(?<=[^\s;&|()$=])\((?!\))")
# A heredoc's mark this reader can settle: plain, quoted or escaped characters of a name, up to a blank or a mark.
MARK = re.compile(r"""(?:[\w.+-]|'[\w.+-]*'|"[\w.+-]*"|\\[\w.+-])+(?=[\s;&|()<>]|$)""")


# Programs that take a heredoc's body as text, never as commands: an allowlist, since any program the guard does not know may be a
# shell (7w4's R5: `/bin/s? <<'E'` ran the body).
READS_TEXT = {"cat", "tee", "echo", "printf", "true", ":", "git", "python", "python3", "node", "jq", "grep", "wc", "sort", "head", "tail",
              "diff"}


def reads_text(command):
    """Whether every command on a heredoc's line, from the one it feeds on, is a program of READS_TEXT named as written."""
    for part in re.split(r"[;&|()]+", command):
        words = part.split()
        if words and os.path.basename(words[0]) not in READS_TEXT:
            return False
    return True


def bodies(text):
    """The text of a text that zsh never globs, as (start, end, kind) offsets: a heredoc's body no shell reads ("body", or "quoted"
    when its mark is quoted and its substitutions run nothing either), and a quote's text ("text": its `$(...)` and backticks are
    code, left out). Their lines are no commands, and no glob qualifier runs there (7w4's S4-7: `feat(x)` in a commit message was
    refused; R7: `print(2)` on a quote's second line). Read as the shell reads them: past quotes, comments, arithmetic and ${...},
    inside $(...), backticks and processes; each body after the line that opens it, to its mark. A form this reader cannot settle (a
    continued line, a case's patterns, a mark it cannot read or never finds) ends the reading: what follows stays commands."""
    found, waiting, stack, i = [], [], [["code", None, 0]], 0  # a context: its kind, what closes it, where its command starts
    if "\\\n" in text:  # zsh joins a continued line in an unquoted body, not in a quoted one
        return found
    while i < len(text):
        c, two, (kind, closer, start) = text[i], text[i:i + 2], stack[-1]
        if c == "\\":
            i += 2
        elif kind == '"' and c == '"' or kind == "code" and c == closer:
            if kind == '"':  # the quote's text since it opened, or since its last substitution closed
                found.append((start, i + 1, "text"))
            stack.pop()
            i += 1
            if stack[-1][0] == '"':
                stack[-1][2] = i
        elif text.startswith(("$((", "$[", "${"), i) or kind == "code" and two == "((":  # arithmetic, or an expansion: no heredoc
            end = closing(text, i + (two != "(("), {"[": "[]", "{": "{}"}.get(text[i + 1], "()"))
            if end is None:
                return found
            if kind == '"' and text[i + 1] == "{" and "'" in text[i:end]:
                return found  # inside "...", zsh reads a ${...}'s ' as a character, closing() as a quote (S5-2)
            i = end + 1
        elif two == "$(" or kind == "code" and two in ("<(", ">("):
            if kind == '"':
                found.append((start, i, "text"))
            stack.append(["code", ")", i + 2])
            i += 2
        elif c == "`" or kind == "code" and c == "(":
            if kind == '"':
                found.append((start, i, "text"))
            stack.append(["code", "`" if c == "`" else ")", i + 1])
            i += 1
        elif kind == '"':
            i += 1
        elif c == "'" or two == "$'":  # a quote, text to its end or the text's, a backslash escaping in $'...'
            k = i + 1 + (c == "$")
            while k < len(text) and text[k] != "'":
                k += 2 if c == "$" and text[k] == "\\" else 1
            found.append((i, k + 1, "text"))
            i = k + 1
        elif c == '"':
            stack.append(['"', '"', i])  # a quote's context holds where its text runs from
            i += 1
        elif c == "#" and (i == 0 or text[i - 1] in " \t\n;&|()"):  # a comment, to the line's end
            i = text.find("\n", i) % (len(text) + 1)
        elif text.startswith("case", i) and text[i + 4:i + 5] in (" ", "\t", "\n") and (i == 0 or text[i - 1] in " \t\n;&|()"):
            return found  # its patterns close a ( never opened
        elif two == "<<" and not text.startswith("<<<", i):
            if any(context[1] == "`" for context in stack):
                return found  # zsh ends a backtick at the next one, a body's included (S5-2)
            k = i + 2 + (text[i + 2:i + 3] == "-")
            while text[k:k + 1] in (" ", "\t"):
                k += 1
            mark = MARK.match(text, k)
            if mark is None:
                return found
            waiting.append((bare(mark.group()), text[i + 2] == "-", "quoted" if mark.group() != bare(mark.group()) else "body", start))
            i = mark.end()
        elif text.startswith("<<<", i):
            i += 3
        elif c == "\n" and waiting:  # each waiting body, from the next line to the line that is its mark
            at = i + 1
            for mark, tabs, quoting, begun in waiting:
                first = at
                while True:
                    end = text.find("\n", at) % (len(text) + 1)  # the line's end, or the text's
                    if (text[at:end].lstrip("\t") if tabs else text[at:end]) == mark:
                        break
                    if end == len(text):
                        return found
                    at = end + 1
                if reads_text(text[begun:i]):
                    found.append((first, at, quoting))
                at = end + 1
            waiting, i, stack[-1][2] = [], at, at
        elif c in ";&|\n":
            stack[-1][2] = i + 1
            i += 1
        else:
            i += 1
    return found


def simple_commands(text, kept=()):
    """Each simple command's words, split at the shell's separators outside quotes and substitutions: line by line (a heredoc's body
    too, which may be fed to a shell), and each command whose quotes hold a newline once more, whole (lot 2's S2-7; lot 3's S3-3: no
    heredoc is taken out of that second reading, as a `<<` in quotes misled it, and git is read at any word of either). What `kept`
    holds (bodies()) is text: no glob qualifier is looked for there, and a line it holds gives words after `:`, no command."""
    inside = lambda at: any(a <= at < b for a, b, _ in kept)
    offsets = list(itertools.accumulate([0] + [len(line) + 1 for line in text.split("\n")]))
    lines = [(at, scan(line)[0]) for at, line in zip(offsets, text.split("\n"))]
    whole = scan(text)[0].split("\n")
    lines += [(at, line) for at, line in zip(itertools.accumulate([0] + [len(line) + 1 for line in whole]), whole) if SHIELDED["\n"] in line]
    for at, line in lines:
        if any(not inside(at + m.start()) for m in GLOB_QUALIFIER.finditer(line)):
            refuse("a glob qualifier or an extended glob, which runs code in zsh: write the files out")
        lexer = shlex.shlex(line, posix=True, punctuation_chars=True)
        lexer.whitespace_split = True
        lexer.commenters = ""  # a `#` inside a word is the word's (lot 2's S2-5); a comment read as words fails closed
        try:
            tokens = list(lexer)
        except ValueError:  # an unbalanced quote (a heredoc's body, a message over several lines): judge the raw words, as bare (S4-1)
            tokens = [bare(w) for w in re.sub(r"([;|&()])", r" \1 ", unshield(line)).split()]
        # A line a body holds, or one a quote opened on a line before holds (not one that opens with it), is no command.
        fresh = lambda: [":"] if any(a <= at < b if kind != "text" else a < at < b for a, b, kind in kept) else []
        words, braced = fresh(), []
        for token in tokens + [";"]:
            for part in MARKS.findall(token) if set(token) <= set(";&|()<>") else [token]:
                if part in SEPARATORS or part == "{" and (not words or words[0] == "function"):
                    # A brace no quote holds expands into several words (S6-1: `git commit -m {y,-n}`): refused in a command that
                    # names git, or where a name a variable or a glob gives starts it or stands before git's hooked subcommands
                    # (S7-4: `caffeinate …/g[i]t commit`); a quoted one (`-m "fix {a,b}"`), shielded here, and a text's line are text.
                    if braced and words[:1] != [":"] and any(re.search(r"(^|/)=?git(-[\w-]+)?$", w) or re.search(
                            r"(^|/)[^/]*[$`*?\[][^/]*$", w) and (k == 0 or words[k + 1:k + 2] in (["commit"], ["merge"], ["pull"], ["push"]))
                            for k, w in enumerate(words)):
                        refuse("git given a brace no quote holds, which zsh expands into other words, flags among them: write them out")
                    yield words
                    words, braced = fresh(), []
                else:
                    braced += re.findall(BRACE, part)
                    words.append(unshield(part))


def shell_line(words):
    """The command line a shell is given with -c, among its leading options wherever it stands (`sh -x -c`, `bash -o posix -c`,
    `bash -c --`: lot 3's S3-5); None when it is given none."""
    given, i = False, 1
    while i < len(words):
        w = words[i]
        if w in ("-o", "+o", "-O", "+O", "--rcfile", "--init-file"):
            i += 2
        elif re.fullmatch(r"[-+][a-zA-Z]+", w):
            given |= w.startswith("-") and "c" in w
            i += 1
        elif w.startswith("--"):
            i += 1
        else:
            break
    return ((words[i], words[i + 1:]) if i < len(words) else ("", [])) if given else None  # and $0 and the arguments it is given


def reads_unseen(words):
    """Whether a shell, or source or `.`, runs commands the guard cannot read: from a pipe, a redirected file, a here-string or a
    process (lot 3's S3-5); a heredoc's lines are read, and a script named as a file is the harness's limit."""
    program, args = os.path.basename(words[0]), words[1:]
    # stdin named by any path (S6-8: `/dev/./stdin`; S7-6: `~/../../dev/stdin`), its descriptors (`/dev/fd/0`), a glob or a variable
    # naming the file (`/dev/std?n`, `$f`), or zsh's =(...) process (S5-10).
    named = lambda w: (w.startswith("=(") or os.path.basename(w) == "stdin" or "/fd/" in w
                       or re.search(r"[*?\[$`]", os.path.basename(w)) is not None)
    if program in ("source", "."):  # the split gives `<(...)` as `<` and the process
        return not args or args[0] in ("<", ">") or named(args[0])
    if args[:1] in (["--version"], ["--help"]):  # first, it prints and exits (7w4: `bash --version` was refused); read first alone,
        return False  # as an option's argument is no option: `bash --rcfile --version` reads stdin
    k, heredoc, stdin = 0, False, False
    while k < len(args):  # the split gives `<<` as two `<`, `<<<` as three
        w = args[k]
        if w == "<" and args[k + 1:k + 3] == ["<", "<"]:
            return True  # a here-string
        if w == "<" and args[k + 1:k + 2] == ["<"]:
            heredoc, k = True, k + 3
        elif w == "<" or w.startswith("<(") or named(w):
            return True  # a file redirected in, a process, stdin named
        elif w in (">", ">>", ">|", "&>", "&>>", "<>", ">&", "<&", "-o", "+o", "-O", "+O", "--rcfile", "--init-file"):
            k += 2  # a redirection and its target, an option and its argument
        elif re.fullmatch(r"-[a-zA-Z]*s[a-zA-Z]*", w):
            stdin, k = True, k + 1  # -s: the commands come on stdin, the words after are their arguments
        elif w.startswith(("-", "+")) or re.fullmatch(r"\d+", w):
            k += 1
        elif not stdin:
            return False  # a script named as a file
        else:
            k += 1
    return not heredoc


def commands(text):
    """The words of each simple command in a shell line, looking inside a shell's -c, `eval`, env -S, `$(...)`, `<(...)`, `>(...)`,
    backticks and ${...}; and a value given, as words a command may run. Each word read: a quoted heredoc body's substitutions run
    nothing (7w4's S4-7)."""
    kept = bodies(text)
    text = text.replace("\\\n", "")  # a continued line is one line to the shell
    # The substitutions of the whole text, and of each line, its quotes read as quotes and as characters (7w4's S5-1: an apostrophe
    # in a comment or a body opened a quote in the whole text's reading, hiding every later `$(...)`, and an unquoted body's `it's
    # $(cmd)` runs cmd); a quoted body's run nothing.
    _, spans, _, starts = scan(text)
    found = list(zip(starts, spans))
    for offset, line in zip(itertools.accumulate([0] + [len(line) + 1 for line in text.split("\n")]), text.split("\n")):
        for reading in (line, re.sub("['\"]", " ", line)):
            found += [(offset + at, inner) for inner, at in zip(*scan(reading)[1:4:2])]
    for at, inner in dict.fromkeys(found):
        if not any(a <= at < b for a, b, kind in kept if kind == "quoted"):
            yield from commands(inner)
    for raw in simple_commands(text, kept):
        # A config file included (include.path, includeIf) sets what it likes, hooksPath and core.worktree too (7w2's review, S10).
        if any(w.upper().startswith("GIT_CONFIG") or any(k in w.lower() for k in ("hookspath", "include.path", "includeif.")) for w in raw):
            refuse("git's hooks overridden (core.hooksPath, a config file included, a GIT_CONFIG variable)")
        # zsh's options that change what a line reads (7w4's S4-2, S5-5, S7-4): globsubst globs every value, qualifiers included,
        # and emulate sh or ksh sets it; promptsubst runs a prompt's substitutions, print -P's; braceccl and extendedglob turn `-{n}`
        # and `-n#` into flags, shwordsplit a value into words; `:` runs nothing.
        if raw[:1] != [":"] and any(re.search("globsubst|promptsubst|braceccl|extendedglob|shwordsplit", w.lower().replace("_", ""))
                                    or os.path.basename(w) == "emulate" for w in raw):
            refuse("zsh's globsubst, promptsubst, braceccl, extendedglob or shwordsplit, or emulate, which sets the first: a value's "
                   "globs, a prompt's substitutions or a flag run unseen; write the command out, and to search for the word, use the "
                   "Grep tool")
        # xargs and parallel make a command line of their stdin (7w4's S4-4): what they feed git or a shell is unseen.
        fed = next((k for k, w in enumerate(raw) if os.path.basename(w) in FEEDERS and raw[:1] != [":"]), len(raw))
        if any(os.path.basename(w).lstrip("=$") in SHELLS | {"git"} or os.path.basename(w).startswith("git-") for w in raw[fed + 1:]):
            refuse("xargs or parallel feeding git or a shell the words of its stdin, unseen: write the command out")
        k = fed + 1  # the program it runs, past its options (R3: `xargs "$x" commit` ran git; S5-8: `xargs env` ran one stdin named)
        while k < len(raw) and raw[k].startswith("-"):
            k += 2 if raw[k] in FEEDER_ARGS else 1
        # Unless the command is a program that only reads its words (S6-12: `grep -rn xargs` names one, runs none; S7-1: a wrapper
        # the guard does not know, `caffeinate xargs env`, runs it).
        if k < len(raw) and os.path.basename(raw[k]) not in FED and os.path.basename(raw[0]) not in NAMERS:
            refuse("xargs or parallel running a program none of FED, which stdin's words may turn into any: write the command out")
        words, given = unwrap(raw)
        if any(w.upper().startswith("GIT_CONFIG") for w in given):  # one given inside env -S's line
            refuse("git's hooks overridden (core.hooksPath, a config file included, a GIT_CONFIG variable)")
        # git's folders given a value before the program, through env, or by export and its kin; unset and env -u remove them.
        if any(git_place(w) for w in given) or (words and words[0] in SETTERS and any(git_place(w) for w in words[1:])):
            refuse("git pointed at folders of the command's own (GIT_DIR, GIT_COMMON_DIR, GIT_WORK_TREE): their hooks run, or none")
        # A value may name a program run later, or be run (7w4's S4-3: `k=gnokey; $k list`): its words and its substitutions are read.
        for value in [w.split("=", 1)[1] for w in given + (words[1:] if words and words[0] in SETTERS else []) if ASSIGNMENT.fullmatch(w)]:
            try:
                yield [":"] + shlex.split(value)
            except ValueError:
                yield [":"] + [bare(w) for w in value.split()]
            for inner in scan(value)[1]:
                yield from commands(inner)
            if re.search(r"\[[^]]*\$[^]]*\(", value):  # a subscript evaluated later runs a `$(` its value may assemble (S6-5)
                refuse("a value holding a subscript with a `$` before a `(`, which an arithmetic evaluation runs: write it out")
        if words and words[0] in ("alias", "hash") and any("=" in w or w == "-p" or EXPANDS.search(w) for w in words[1:]):
            refuse("an alias, or a name hashed to a program, runs it under a name the guard does not read: write the program out")
        # A parameter a builtin names after -A, -a, -v or -H, given by a variable, may be a table (S7-2: `t=aliases; set -A $t g git`).
        if words and words[0] in ASSIGNERS and any(re.fullmatch(r"-[a-zA-Z]*[AavH]", w) and EXPANDS.search(after) or re.fullmatch(
                r"-[a-zA-Z]*[AavH].+", w) and EXPANDS.search(w) for w, after in zip(words[1:], words[2:] + [""])):
            refuse(TABLE_GIVEN)
        # A shell's options given by a variable may set globsubst (S7-3: `zsh -o ${o}subst`).
        if words and os.path.basename(words[0]) in SHELLS and any(
                (w.startswith(("-", "+")) or before in ("-o", "+o")) and EXPANDS.search(w) for before, w in zip([""] + words[1:], words[1:])):
            refuse("a shell's option a variable names: write the option out")
        options = list(itertools.takewhile(lambda w: w != "--", words[1:]))
        if words and (words[0] in ("setopt", "unsetopt") and any(re.fullmatch(r"-[a-zA-Z]*m[a-zA-Z]*", w) for w in options)
                      or words[0] == "print" and any(re.fullmatch(r"-[a-zA-Z]*P[a-zA-Z]*", w) for w in options)):
            refuse("setopt -m, which names options by a pattern, or print -P, whose prompt escapes run a substitution under "
                   "promptsubst (S5-5): write the command out")
        if words and words[0] == "zregexparse":
            refuse("zregexparse runs its actions, whose program its own syntax hides (S5-6): write the command out")
        if any(w in ("-exec", "-execdir", "-ok", "-okdir") and "{}" in after for w, after in zip(raw, raw[1:])):
            refuse("find running a file it finds as the program (`-exec {}`, S6-6): name the program")
        if raw[:1] != [":"] and any(TABLES.match(w) for w in raw):  # given a value wherever it stands, an element too
            refuse(TABLE_GIVEN)
        if words and words[0] in ASSIGNERS and any(re.fullmatch(r"(-[a-zA-Z]*)?" + TABLE + r"(\[.*\])?", w) for w in words[1:]):
            refuse(TABLE_GIVEN)  # `set -A aliases …` and `set -Aaliases …` alike (S6-4)
        if words and (words[0] in ("setopt", "unsetopt") or words[0] == "set" and any(w in ("-o", "+o") for w in words[1:])) and any(
                EXPANDS.search(w) for w in words[1:]):
            refuse("an option set by a name a variable builds (`setopt ${o}subst`, S6-2): write the option out")
        # A shell's -c line wherever the shell stands (7w4's R2: `exec -a x zsh -c` and `caffeinate sh -c` ran theirs unread).
        runs = [shell_line(words[k:]) for k, w in enumerate(words) if os.path.basename(w) in SHELLS]
        for line, args in [run for run in runs if run is not None]:
            if EXPANDS.search(line):
                refuse("a shell's -c line holding a variable or a substitution, which may be any code: write the command out")
            yield from commands(line)
            yield [":"] + args  # $0 and the words the line is given, which it may run (7w4's S4-4)
        if words and os.path.basename(words[0]) in SHELLS and runs[0] is not None:
            pass  # the shell's own line, read above
        elif words and words[0] in EVALS:
            if any(EXPANDS.search(w) for w in words[1:]):
                refuse("eval, trap or another builtin that runs code, given a variable or a substitution: write the command out")
            yield from commands(" ".join(words[1:]))
        elif words:
            if (os.path.basename(words[0]) in SHELLS or words[0] in ("source", ".")) and reads_unseen(words):
                refuse("a shell or source reading commands from a pipe, a file, a here-string or a process: write them out, or in a heredoc")
            yield words


def subcommand(words):
    """Where git's subcommand is, past its global options (GIT_TAKES_ARG's take the next word)."""
    i = 1
    while i < len(words) and words[i].startswith("-"):
        i += 2 if words[i] in GIT_TAKES_ARG else 1
    return i


def check_git(words, strict=True):
    """Refuse a skipped hook, a forced push or git's folders given; whether this is a push, which asks first. Strict, for git named or
    a program a variable names (7w4's S4-3, S4-4), what may hide a flag is refused too: a list's words, a subcommand or -c's value
    from an expansion, an expansion in a commit, merge or pull but as -m's or -F's value. A word a variable gives after another
    program's name (`cp "$a" "$b"`) is read for its literal flags alone."""
    if any(len(w) >= len("--no-veri") and "--no-verify".startswith(w) for w in words):
        refuse("--no-verify, or a prefix git takes for it")
    short = [w for w in words if re.fullmatch(r"-[a-zA-Z]+", w)]
    at = subcommand(words)
    sub = words[at] if at < len(words) else ""
    if strict and any(LISTS.search(w) for w in words[1:]):
        refuse("git given a list's words (\"$@\", $*, ${a[@]}, $argv), any flag among them: write them out")
    if strict and EXPANDS.search(sub):
        refuse("git's subcommand from a variable or a substitution: write it out")
    configs = [words[k + 1] for k in range(1, at - 1) if words[k] in ("-c", "--config-env")] + [w for w in words[1:at] if w.startswith("--config-env=")]
    if strict and any(EXPANDS.search(w) for w in configs):
        refuse("git -c given a variable or a substitution, which may set core.hooksPath: write the value out")
    # Every word but -m's and -F's values, which are text.
    valued = {k + 1 for k, w in enumerate(words) if k > at and re.fullmatch(r"-[a-zA-Z]*[mF]|--message|--file", w)}
    free = [w for k, w in enumerate(words) if k not in valued and not re.match(r"-[a-zA-Z]*[mF].|--(message|file)=", w)]
    if strict and any(re.search(GLOB, w) for w in free[1:]) and (sub in ("commit", "merge", "pull", "push") or re.search(GLOB, sub)):
        refuse("git's subcommand, or a commit's, merge's, pull's or push's word, given a glob, which a file named like a flag "
               "turns into one: write the files out")
    if strict and sub in ("commit", "merge", "pull"):  # their hooks are the gate, and a value may be any flag (`o=-n; git commit $o`)
        if any(EXPANDS.search(w) for w in free):
            refuse("git commit, merge or pull given a variable or a substitution but as -m's or -F's value: write it out")
    if any(w.startswith(("--git-dir", "--work-tree")) or "core.worktree" in w.lower() for w in words[1:at]):
        refuse("git pointed at folders of the command's own (--git-dir, --work-tree, core.worktree): their hooks run, or none")
    # -n among short options, -nm"msg" included (7w4: joined to a value it was unseen), up to the first that takes a value.
    if sub == "commit" and any(m and "n" in m.group(1) for m in map(re.compile(r"-([a-zA-Z]*?)(?:[mFcCt]|$)").match, words[at + 1:])):
        refuse("git commit -n is --no-verify")
    if sub in ("commit-tree", "fast-import") or sub == "hash-object" and any("commit" in w for w in words[at + 1:]):
        refuse("git commit-tree, fast-import or hash-object of a commit makes commits no hook sees")
    # They replay or write commits with no pre-commit (the chief's addition to 7w4; filter-branch and replay: S5-11), `--continue`
    # included; pull too, when it rebases, and a config that makes it.
    # A config key that makes a pull rebase (pull.rebase, branch.*.rebase, branch.autosetuprebase), or that a variable builds
    # (S6-10: `pull$d.rebase`), set rather than read.
    keys = [w for w in words[at + 1:] if not w.startswith("-")]
    if sub == "config" and any("rebase" in w.lower() or EXPANDS.search(w) for w in keys) and not any(  # a read flag before the key
            w in ("--get", "--get-all", "--get-regexp", "-l", "--list", "--unset", "--unset-all")  # (S7-10: after it, a value pattern)
            for w in itertools.takewhile(lambda w: w.startswith("-"), words[at + 1:])):
        refuse("git config making a pull rebase, or a key a variable builds: its commits no pre-commit sees; leave it unset")
    if sub in ("am", "cherry-pick", "rebase", "revert", "filter-branch", "replay", "update-ref") or sub == "pull" and any(
            len(w.split("=")[0]) >= len("--reb") and "--rebase".startswith(w.split("=")[0])  # `--reb` is `--rebase` (S6-10)
            or re.fullmatch(r"-[a-zA-Z]*r[a-zA-Z]*", w) for w in words[at + 1:]) or sub == "pull" and any(
            "rebase" in w.lower() for w in words[1:at]):
        refuse("git am, cherry-pick, rebase, revert, filter-branch, replay or update-ref, or pull --rebase, makes or moves commits no "
               "pre-commit saw: git merge the branch, or make the change and commit it")
    # The stash's commits and subtree's no pre-commit saw either (S6-9): their making and their use outside `git stash`.
    if sub == "subtree" and any(w in ("add", "merge", "pull", "split", "--rejoin") for w in words[at + 1:]) or sub == "stash" and any(
            w in ("create", "store") for w in words[at + 1:]) or sub in ("reset", "branch", "checkout", "switch", "merge", "push",
                                                                         "tag", "worktree") and any(  # S7-12: show and diff read
            re.match(r"stash($|[@^~:])", w) or "refs/stash" in w for w in free[1:]):
        refuse("git subtree add, merge, pull or split, git stash create or store, or the stash named outside git stash: their "
               "commits no pre-commit saw; commit the change itself")
    if sub in ("send-pack", "http-push", "receive-pack") or sub.startswith("remote-"):  # a remote helper pushes what its stdin asks
        refuse(f"git {sub} pushes with no pre-push hook")
    if any(w.lower().startswith("alias.") or w.lower().startswith("--config-env=alias.") for w in words[1:]):
        refuse("a git alias can carry any flag past these checks: write the command out")
    pushing = sub == "push" or sub == "subtree" and "push" in words[at + 1:]  # `git subtree push` pushes too (lot 3's S3-2)
    if pushing and (any("f" in flag for flag in short) or any(w.startswith(("--force", "+")) or w == "--mirror" for w in words[2:])):
        refuse("a forced push rewrites what others have; Alexis forces, if ever")
    return pushing


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
    if "\0" in text:  # zsh drops it, and the words it runs are not the ones read here (7w4's S4-5)
        refuse("a NUL byte, which the shell drops: write the command without it")
    if re.search(r"\$[\^=#+]*~", text):  # $~x globs a value, qualifiers included (S4-2)
        refuse("zsh's $~, which runs a value's globs, qualifiers included: write the files out")
    if re.search(r"\$'(?:[^'\\]|\\[^xuUcEe0-7])*\\[xuUcEe0-7]", text):  # `$'\x24(cmd)'` is a `$(` no reading sees (S5-7)
        refuse("a $'...' escape that writes a character by its code, a `$(` the guard cannot see among them: write it out")
    for words in commands(text):
        # Every word may be the program a wrapper runs (7w2's third lot, S3-1, S3-2): each check reads the command from each word on,
        # that word's name as a program's (=git, $'git' and a path give it), git-core's dashed programs as git and their name. So the
        # guard fails closed: `echo git commit -n`, `echo gnokey` and `grep gnokey` are refused, `echo git push` asks.
        for at, word in enumerate(words):
            name = os.path.basename(word).lstrip("=$")
            tail = [name] + words[at + 1:]
            # A name a variable, a substitution or a backtick gives may be git's, or any program's (7w4's S4-3): read as git, as rm
            # and curl where it is the command's program, which is refused when a substitution's output gives it, or nothing follows.
            # A lone $ is a character, and a lone backtick the end of a substitution a line before opened: neither names a program. A
            # glob or a brace names any (R4: `/usr/bin/gi? commit -n`).
            globbed = re.search(GLOB + "|" + BRACE, os.path.basename(word)) is not None
            # find's `{}` is a file it finds, any program (S7-5: `-exec env {} commit -n`).
            unseen = word not in ("$", "`") and ("`" in word or "$(" in word or "$" in os.path.basename(word) or globbed or "{}" in word)
            # A glob alone is no program (a case's `*)`) unless a path's or a shell's name may match it (S5-9: `… | /bin/s?`); one
            # with words is; a variable alone is.
            shell_glob = globbed and ("/" in word or re.search(BRACE, word) is not None  # a brace alone is words (S6-7: `""{zsh,-s}`)
                                      or word != "*" and any(fnmatch.fnmatchcase(n, os.path.basename(word)) for n in SHELLS))
            if unseen and at == 0 and ("`" in word or "$(" in word or (len(words) > 1 or shell_glob if globbed else len(words) == 1)):
                refuse("a program a substitution's output or a glob names, or a variable alone: write the command out")
            if name == "git" or name.startswith("git-") or unseen:
                # Strict but for a variable's word after another program's (`cp "$a" "$b"`), unless git's hooked subcommand
                # follows it, past git's options (S6-11: `caffeinate $g commit $o`; S7-9: `caffeinate $g -C . commit $o`).
                rest = ["git"] + ([name[len("git-"):]] if name.startswith("git-") else []) + words[at + 1:]
                strict = not unseen or at == 0 or rest[subcommand(rest):subcommand(rest) + 1] in (["commit"], ["merge"], ["pull"])
                push |= check_git(rest, strict)
            if name == "gnokey":
                refuse("gnokey: writes and keys go through gnomcp (gno_call, gno_addpkg, sessions); to search for the word, use the Grep tool")
            if deletes_unguarded(tail) or unseen and at == 0 and deletes_unguarded(["rm"] + words[1:]):
                refuse("a recursive delete of a path a variable may leave empty, reaching / or this folder: write ${name:?}")
            if (name in ("curl", "wget") or unseen and at == 0) and any(CHAIN_URL.match(w) for w in tail):
                refuse("a raw call to the chain: read it with gno_read, gno_render or gno_eval")
            if writes_gno(tail, text) and not ready_for_gno(event.get("transcript_path", "")):
                refuse(UNREAD)
if push:
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse", "permissionDecision": "ask",
                                             "permissionDecisionReason": "a push leaves this machine: Alexis decides"}}))
