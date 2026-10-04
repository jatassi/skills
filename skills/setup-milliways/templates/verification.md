# Verification

How a verifier proves a change works in this kitchen.

Verify skill: {{verifySkill}}

## The live lane is the floor

Every verdict includes the live lane: drive the running app the way a user does, on the surface the change touches, and capture the evidence (screenshots, a screencast, CLI transcripts). A verdict without live evidence is not a pass. CI passing is an input to the verdict, never the verdict.

When the verify skill above is `none`, prove the behaviour live by hand with whatever drives the surface (a browser, the CLI, a simulator), and propose creating one with `create-verification-skill`. Once a verify skill exists, `maintain-verification-skill` keeps it and its feature map current.

## Verdicts

A verdict is pass or fail, bound to the pull request's head SHA and patch-id, so a rebase can't carry a stale pass. It is recorded in GitHub, as a pull request comment that names the head SHA, the patch-id, the lanes run and the evidence, at one ledger tier: `live-ui-verified`, `unit-test-verified`, `type-check-only`, `verifier-blocked` or `verifier-failed`.
