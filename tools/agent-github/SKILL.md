---
name: agent-github
description: Use when work is ready to publish as the agent - pushing an agent/** branch or opening a pull request on GitHub with the agent account installed on this machine, in a repository its allow list names. Never for main, a force push, a workflow change, or the person's own account.
---

# Publishing as the agent

Each person's agent has a GitHub account of its own (write, never admin), invited to the repositories it works on; the
helper names none, it uses the token installed on this machine, which no session can read. `@HELPER@` runs outside the
sandbox: it pushes one `agent/**` branch, never forced, after gitleaks has read the pushed commits, their messages and file
names; it opens pull requests. A hook takes a call to it in one form only.

## Push a branch

```sh
git bundle create /tmp/claude-<uid>/<your temp folder>/agent.bundle agent/<name>
```
then, as a command of its own, every path written out in full (no variable, no glob, nothing chained, no redirect):
```sh
@HELPER@ push <owner>/<repo> /tmp/claude-<uid>/<your temp folder>/agent.bundle
```
A rewrite of a branch already pushed is refused: push new commits on top.

## Open a pull request

Write a file under the session's temporary space: the title on its first line, a blank line, the body (in the repository's
language for code, English here, with no attribution line). Then:
```sh
@HELPER@ open <owner>/<repo> agent/<name> /tmp/claude-<uid>/<your temp folder>/pr.md
```

## What it refuses
Any branch but one `agent/**`, a forced push, a tag, a repository not on its allow list, a change to `.github/workflows/` or
`.github/actions/` (what runs on GitHub is a person's to push), a bundle or file outside the session's temporary space, a
secret gitleaks finds in the commits, their messages, authors or file names, the title or the body (an allow comment does
not lift it), a missing or open token, a missing gitleaks. Merging stays with the person or GitHub's rules.
