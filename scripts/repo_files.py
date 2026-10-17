"""repo_files.py: the files the style checks read, so .gitignore is the one list of what to skip."""
import subprocess


def listed(root, suffixes, skip):
    """The files git would track under root, or every file when root is not in a repository."""
    try:
        out = subprocess.run(["git", "-C", str(root), "ls-files", "--cached", "--others", "--exclude-standard"], capture_output=True, text=True, check=True).stdout
        paths = [root / line for line in out.splitlines()]
    except (OSError, subprocess.CalledProcessError):
        paths = [p for p in root.rglob("*") if p.is_file()]
    return [p for p in paths if p.suffix in suffixes and not skip & set(p.relative_to(root).parts)]
