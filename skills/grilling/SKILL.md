---
name: grilling
description: Grill the user relentlessly about a plan, decision, or idea, a round at a time, in your reply or as a page in the browser. Use when the user wants to stress-test their thinking, or uses any 'grill' trigger phrases.
---

Interview the user relentlessly until you reach a shared understanding. Map this as a **design tree**: every decision branches into the decisions that hang off it.

Work the tree in **rounds**. The **frontier** is every decision whose prerequisites are already settled: the questions you can ask _now_ without guessing at answers you haven't heard yet. Ask the whole frontier in one round: number each question and give your recommended answer. Then wait for the user's answers before the next round.

Format a round like so:

```
❓ **Q1** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>

---

❓ **Q2** - **<question title>**: <question body, might be multiple paragraphs, including multiple choices>

➡️ <your recommended answer>
```

Each round the user answers reshapes the tree: settled decisions push the frontier outward and unblock questions that depended on them. Recompute the frontier and ask the next round. A question whose answer depends on another question still open in this round belongs to a _later_ round, not this one.

Finding _facts_ is your job, never the user's. When a frontier question needs a fact from the environment (filesystem, tools, etc.), dispatch a sub-agent to find it; don't ask the user for anything you could look up yourself. Don't block on it: a running exploration is an unsettled prerequisite, so only the questions downstream of it wait for the sub-agent to report; ask the rest of the frontier now. The _decisions_ are the user's: put each to them and wait.

The session is done when the frontier is empty: every branch of the design tree visited, nothing left silently assumed. Do not act on it until the user confirms you have reached a shared understanding.

## Channel

The **channel** is where a round reaches the user and where their answers come back. Pick it before the first round, and again whenever the user asks for the other one:

1. **The user's word.** The user asks for the browser or for plain text, before or during the grilling: that channel runs from the next round on.
2. **Browser** when the session can show the user a page on their own machine. The session can't when it runs in the cloud or on a remote host, when the user said they're away from their machine or following on another device, and when an agent answers in the user's place.
3. **Text** otherwise: print each round in your reply.

To run the browser channel, first check that `node ${CLAUDE_SKILL_DIR}/dist/cli.mjs --help` succeeds (`${CLAUDE_SKILL_DIR}` is this skill's folder), then read [`browser-channel.md`](browser-channel.md) in full and run every round through it. When the check fails, run the text channel and tell the user in one sentence what failed.
