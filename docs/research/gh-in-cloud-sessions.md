# `gh` in Claude Code cloud sessions

Researched 2026-10-04 for #111 (with #103 and #106). Sources are Anthropic's Claude Code docs and GitHub's changelog, read on that date. Nothing here was run in a cloud session. Claims marked **unverified** rest on inference or on the #102 smoke test alone.

## Question

In a Claude Code cloud session, how is `gh` authenticated? Is GitHub GraphQL (`api.github.com/graphql`) reachable through the session's proxy? Does a GitHub token you supply, as an environment variable or an API credential, restore it?

## Verdict

No. A token does not restore GraphQL. The GitHub proxy serves only a pinned set of GraphQL operations, and the docs say the restriction holds whatever credentials you supply. The kitchen needs a REST path through `gh api`, which is what #111's triage comment prescribes for this case.

## Findings

### How `gh` is authenticated

- In Anthropic-hosted environments, all GitHub operations go through a dedicated GitHub proxy that keeps your real GitHub credentials outside the session's VM. It applies at every network access level. Source: [Cloud environments, GitHub proxy](https://code.claude.com/docs/en/cloud-environments#github-proxy).
- If you set neither `GH_TOKEN` nor `GITHUB_TOKEN`, both read as the placeholder string `proxy-injected` inside the session. The proxy substitutes your real credentials on outbound GitHub requests, so `gh` works without a token of your own. Source: [Cloud environments, Work with GitHub issues and pull requests](https://code.claude.com/docs/en/cloud-environments#work-with-github-issues-and-pull-requests).
- The real credential is whichever [GitHub authentication option](https://code.claude.com/docs/en/claude-code-on-the-web#github-authentication-options) you connected: the Claude GitHub App, or your local `gh` token sent with `/web-setup`. Either way it stays encrypted on Anthropic's servers and never enters the VM. Source: [Use Claude Code in the cloud, GitHub authentication options](https://code.claude.com/docs/en/claude-code-on-the-web#github-authentication-options).
- This explains #111's observation that `gh auth status` reports the token as invalid: `gh` checks the literal placeholder `proxy-injected`, while requests that go out through the proxy carry the real credential. **Unverified** as the exact mechanism. It follows from the placeholder behavior above, and the docs don't mention `gh auth status`.

### Whether GraphQL is reachable

- The proxy "serves only a pinned set of GraphQL operations for pull-request workflows". It rejects everything else on the GraphQL endpoint with a 403 that says `This GraphQL query is not enabled for this session` and names the REST fallback, `gh api repos/{owner}/{repo}/...`. GitHub APIs that exist only in GraphQL, such as Projects v2, are out of reach. Source: [Cloud environments, GitHub proxy](https://code.claude.com/docs/en/cloud-environments#github-proxy), "GraphQL restrictions".
- The docs don't list the pinned operations. The #102 smoke test (gh 2.89.0) saw `gh repo view`, `gh pr create`, `gh pr edit` and `gh pr view --json` fail, so the kitchen can't count on any porcelain command. **Unverified** for other `gh` versions, whose queries may differ.
- GitHub API requests reach only repositories attached to the session. A request to an unattached repository gets a 403. Source: [Cloud environments, GitHub proxy](https://code.claude.com/docs/en/cloud-environments#github-proxy), "Repository scope". This matches #111's note that REST works "once the repo is attached to the session".
- `api.github.com` is on the default Trusted allowlist. That doesn't matter here, because GitHub traffic takes the proxy's own path whatever the access level. Source: [Cloud environments, Access levels](https://code.claude.com/docs/en/cloud-environments#access-levels) and [Default allowed domains](https://code.claude.com/docs/en/cloud-environments#default-allowed-domains).

### Whether a user-supplied token restores it

- **Environment variable**: a `GH_TOKEN` or `GITHUB_TOKEN` you set passes through to the container unchanged, and `gh` uses it directly ([Work with GitHub issues and pull requests](https://code.claude.com/docs/en/cloud-environments#work-with-github-issues-and-pull-requests)). Its requests still go through the proxy, and the GraphQL restriction "applies to every request through the proxy regardless of the credentials you supply, so a `GH_TOKEN` you set gets the same 403" ([GitHub proxy](https://code.claude.com/docs/en/cloud-environments#github-proxy)). It also leaves the token readable by anyone who uses the environment.
- **API credential** (Pro and Max plans only): the agent proxy never attaches an API credential to GitHub requests, because the GitHub proxy authenticates those. Source: [Cloud environments, Requests that never get the credential](https://code.claude.com/docs/en/cloud-environments#requests-that-never-get-the-credential).
- So neither route gives `gh` working GraphQL. That rests on the docs alone and is **unverified** in a live session, which this research couldn't start.

### Media for #106

- `gh` 2.99.0 added `--attach` to `gh issue create`, `gh issue edit`, `gh issue comment`, `gh pr create`, `gh pr edit` and `gh pr comment`. It uploads a local image or video and needs write access to the repository. GitHub doesn't document the upload endpoint. Source: [GitHub Changelog, 2026-09-01](https://github.blog/changelog/2026-09-01-github-cli-media-in-issues-pull-requests-and-comments/).
- Every command that takes `--attach` is GraphQL-backed porcelain, and the #102 cloud thread had gh 2.89.0, which has no `--attach` at all. GitHub's REST API documents no upload for issue or PR body media. So a cloud thread puts its evidence inline as text. **Unverified**: whether the attachment upload itself would pass the proxy with a newer `gh`.

### What has no REST form

The GraphQL-only operations the kitchen touches are resolving a review thread, arming auto-merge, and Projects v2. A cloud thread can't do them through the proxy. watch-pr reads PR state with `gh api graphql` (`skills/make-it-so/scripts/watch-pr/github.ts`, `graphqlArgs`) and retries query errors up to `--max-query-errors`, so it can't work in a cloud thread either (#103).

## Side finding

The installed-tools table says Bun is pre-installed "but has known proxy compatibility issues" for package fetching ([Cloud environments, Installed tools](https://code.claude.com/docs/en/cloud-environments#installed-tools)). `templates/verification.md`'s Cloud environments section told kitchens to install Bun in their setup script, which is redundant. It now says Bun is preinstalled, and it keeps the proxy caveat, because each vendored script's first run calls `bun install`. The README and `docs/agents/verification.md` match it. Whether that first `bun install` fails through the proxy is **unverified**.

## Applied in

- `skills/setup-milliways/templates/issue-tracker.md` and `docs/agents/issue-tracker.md`: a Cloud threads section of `gh api` REST forms.
- `skills/pr/SKILL.md`: a Cloud threads section covering create, labels, edit, comments, and inline evidence in place of `--attach`.
- `skills/make-it-so/playbooks/babysit.md` step 6: a REST status read in place of watch-pr in cloud threads.
