import { describe, expect, it } from "bun:test";
import {
  ChecksUnavailable,
  WatcherQueryError,
  buildReviewThreads,
  mapRollupNode,
  orderStack,
  parseFastCheck,
  parsePullRequest,
  parseReviewThreadPage,
  resolveChecks,
  resolveContext,
  resolveReviewThreads,
} from "./github.ts";
import {
  fakeReader,
  failedCheck,
  passingCheck,
  pendingCheck,
} from "./fakes.test-helper.ts";
import { parsePrNumber } from "./types.ts";

const context = {
  owner: "owner",
  repo: "repo",
  number: parsePrNumber(42),
};

describe("checks fallback chain", () => {
  it("uses a non-empty fast-path result without a rollup query", async () => {
    const reader = fakeReader({
      fastPath: { kind: "checks", checks: [passingCheck("fast")] },
    });
    const read = await resolveChecks(reader, context);
    expect(read.source).toBe("gh-pr-checks");
    expect(read.checks.map((check) => check.name)).toEqual(["fast"]);
    expect(reader.calls).toEqual(["checksFastPath"]);
  });

  it("paginates GraphQL when the fast path is unusable", async () => {
    const reader = fakeReader({
      fastPath: { kind: "unusable", exitCode: 8, stderr: "" },
      rollupPages: [
        { checks: [passingCheck("first")], endCursor: "next" },
        { checks: [failedCheck("second")], endCursor: null },
      ],
    });
    const read = await resolveChecks(reader, context);
    expect(read.source).toBe("graphql-rollup");
    expect(read.checks.map((check) => check.name)).toEqual(["first", "second"]);
    expect(reader.calls).toEqual([
      "checksFastPath",
      "checkRollupPage:null",
      "checkRollupPage:next",
    ]);
  });

  it("falls back when valid fast-path JSON represented an empty list", async () => {
    const reader = fakeReader({
      fastPath: { kind: "checks", checks: [] },
      rollupPages: [{ checks: [pendingCheck("fallback")], endCursor: null }],
    });
    expect((await resolveChecks(reader, context)).checks[0].name).toBe(
      "fallback"
    );
    expect(reader.calls).toEqual(["checksFastPath", "checkRollupPage:null"]);
  });

  it("fails closed when both paths are empty", async () => {
    const reader = fakeReader({
      fastPath: {
        kind: "unusable",
        exitCode: 8,
        stderr: "credential cannot read checks",
      },
    });
    await expect(resolveChecks(reader, context)).rejects.toBeInstanceOf(
      ChecksUnavailable
    );
    expect(reader.calls).toEqual(["checksFastPath", "checkRollupPage:null"]);
  });
});

