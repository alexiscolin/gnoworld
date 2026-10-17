"""repo_files.py: what the harness's Python scripts share, so each is written once."""
import subprocess


def git(*args):
    """git's output, failing loudly."""
    return subprocess.run(["git", *args], capture_output=True, text=True, check=True).stdout


def listed(root, suffixes, skip=frozenset()):
    """The files git would track under root (so .gitignore holds), or every file when root is not
    in a repository; a file deleted but still in the index is left out."""
    try:
        paths = [root / line for line in git("-C", str(root), "ls-files", "--cached", "--others", "--exclude-standard").splitlines()]
    except (OSError, subprocess.CalledProcessError):
        # Outside a repository (the pre-commit's staged copy holds only tracked files), skip what it borrows.
        paths = [p for p in root.rglob("*") if "node_modules" not in p.relative_to(root).parts]
    return [p for p in paths if p.suffix in suffixes and p.is_file() and not skip & set(p.relative_to(root).parts)]
