"""repo_files.py: what the harness's Python scripts share, so each is written once."""
import contextlib
import os
import shutil
import re
import subprocess
import tempfile


def git(*args):
    """git's output, failing loudly. Names print as they are: git quotes a path with an accent, "caf\\303\\251/a.ts", by default,
    which names no file (CR5)."""
    return subprocess.run(["git", "-c", "core.quotePath=false", *args], capture_output=True, text=True, check=True).stdout


HUNK = re.compile(r"^@@ -\S+ \+(\d+)(?:,(\d+))? @@")


def changed_lines(*args, removals=False):
    """{path: the lines of its new side that changed}, from `git diff -U0 <args>` (its commits, options and pathspecs). A hunk of
    count 0 only removes: it touches no line, or with `removals` the two beside it, a deleted file then kept by its old name.
    A file's names are read between its `diff --git` and its first hunk alone: a line removed that reads `-- x` is no name."""
    changed, old, current, header = {}, None, None, False
    for line in git("diff", "-U0", "--no-color", "--no-ext-diff", "--text", "--no-textconv", *args).splitlines():
        if line.startswith("diff --git "):
            old, current, header = None, None, True
        elif line.startswith("@@"):  # with -U0 a line of a hunk starts with + or -
            header, hunk = False, HUNK.match(line)
            if current and hunk:
                start, count = int(hunk.group(1)), int(hunk.group(2) or 1)
                touched = range(start, start + count) if count else (start, start + 1) if removals else ()
                changed.setdefault(current, set()).update(touched)
        elif header and line.startswith("--- "):
            old = None if line == "--- /dev/null" else line[6:]
        elif header and line.startswith("+++ "):
            current = (old if removals else None) if line == "+++ /dev/null" else line[6:]
    return changed


# /pre-merge's records (review_pass.py), and the files of the review itself, which a record leaves out.
PASSES = "docs/review-passes.txt"
OWN = {"docs/review-log.md", PASSES}


def fingerprint(commit):
    """A commit's tree without the review's own files: committing the record after a /pre-merge pass keeps it valid,
    and any other change voids it."""
    kept = [line for line in git("ls-tree", "-r", commit).splitlines() if line.split("\t", 1)[1] not in OWN]
    return subprocess.run(["git", "hash-object", "--stdin"], input="\n".join(kept), capture_output=True, text=True, check=True).stdout.strip()


def recorded():
    """The fingerprints of the passes file (none when it does not exist). A file that exists and cannot be read, or
    holds a line that is not `<date> <fingerprint> ...`, raises OSError or ValueError: never an answer that judges less."""
    if not os.path.exists(PASSES):
        return set()
    out = set()
    with open(PASSES, encoding="utf-8") as f:  # bytes that are no UTF-8 raise UnicodeDecodeError, a ValueError
        for n, line in enumerate(f, 1):
            if line.strip() and not line.startswith("#"):
                fields = line.split()
                if len(fields) < 2:
                    raise ValueError(f"{PASSES} line {n} is not '<date> <fingerprint> ...'")
                out.add(fields[1])
    return out


def last_reviewed(base):
    """The newest commit of base..HEAD that /pre-merge recorded a pass for, or base when none is in the range or no
    passes file exists (a passes file that cannot be read or parsed raises, see recorded)."""
    reviewed = recorded()
    return next((commit for commit in git("rev-list", f"{base}..HEAD").split() if fingerprint(commit) in reviewed), base)


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
    whose pid is gone is a dead run's. Never a live run's (two merge checks may run at once), nor one no run marked."""
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
        # exactly `tree` there (F1191); two runs at once never share a name either.
        tree = os.path.join(where, "tree-" + os.path.basename(where))
        git("worktree", "add", "-q", "--detach", tree, rev)
        try:
            subprocess.run(["sh", os.path.join(os.path.dirname(os.path.abspath(__file__)), "borrow_node_modules.sh"), tree], check=True)
            yield tree
        finally:
            git("worktree", "remove", "--force", tree)


def repo_paths(root):
    """The paths git would track under root (so .gitignore holds), each as git names it: a link whether it leads anywhere or not, a
    file deleted but still in the index. Every path when root is not in a repository, but what it borrows."""
    try:
        return [root / line for line in git("-C", str(root), "ls-files", "--cached", "--others", "--exclude-standard").splitlines()]
    except (OSError, subprocess.CalledProcessError):
        # Outside a repository (the pre-commit's staged copy holds only tracked files), skip what it borrows.
        return [p for p in root.rglob("*") if "node_modules" not in p.relative_to(root).parts]


def listed(root, suffixes, skip=frozenset()):
    """The files of repo_paths with one of suffixes and no folder of skip on their way; a file deleted but still in the index, or a
    link that leads to no file, is left out."""
    return [p for p in repo_paths(root) if p.suffix in suffixes and p.is_file() and not skip & set(p.relative_to(root).parts)]