describe("rollup node mapping", () => {
  it("maps terminal and non-terminal CheckRun states fail closed", () => {
    const cases = [
      ["IN_PROGRESS", null, "pending", "PENDING"],
      ["COMPLETED", "SUCCESS", "passed", "SUCCESS"],
      ["COMPLETED", "NEUTRAL", "skipped", "NEUTRAL"],
      ["COMPLETED", "SKIPPED", "skipped", "SKIPPED"],
      ["COMPLETED", "ACTION_REQUIRED", "failed", "ACTION_REQUIRED"],
      ["COMPLETED", "TIMED_OUT", "failed", "FAILURE"],
      ["COMPLETED", "FUTURE_VALUE", "failed", "FAILURE"],
    ] as const;
    for (const [status, conclusion, kind, reportedState] of cases) {
      expect(
        mapRollupNode({
          __typename: "CheckRun",
          name: "ci",
          status,
          conclusion,
        })
      ).toMatchObject({ kind, reportedState });
    }
  });

  it("classifies an in-progress Code Review Gate from the rollup as the gate", () => {
    expect(
      mapRollupNode({
        __typename: "CheckRun",
        name: "Code Review Gate",
        status: "IN_PROGRESS",
        conclusion: null,
      })
    ).toMatchObject({ kind: "code-review-gate" });
    expect(
      mapRollupNode({
        __typename: "StatusContext",
        context: "Code Review Gate",
        state: "PENDING",
      })
    ).toMatchObject({ kind: "code-review-gate" });
  });

  it("classifies a Code Review Gate waiting on an owner approval as the gate", () => {
    expect(
      mapRollupNode({
        __typename: "CheckRun",
        name: "Code Review Gate",
        status: "COMPLETED",
        conclusion: "ACTION_REQUIRED",
        description: "1 of 2 policies",
      })
    ).toMatchObject({
      kind: "code-review-gate",
      reportedState: "ACTION_REQUIRED",
    });
  });

  it("classifies a fast-path Code Review Gate waiting on an owner approval as the gate", () => {
    expect(
      parseFastCheck({
        name: "Code Review Gate",
        state: "ACTION_REQUIRED",
        bucket: "fail",
      })
    ).toMatchObject({
      kind: "code-review-gate",
      reportedState: "ACTION_REQUIRED",
    });
    expect(
      parseFastCheck({ name: "ci", state: "ACTION_REQUIRED", bucket: "fail" })
    ).toMatchObject({ kind: "failed", reportedState: "ACTION_REQUIRED" });
  });

  it("maps StatusContext states and drops unknown typenames", () => {
    expect(
      mapRollupNode({
        __typename: "StatusContext",
        context: "ci",
        state: "EXPECTED",
      })
    ).toMatchObject({ kind: "pending", reportedState: "PENDING" });
    expect(
      mapRollupNode({
        __typename: "StatusContext",
        context: "ci",
        state: "FUTURE_VALUE",
      })
    ).toMatchObject({ kind: "failed", reportedState: "FUTURE_VALUE" });
    expect(mapRollupNode({ __typename: "FutureNode" })).toBeNull();
  });
});

