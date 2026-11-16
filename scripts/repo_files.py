"""repo_files.py: what the harness's Python scripts share, so each is written once."""
import sys
import contextlib
import os
import shutil
import re
import subprocess
import tempfile


def git(*args):
    """git's output, failing loudly. Names print as they are: git quotes a path with an accent, "caf\\303\\251/a.ts", by default,
    which names no file."""
    return subprocess.run(["git", "-c", "core.quotePath=false", *args], capture_output=True, text=True, check=True).stdout


HUNK = re.compile(r"^@@ -\S+ \+(\d+)(?:,(\d+))? @@")


def changed_lines(*args):
    """{path: the lines of its new side that changed}, from `git diff -U0 <args>` (its commits, options and pathspecs). A hunk of
    count 0 only removes: it touches no line. A file's name is read between its `diff --git` and its first hunk alone: a line
    removed that reads `++ x` is no name."""
    changed, current, header = {}, None, False
    for line in git("diff", "-U0", "--no-color", "--no-ext-diff", "--text", "--no-textconv", *args).splitlines():
        if line.startswith("diff --git "):
            current, header = None, True
        elif line.startswith("@@"):  # with -U0 a line of a hunk starts with + or -
            header, hunk = False, HUNK.match(line)
            if current and hunk:
                start, count = int(hunk.group(1)), int(hunk.group(2) or 1)
                changed.setdefault(current, set()).update(range(start, start + count))
        elif header and line.startswith("+++ "):
            current = None if line == "+++ /dev/null" else line[6:]
    return changed


# A bench names its budget at the end of its name, `bench("<name> [<n> ms]"`: bench.py holds the mean to it, and
# check_regressions.py holds the bench and its budget in place.
BENCH_FILE = re.compile(r"\.bench\.tsx?$")
BENCH = re.compile(r"""\bbench\(\s*(["'`])(.*?)\1""", re.S)
BUDGET = re.compile(r"\s*\[(\d+(?:\.\d+)?) ms\]$")


def benches(files):
    """Each bench's budget in ms by its name without the budget, from `bench("<name> [<n> ms]"` in {path: text}."""
    out = {}
    for text in files.values():
        for found in BENCH.finditer(text):
            budget = BUDGET.search(found.group(2))
            if budget:
                out[found.group(2)[: budget.start()]] = float(budget.group(1))
    return out


def alive(pid):
    """Whether the process pid runs; one this user may not signal counts as alive, never removed."""
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    except OSError:
        return True
    return True


def clear_dead():
    """Removes the copies a killed run left in $TMPDIR: each run's folder holds its pid in `owner`, and a folder
    whose pid is gone is a dead run's. Never a live run's (two runs may overlap), nor one no run marked."""
    root = os.path.realpath(tempfile.gettempdir())
    for line in git("worktree", "list", "--porcelain").splitlines():
        tree = os.path.realpath(line.removeprefix("worktree ")) if line.startswith("worktree ") else ""
        owner = os.path.join(os.path.dirname(tree), "owner")
        if not tree or os.path.dirname(os.path.dirname(tree)) != root or not os.path.isfile(owner):
            continue
        with open(owner) as f:
            pid = f.read().strip()
        if pid.isdigit() and not alive(int(pid)):
            git("worktree", "remove", "--force", tree)
            shutil.rmtree(os.path.dirname(tree), ignore_errors=True)


def report(tool, header, items, most=20):
    """A refusal of several lines: printed as it was, the header then each item, and on GitHub (GITHUB_ACTIONS) also one error
    annotation of the header and the first `most` items, then how many more, escaped as GitHub's toolkit escapes a message: a
    problem matcher keeps one line, the header alone (F13435)."""
    # No item starts a command line, where the runner reads them (stderr included): its newlines written as \n, a leading :: behind
    # a backslash.
    items = [str(i).replace("\r", "\\r").replace("\n", "\\n") for i in items]
    items = ["\\" + i if i.lstrip().startswith("::") else i for i in items]
    print(header, *items, sep="\n  ", file=sys.stderr)
    if os.environ.get("GITHUB_ACTIONS") == "true":
        lines = [header] + [f"  {i}" for i in items[:most]] + ([f"  +{len(items) - most} more"] if len(items) > most else [])
        message = "\n".join(lines).replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
        print(f"::error title={tool}::{message}", flush=True)


@contextlib.contextmanager
def worktree(rev):
    """A throwaway worktree of rev in $TMPDIR, borrowing the working tree's node_modules at the
    same paths (borrow_node_modules.sh), removed when done. Not inside the repo: the sandbox
    refuses to write a `.claude/commands` there, even in a copy. Its folder names this run's pid,
    so the next run clears it if this one is killed first."""
    clear_dead()
    git("worktree", "prune")  # a run killed before its cleanup leaves a stale entry
    with tempfile.TemporaryDirectory() as where:
        with open(os.path.join(where, "owner"), "w") as f:
            f.write(str(os.getpid()))
        # A name of its own: git registers the copy as .git/worktrees/<basename>, and the sandbox refuses to create
        # exactly `tree` there; two runs at once never share a name either.
        tree = os.path.join(where, "tree-" + os.path.basename(where))
        git("worktree", "add", "-q", "--detach", tree, rev)
        try:
            subprocess.run(["sh", os.path.join(os.path.dirname(os.path.abspath(__file__)), "borrow_node_modules.sh"), tree], check=True)
            yield tree
        finally:
            git("worktree", "remove", "--force", tree)


def listing(root):
    """The paths git would track under root (so .gitignore holds), one deleted but still in the index included, or every
    path but git's own and the installed packages' when root is not in a repository or git cannot list it. Names come
    NUL-ended (-z), so git quotes none, whatever its characters (a quoted name is no file)."""
    try:
        return [root / name for name in git("-C", str(root), "ls-files", "-z", "--cached", "--others", "--exclude-standard").split("\0") if name]
    except (OSError, subprocess.CalledProcessError):
        # Outside a repository (the pre-commit's staged copy holds only tracked files), skip what it borrows.
        return [p for p in root.rglob("*") if not {"node_modules", ".git"} & set(p.relative_to(root).parts)]


def tracked(root):
    """listing()'s files: a file deleted but still in the index is left out, and a link stands for what it points to."""
    return [p for p in listing(root) if p.is_file()]


def listed(root, suffixes, skip=frozenset()):
    """tracked()'s files ending in one of suffixes, outside the folders skip names."""
    return [p for p in tracked(root) if p.suffix in suffixes and not skip & set(p.relative_to(root).parts)]
