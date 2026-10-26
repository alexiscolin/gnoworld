"""repo_files.py: what the harness's Python scripts share, so each is written once."""
import contextlib
import os
import shutil
import subprocess
import tempfile


def git(*args):
    """git's output, failing loudly."""
    return subprocess.run(["git", *args], capture_output=True, text=True, check=True).stdout


# /pre-merge's records (review_pass.py), and the files of the review itself, which a record leaves out.
PASSES = "docs/review-passes.txt"
OWN = {"docs/review-log.md", PASSES}


def fingerprint(commit):
    """A commit's tree without the review's own files: committing the record after a /pre-merge pass keeps it valid,
    and any other change voids it."""
    kept = [line for line in git("ls-tree", "-r", commit).splitlines() if line.split("\t", 1)[1] not in OWN]
    return subprocess.run(["git", "hash-object", "--stdin"], input="\n".join(kept), capture_output=True, text=True, check=True).stdout.strip()


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
        tree = os.path.join(where, "tree")
        git("worktree", "add", "-q", "--detach", tree, rev)
        try:
            subprocess.run(["sh", os.path.join(os.path.dirname(os.path.abspath(__file__)), "borrow_node_modules.sh"), tree], check=True)
            yield tree
        finally:
            git("worktree", "remove", "--force", tree)


def listed(root, suffixes, skip=frozenset()):
    """The files git would track under root (so .gitignore holds), or every file when root is not
    in a repository; a file deleted but still in the index is left out."""
    try:
        paths = [root / line for line in git("-C", str(root), "ls-files", "--cached", "--others", "--exclude-standard").splitlines()]
    except (OSError, subprocess.CalledProcessError):
        # Outside a repository (the pre-commit's staged copy holds only tracked files), skip what it borrows.
        paths = [p for p in root.rglob("*") if "node_modules" not in p.relative_to(root).parts]
    return [p for p in paths if p.suffix in suffixes and p.is_file() and not skip & set(p.relative_to(root).parts)]