describe("closed enum parsing", () => {
  const rawPullRequest = {
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    reviewDecision: "APPROVED",
    headRefOid: "head",
    headRefName: "feature",
    baseRefName: "main",
    state: "OPEN",
    mergedAt: null,
    isDraft: false,
  };

  it("accepts mergeStateStatus CONFLICTING", () => {
    expect(
      parsePullRequest(
        { ...rawPullRequest, mergeStateStatus: "CONFLICTING" },
        context
      ).mergeStateStatus
    ).toBe("CONFLICTING");
  });

  it("reads gh's empty reviewDecision as no decision rather than a parse failure", () => {
    expect(
      parsePullRequest({ ...rawPullRequest, reviewDecision: "" }, context)
        .reviewDecision
    ).toBeNull();
  });

  it("still rejects an unknown reviewDecision", () => {
    expect(() =>
      parsePullRequest({ ...rawPullRequest, reviewDecision: "MAYBE" }, context)
    ).toThrow(WatcherQueryError);
  });

  it("rejects unknown enum values as retryable errors carrying the raw value", () => {
    try {
      parsePullRequest(
        { ...rawPullRequest, mergeStateStatus: "FUTURE_STATE" },
        context
      );
      throw new Error("expected parser to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(WatcherQueryError);
      if (!(error instanceof WatcherQueryError)) throw error;
      expect(error.failure).toMatchObject({
        kind: "missing-key",
        retryable: true,
        rawValue: '"FUTURE_STATE"',
      });
    }
  });
});

it("annotates Claude Code Review threads with distinct review-pass counts", () => {
  const response = {
    data: {
      repository: {
        pullRequest: {
          reviewThreads: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [
              {
                id: "one",
                isResolved: false,
                comments: {
                  nodes: [
                    {
                      body: "🔴 **Important**: Token refresh races with logout, leaving stale sessions active\n\n<details>\n<summary>Why this was flagged</summary>\n\n`refreshToken` writes the session after `logout` cleared it.\n</details>",
                      createdAt: "now",
                      path: "a.ts",
                      line: 1,
                      author: { login: "claude" },
                      pullRequestReview: { id: "PRR_review1" },
                      originalCommit: { oid: "3f9c2a1" },
                    },
                  ],
                },
              },
              {
                id: "two",
                isResolved: false,
                comments: {
                  nodes: [
                    {
                      body: "🟡 **Nit**: `parseExpiry` silently returns 0 on malformed input",
                      createdAt: "now",
                      path: null,
                      line: null,
                      author: { login: "claude" },
                      pullRequestReview: { id: "PRR_review2" },
                      originalCommit: { oid: "8d04e7b" },
                    },
                  ],
                },
              },
              {
                id: "resolved",
                isResolved: true,
                comments: {
                  nodes: [
                    {
                      body: "🟣 **Pre-existing**: `retry` never resets its backoff",
                      createdAt: "now",
                      path: null,
                      line: null,
                      author: { login: "claude" },
                      pullRequestReview: { id: "PRR_review3" },
                      originalCommit: { oid: "c51b6f0" },
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    },
  };
  const threads = buildReviewThreads(parseReviewThreadPage(response).threads);
  expect(threads).toHaveLength(2);
  expect(threads.map((thread) => thread.isReviewBot)).toEqual([true, true]);
  expect(threads.map((thread) => thread.reviewBotPasses)).toEqual([3, 3]);
});

it("counts Claude Code Review passes per review, not per thread", () => {
  const comment = (
    login: string,
    body: string,
    review: string | null,
    commit: string
  ) => ({
    body,
    createdAt: "now",
    path: "src/cache.ts",
    line: 7,
    author: { login },
    pullRequestReview: review === null ? null : { id: review },
    originalCommit: { oid: commit },
  });
  const thread = (id: string, first: ReturnType<typeof comment>) => ({
    id,
    isResolved: false,
    comments: { nodes: [first] },
  });
  const response = {
    data: {
      repository: {
        pullRequest: {
          reviewThreads: {
            pageInfo: { hasNextPage: false, endCursor: null },
            nodes: [
              thread(
                "first-push-a",
                comment(
                  "claude",
                  "🔴 **Important**: Cache key omits the locale",
                  "PRR_push1",
                  "head1"
                )
              ),
              thread(
                "first-push-b",
                comment(
                  "claude",
                  "🟡 **Nit**: `ttl` is read twice",
                  "PRR_push1",
                  "head1"
                )
              ),
              thread(
                "second-push",
                comment(
                  "claude",
                  "🔴 **Important**: Eviction drops pinned entries",
                  "PRR_push2",
                  "head2"
                )
              ),
              thread(
                "no-review",
                comment(
                  "claude",
                  "🟡 **Nit**: Stale comment above `evict`",
                  null,
                  "head3"
                )
              ),
              thread(
                "bughunter-only",
                comment(
                  "claude",
                  '**Important**: Retry loop never sleeps\n\n<!-- bughunter-severity: {"normal":1,"nit":0,"pre_existing":0} -->',
                  "PRR_push2",
                  "head2"
                )
              ),
              thread(
                "claude-unmarked",
                comment(
                  "claude",
                  "Consider extracting the retry loop into a helper.",
                  "PRR_unmarked",
                  "head3"
                )
              ),
              thread(
                "claude-severity-word",
                comment(
                  "claude",
                  "What severity should a flaky retry get here?",
                  "PRR_unmarked",
                  "head3"
                )
              ),
              thread(
                "human",
                comment(
                  "octocat",
                  "🔴 Is this branch reachable?",
                  "PRR_human",
                  "head3"
                )
              ),
            ],
          },
        },
      },
    },
  };
  const threads = buildReviewThreads(parseReviewThreadPage(response).threads);
  expect(threads.map((thread) => thread.isReviewBot)).toEqual([
    true,
    true,
    true,
    true,
    true,
    false,
    false,
    false,
  ]);
  expect(threads.map((thread) => thread.reviewBotPasses)).toEqual([
    3, 3, 3, 3, 3, 3, 3, 3,
  ]);
});

describe("review thread pagination", () => {
  const thread = (id: string, resolved = false) => ({
    id,
    firstComment: {
      authorLogin: "someone",
      body: "please fix",
      path: "a.ts",
      line: 1,
      createdAt: "now",
    },
    passKey: null,
    resolved,
  });

  it("keeps walking pages until the cursor is exhausted", async () => {
    const reader = fakeReader({
      threadPages: [
        { threads: [thread("one")], endCursor: "next" },
        { threads: [thread("two")], endCursor: "last" },
        { threads: [thread("three")], endCursor: null },
      ],
    });
    const threads = await resolveReviewThreads(reader, context);
    expect(threads.map((item) => item.id)).toEqual(["one", "two", "three"]);
    expect(reader.calls).toEqual([
      "reviewThreadPage:null",
      "reviewThreadPage:next",
      "reviewThreadPage:last",
    ]);
  });

  it("sees an unresolved thread that sits past the first page", async () => {
    const reader = fakeReader({
      threadPages: [
        { threads: [thread("early", true)], endCursor: "next" },
        { threads: [thread("late")], endCursor: null },
      ],
    });
    const threads = await resolveReviewThreads(reader, context);
    expect(threads.map((item) => item.id)).toEqual(["late"]);
  });

  it("stops after a single page when the cursor is exhausted", async () => {
    const reader = fakeReader({
      threadPages: [{ threads: [thread("only")], endCursor: null }],
    });
    expect((await resolveReviewThreads(reader, context)).length).toBe(1);
    expect(reader.calls).toEqual(["reviewThreadPage:null"]);
  });

  it("counts Claude Code Review passes across every page", async () => {
    const review = (id: string, reviewId: string) => ({
      id,
      firstComment: {
        authorLogin: "claude",
        body: "🔴 **Important** null deref",
        path: "a.ts",
        line: 1,
        createdAt: "now",
      },
      passKey: reviewId,
      resolved: false,
    });
    const reader = fakeReader({
      threadPages: [
        { threads: [review("one", "PRR_1")], endCursor: "next" },
        { threads: [review("two", "PRR_2")], endCursor: null },
      ],
    });
    const threads = await resolveReviewThreads(reader, context);
    expect(threads.map((item) => item.reviewBotPasses)).toEqual([2, 2]);
  });

  it("drops resolved threads from later pages too", async () => {
    const reader = fakeReader({
      threadPages: [
        { threads: [thread("one")], endCursor: "next" },
        { threads: [thread("two", true)], endCursor: null },
      ],
    });
    expect(
      (await resolveReviewThreads(reader, context)).map((item) => item.id)
    ).toEqual(["one"]);
  });

  it("rejects a page that omits pageInfo instead of assuming one page", async () => {
    const response = {
      data: {
        repository: {
          pullRequest: { reviewThreads: { nodes: [] } },
        },
      },
    };
    expect(() => parseReviewThreadPage(response)).toThrow(WatcherQueryError);
  });
});

describe("context and stack discovery", () => {
  it("returns a fully explicit context without any reader call", async () => {
    const reader = fakeReader();
    expect(
      await resolveContext({
        reader,
        owner: "explicit",
        repo: "repo",
        pr: context.number,
      })
    ).toEqual({ owner: "explicit", repo: "repo", number: context.number });
    expect(reader.calls).toEqual([]);
  });

  it("uses the local origin before currentPr for an explicit number", async () => {
    const reader = fakeReader({ origin: { owner: "local", repo: "checkout" } });
    expect(
      await resolveContext({
        reader,
        owner: null,
        repo: null,
        pr: context.number,
      })
    ).toEqual({ owner: "local", repo: "checkout", number: context.number });
    expect(reader.calls).toEqual(["originRepo"]);
  });

  it("orders the connected stack bottom-to-top", () => {
    const ordered = orderStack(context, [
      {
        number: parsePrNumber(41),
        headRefName: "base-feature",
        baseRefName: "main",
      },
      {
        number: context.number,
        headRefName: "feature",
        baseRefName: "base-feature",
      },
      {
        number: parsePrNumber(43),
        headRefName: "upstack",
        baseRefName: "feature",
      },
    ]);
    expect(ordered.map((item) => Number(item.number))).toEqual([41, 42, 43]);
  });
});
