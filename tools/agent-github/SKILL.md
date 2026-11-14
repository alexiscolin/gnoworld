---
name: agent-github
description: Use when work is ready to publish to GitHub - pushing an agent/** branch or opening a pull request with the token this machine holds for a repository on its allow list (the person's own fine-grained token, or the agent account's). Never for main, a force push, a workflow change, or a merge.
---

# Publishing to GitHub

`@HELPER@` runs outside the sandbox with the token installed for the repository named (the person's own by default, an agent
account's where the allow list says so); no session can read either. It pushes one `agent/**` branch, never forced, after
gitleaks has read the pushed commits whole and every name they touch; it opens pull requests; it never merges. A hook takes a
call to it in one form only.

## Push a branch

Write the bundle in the drop folder, `/tmp/claude-<uid>/agent-pr/` (make it if missing):
```sh
git bundle create /tmp/claude-<uid>/agent-pr/agent.bundle agent/<name>
```
then, as a command of its own, every path written out in full (no variable, no glob, nothing chained, no redirect):
```sh
@HELPER@ push <owner>/<repo> /tmp/claude-<uid>/agent-pr/agent.bundle
```
A rewrite of a branch already pushed is refused: push new commits on top.

## Open a pull request

Write a file in the drop folder: the title on its first line, a blank line, the body (in the repository's language for code,
English for gnoworld, with no attribution line). Then:
```sh
@HELPER@ open <owner>/<repo> agent/<name> /tmp/claude-<uid>/agent-pr/pr.md
```

## What it refuses
Any branch but one `agent/**`, a forced push, a tag, a repository not on its allow list, a change to `.github/workflows/` or
`.github/actions/` (what runs on GitHub is a person's to push), a file outside the drop folder or with a second name (a hard
link), a secret gitleaks finds in the commits, their headers, messages or names, the title or the body (an allow comment does
not lift it), a missing or open token, a missing gitleaks. Merging stays with the person or GitHub's rules.
