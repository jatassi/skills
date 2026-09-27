# Every merge to main is a release; changes land on dev

Changes are made on a long-lived `dev` branch and reach `main` by pull request. The release workflow tests every pull request into `main`, and every push to `main` releases: it builds, bumps the version (patch by default, or the pull request's `release:minor` or `release:major` label), pins the marketplace, commits, tags, publishes a GitHub Release, and fast-forwards `dev` to the release commit. We chose this because skills.sh (`npx skills add jatassi/skills`) and Agent Plugins clients install from `main`, while Claude Code installs the pinned tag ([ADR 0002](0002-installs-pinned-to-release-tags.md)). Releasing on every merge keeps all three installing the same thing.

The merge is not tested again. The pull request's run keeps its bundle under the git tree it tested, and the release requires a bundle for exactly the tree it is releasing, then checks its own build against it byte for byte. So `main` is behind its build only while the release builds, and a merge whose tree was never tested fails the release rather than shipping it.

## Considered Options

- **Release on any push to `main`, testing after the push.** Rejected: a failed test leaves `main` with new skill text beside the old bundle, and skills.sh serves that until it is fixed.
- **The workflow is the only writer to `main`**, testing and building from `dev` and pushing source and bundle in one commit. Rejected for now: it closes the window between merge and build, but `main` can no longer take pull requests.
- **Keep releases manual.** Rejected: `main` is what skills.sh and Agent Plugins serve, so every merge was already a release for them, just an untagged one with a stale bundle.

## Consequences

- Merge `dev` into `main` with a merge commit, with `main` up to date in the pull request. A squash merge also releases, but leaves `dev` behind `main`, so it cannot be fast-forwarded.
- If `main` moves between a pull request's last run and its merge, the merged tree was never tested and the release fails. Dispatch Release on `main` to test and release it as it is.
- Tested bundles are kept 30 days. A pull request merged later than that needs a new push, or a dispatch after the merge.
- A push to `main` made with the workflow's token (the release commit) does not start another run.
