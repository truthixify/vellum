import { describe, expect, mock, test } from "bun:test";
import { ccc } from "@ckb-ccc/core";
import { ClaimData } from "@vellum/sdk";

import { GithubOAuthError } from "./errors";
import { classifyGithubPath, collectGithubContributions } from "./github-contributions";
import {
  GITHUB_REPOSITORY_REGISTRY_VERSION,
  TRUSTED_GITHUB_REPOSITORIES,
} from "./github-repositories";

const NOW = 1_800_000_000;
const TOKEN = "github-token-for-tests";
const ACCOUNT = { id: 5_830_913, login: "truthixify" };
const REPOSITORY_ID = "R_kgDOLw3gsg";
const REPOSITORY_NAME = "ckb-devrel/ccc-next";
const REPOSITORY_URL = `https://api.github.com/repos/${REPOSITORY_NAME}`;

function searchResponse(total: number, items: unknown[], incomplete = false): Response {
  return Response.json({ total_count: total, incomplete_results: incomplete, items });
}

function searchItem(number = 376) {
  return { number, repository_url: REPOSITORY_URL };
}

function repositoryResponse(overrides: Record<string, unknown> = {}): Response {
  return Response.json({
    node_id: REPOSITORY_ID,
    full_name: REPOSITORY_NAME,
    fork: false,
    url: REPOSITORY_URL,
    ...overrides,
  });
}

function pullResponse(number = 376, overrides: Record<string, unknown> = {}): Response {
  return Response.json({
    node_id: `PR_fixture_${number}`,
    number,
    title: "Add identifier helpers",
    html_url: `https://github.com/${REPOSITORY_NAME}/pull/${number}`,
    merged_at: new Date((NOW - 100) * 1_000).toISOString(),
    merge_commit_sha: "f727991ef727991ef727991ef727991ef727991e",
    changed_files: 1,
    user: { id: ACCOUNT.id },
    base: { repo: { node_id: REPOSITORY_ID } },
    ...overrides,
  });
}

describe("GitHub contribution evidence", () => {
  test("publishes a stable repository registry with unique IDs and names", () => {
    expect(GITHUB_REPOSITORY_REGISTRY_VERSION).toBe("ckb.public-contributions.v1");
    expect(TRUSTED_GITHUB_REPOSITORIES.length).toBeGreaterThan(20);
    expect(new Set(TRUSTED_GITHUB_REPOSITORIES.map(({ id }) => id)).size).toBe(
      TRUSTED_GITHUB_REPOSITORIES.length,
    );
    expect(new Set(TRUSTED_GITHUB_REPOSITORIES.map(({ name }) => name)).size).toBe(
      TRUSTED_GITHUB_REPOSITORIES.length,
    );
    expect(Object.isFrozen(TRUSTED_GITHUB_REPOSITORIES)).toBe(true);
    expect(TRUSTED_GITHUB_REPOSITORIES.every((repository) => Object.isFrozen(repository))).toBe(
      true,
    );
  });

  test("follows search and file pagination and recognizes a renamed trusted repository", async () => {
    const firstPage = Array.from({ length: 100 }, (_, index) => searchItem(376 + index));
    const fetch = mock(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === "/search/issues") {
        const query = url.searchParams.get("q") ?? "";
        if (query.startsWith("reviewed-by:")) return searchResponse(0, []);
        return url.searchParams.get("page") === "1"
          ? searchResponse(101, firstPage)
          : searchResponse(101, [searchItem(476)]);
      }
      if (url.href === REPOSITORY_URL) return repositoryResponse();
      const pullMatch = url.pathname.match(/\/pulls\/(\d+)$/);
      if (pullMatch) {
        return pullResponse(Number(pullMatch[1]));
      }
      if (/\/pulls\/\d+\/files$/.test(url.pathname)) {
        return Response.json([
          {
            filename: url.pathname.endsWith("/pulls/376/files")
              ? "packages/did-ckb/src/index.ts"
              : "docs/guide.md",
          },
        ]);
      }
      throw new Error(`Unexpected GitHub request: ${url}`);
    });

    const result = await collectGithubContributions(TOKEN, ACCOUNT, NOW, {
      fetch,
      now: () => NOW,
    });

    expect(result).toMatchObject({
      user_id: ACCOUNT.id,
      login: ACCOUNT.login,
      repository_registry: "ckb.public-contributions.v1",
      eligible_artifact_count: 101,
    });
    expect(result?.artifacts).toContainEqual(
      expect.objectContaining({
        repository_id: REPOSITORY_ID,
        repository: REPOSITORY_NAME,
        number: 376,
        classification: "technical",
        kind: "merged_pull_request",
      }),
    );
    expect(
      fetch.mock.calls.every((call) => {
        const headers = call[1]?.headers as Record<string, string>;
        return headers.authorization === `Bearer ${TOKEN}`;
      }),
    ).toBe(true);
    expect(
      fetch.mock.calls.every((call) => {
        const path = new URL(String(call[0])).pathname;
        const headers = call[1]?.headers as Record<string, string>;
        return (
          headers["x-github-api-version"] ===
          (/\/pulls\/\d+$/.test(path) ? "2022-11-28" : "2026-03-10")
        );
      }),
    ).toBe(true);
    expect(JSON.stringify(result)).not.toContain(TOKEN);
  });

  test("counts one substantive review per merged pull request", async () => {
    const comments = Array.from({ length: 100 }, (_, index) => ({
      node_id: `PRR_comment_${index}`,
      state: "COMMENTED",
      submitted_at: new Date((NOW - 300 - index) * 1_000).toISOString(),
      user: { id: ACCOUNT.id },
    }));
    const fetch = mock(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname === "/search/issues") {
        return url.searchParams.get("q")?.startsWith("reviewed-by:")
          ? searchResponse(1, [searchItem(200)])
          : searchResponse(0, []);
      }
      if (url.href === REPOSITORY_URL) return repositoryResponse();
      if (url.pathname.endsWith("/pulls/200")) {
        return pullResponse(200, { user: { id: 99 }, changed_files: 1 });
      }
      if (url.pathname.endsWith("/pulls/200/files")) {
        return Response.json([{ filename: "docs/contributing.md" }]);
      }
      if (url.pathname.endsWith("/pulls/200/reviews")) {
        return url.searchParams.get("page") === "1"
          ? Response.json(comments)
          : Response.json([
              {
                node_id: "PRR_substantive_review",
                state: "APPROVED",
                submitted_at: new Date((NOW - 200) * 1_000).toISOString(),
                user: { id: ACCOUNT.id },
              },
            ]);
      }
      throw new Error(`Unexpected GitHub request: ${url}`);
    });

    const result = await collectGithubContributions(TOKEN, ACCOUNT, NOW, {
      fetch,
      now: () => NOW,
    });

    expect(result?.artifacts).toEqual([
      expect.objectContaining({
        artifact_id: "PRR_substantive_review",
        pull_request_id: "PR_fixture_200",
        classification: "ecosystem",
        kind: "pull_request_review",
      }),
    ]);
  });

  test("does not stack a pull request found by both searches", async () => {
    const fetch = mock(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname === "/search/issues") return searchResponse(1, [searchItem()]);
      if (url.href === REPOSITORY_URL) return repositoryResponse();
      if (url.pathname.endsWith("/pulls/376")) return pullResponse();
      if (url.pathname.endsWith("/pulls/376/files")) {
        return Response.json([{ filename: "src/index.ts" }]);
      }
      throw new Error(`Unexpected GitHub request: ${url}`);
    });

    const result = await collectGithubContributions(TOKEN, ACCOUNT, NOW, {
      fetch,
      now: () => NOW,
    });

    expect(result?.eligible_artifact_count).toBe(1);
    expect(result?.artifacts).toEqual([
      expect.objectContaining({
        artifact_id: "PR_fixture_376",
        kind: "merged_pull_request",
      }),
    ]);
  });

  test("ignores a pending review without a submission time", async () => {
    const fetch = mock(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname === "/search/issues") {
        return url.searchParams.get("q")?.startsWith("reviewed-by:")
          ? searchResponse(1, [searchItem(200)])
          : searchResponse(0, []);
      }
      if (url.href === REPOSITORY_URL) return repositoryResponse();
      if (url.pathname.endsWith("/pulls/200")) {
        return pullResponse(200, { user: { id: 99 } });
      }
      if (url.pathname.endsWith("/pulls/200/files")) {
        return Response.json([{ filename: "src/index.ts" }]);
      }
      if (url.pathname.endsWith("/pulls/200/reviews")) {
        return Response.json([
          {
            node_id: "PRR_pending_review",
            state: "PENDING",
            submitted_at: null,
            user: { id: ACCOUNT.id },
          },
        ]);
      }
      throw new Error(`Unexpected GitHub request: ${url}`);
    });

    await expect(
      collectGithubContributions(TOKEN, ACCOUNT, NOW, { fetch, now: () => NOW }),
    ).resolves.toBeUndefined();
  });

  test("ignores forks, repositories outside the registry, and deleted artifacts", async () => {
    for (const repository of [
      repositoryResponse({ fork: true }),
      repositoryResponse({ node_id: "R_untrusted_repository" }),
    ]) {
      const fetch = mock(async (input: string | URL | Request) => {
        const url = new URL(String(input));
        if (url.pathname === "/search/issues") {
          return url.searchParams.get("q")?.startsWith("author:")
            ? searchResponse(1, [searchItem()])
            : searchResponse(0, []);
        }
        if (url.href === REPOSITORY_URL) return repository;
        throw new Error(`Unexpected GitHub request: ${url}`);
      });
      expect(
        await collectGithubContributions(TOKEN, ACCOUNT, NOW, { fetch, now: () => NOW }),
      ).toBeUndefined();
    }

    const deletedFetch = mock(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname === "/search/issues") {
        return url.searchParams.get("q")?.startsWith("author:")
          ? searchResponse(1, [searchItem()])
          : searchResponse(0, []);
      }
      if (url.href === REPOSITORY_URL) return repositoryResponse();
      if (url.pathname.endsWith("/pulls/376")) return new Response(null, { status: 404 });
      throw new Error(`Unexpected GitHub request: ${url}`);
    });
    expect(
      await collectGithubContributions(TOKEN, ACCOUNT, NOW, {
        fetch: deletedFetch,
        now: () => NOW,
      }),
    ).toBeUndefined();
  });

  test("fails closed on incomplete, malformed, and rate-limited provider responses", async () => {
    const incomplete = mock(async () => searchResponse(1, [searchItem()], true));
    await expect(
      collectGithubContributions(TOKEN, ACCOUNT, NOW, {
        fetch: incomplete,
        now: () => NOW,
      }),
    ).rejects.toMatchObject({ code: "provider_unavailable" });

    const malformed = mock(async () => Response.json({ total_count: 1, items: [] }));
    await expect(
      collectGithubContributions(TOKEN, ACCOUNT, NOW, {
        fetch: malformed,
        now: () => NOW,
      }),
    ).rejects.toBeInstanceOf(GithubOAuthError);

    const rateLimited = mock(
      async () =>
        new Response(null, {
          status: 403,
          headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": String(NOW + 60) },
        }),
    );
    await expect(
      collectGithubContributions(TOKEN, ACCOUNT, NOW, {
        fetch: rateLimited,
        now: () => NOW,
      }),
    ).rejects.toMatchObject({ code: "provider_rate_limited", retryAt: NOW + 60 });

    const secondaryRateLimited = mock(
      async () =>
        new Response(null, {
          status: 403,
          headers: { "retry-after": "90", "x-ratelimit-remaining": "42" },
        }),
    );
    await expect(
      collectGithubContributions(TOKEN, ACCOUNT, NOW, {
        fetch: secondaryRateLimited,
        now: () => NOW,
      }),
    ).rejects.toMatchObject({ code: "provider_rate_limited", retryAt: NOW + 90 });

    const truncated = mock(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      return url.searchParams.get("q")?.startsWith("author:")
        ? searchResponse(2, [searchItem()])
        : searchResponse(0, []);
    });
    await expect(
      collectGithubContributions(TOKEN, ACCOUNT, NOW, {
        fetch: truncated,
        now: () => NOW,
      }),
    ).rejects.toMatchObject({ code: "provider_unavailable" });
  });

  test("waits for in-flight provider reads before surfacing a failure", async () => {
    const slowRepositoryName = "ckb-devrel/slow-fixture";
    const slowRepositoryUrl = `https://api.github.com/repos/${slowRepositoryName}`;
    let releaseSlowResponse!: (response: Response) => void;
    const slowResponse = new Promise<Response>((resolve) => {
      releaseSlowResponse = resolve;
    });
    let slowStarted = false;
    let slowCompleted = false;
    const fetch = mock(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname === "/search/issues") {
        return url.searchParams.get("q")?.startsWith("author:")
          ? searchResponse(2, [searchItem(), { number: 1, repository_url: slowRepositoryUrl }])
          : searchResponse(0, []);
      }
      if (url.href === REPOSITORY_URL) return Response.json({});
      if (url.href === slowRepositoryUrl) {
        slowStarted = true;
        const response = await slowResponse;
        slowCompleted = true;
        return response;
      }
      throw new Error(`Unexpected GitHub request: ${url}`);
    });

    const collection = collectGithubContributions(TOKEN, ACCOUNT, NOW, {
      fetch,
      now: () => NOW,
    });
    let settled = false;
    void collection.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(slowStarted).toBe(true);
    expect(settled).toBe(false);
    releaseSlowResponse(
      Response.json({
        node_id: "R_untrusted_slow_fixture",
        full_name: slowRepositoryName,
        fork: false,
        url: slowRepositoryUrl,
      }),
    );
    await expect(collection).rejects.toMatchObject({ code: "provider_unavailable" });
    expect(slowCompleted).toBe(true);
  });

  test("waits for both contribution searches before surfacing a failure", async () => {
    let releaseReviewSearch!: (response: Response) => void;
    const reviewSearchResponse = new Promise<Response>((resolve) => {
      releaseReviewSearch = resolve;
    });
    let reviewSearchStarted = false;
    let reviewSearchCompleted = false;
    const fetch = mock(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      const query = url.searchParams.get("q") ?? "";
      if (query.startsWith("author:")) return Response.json({});
      if (query.startsWith("reviewed-by:")) {
        reviewSearchStarted = true;
        const response = await reviewSearchResponse;
        reviewSearchCompleted = true;
        return response;
      }
      throw new Error(`Unexpected GitHub request: ${url}`);
    });

    const collection = collectGithubContributions(TOKEN, ACCOUNT, NOW, {
      fetch,
      now: () => NOW,
    });
    let settled = false;
    void collection.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(reviewSearchStarted).toBe(true);
    expect(settled).toBe(false);
    releaseReviewSearch(searchResponse(0, []));
    await expect(collection).rejects.toMatchObject({ code: "provider_unavailable" });
    expect(reviewSearchCompleted).toBe(true);
  });

  test("drops the oldest artifacts until the canonical Claim data fits", async () => {
    const owner = `a${"a".repeat(38)}`;
    const repositoryName = `b${"b".repeat(99)}`;
    const fullName = `${owner}/${repositoryName}`;
    const repositoryUrl = `https://api.github.com/repos/${fullName}`;
    const items = Array.from({ length: 20 }, (_, index) => ({
      number: 500 + index,
      repository_url: repositoryUrl,
    }));
    const fetch = mock(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname === "/search/issues") {
        return url.searchParams.get("q")?.startsWith("author:")
          ? searchResponse(items.length, items)
          : searchResponse(0, []);
      }
      if (url.href === repositoryUrl) {
        return Response.json({
          node_id: REPOSITORY_ID,
          full_name: fullName,
          fork: false,
          url: repositoryUrl,
        });
      }
      const pullMatch = url.pathname.match(/\/pulls\/(\d+)$/);
      if (pullMatch) {
        const number = Number(pullMatch[1]);
        const id = `PR_${number}_${"x".repeat(116)}`.slice(0, 128);
        return Response.json({
          node_id: id,
          number,
          title: "T".repeat(256),
          html_url: `https://github.com/${fullName}/pull/${number}`,
          merged_at: new Date((NOW - (number - 499) * 100) * 1_000).toISOString(),
          merge_commit_sha: number.toString(16).padStart(40, "0"),
          changed_files: 1,
          user: { id: ACCOUNT.id },
          base: { repo: { node_id: REPOSITORY_ID } },
        });
      }
      if (/\/pulls\/\d+\/files$/.test(url.pathname)) {
        return Response.json([{ filename: "src/index.ts" }]);
      }
      throw new Error(`Unexpected GitHub request: ${url}`);
    });

    const result = await collectGithubContributions(TOKEN, ACCOUNT, NOW, {
      fetch,
      now: () => NOW,
    });
    if (!result) throw new Error("Expected bounded contribution evidence");
    const encoded = ClaimData.fromV1({
      issuerId: `0x${"00".repeat(20)}`,
      nonce: `0x${"00".repeat(32)}`,
      issuedAt: NOW,
      expiresAt: NOW + 30 * 86_400,
      payload: result,
    }).toBytes();

    expect(result.eligible_artifact_count).toBe(20);
    expect(result.artifacts.length).toBeLessThan(20);
    expect(ccc.bytesFrom(encoded).length).toBeLessThanOrEqual(16 * 1_024);
  });

  test("classifies code, build, workflow, and schema paths as technical", () => {
    expect(classifyGithubPath("docs/guide.md")).toBe("ecosystem");
    expect(classifyGithubPath("src/index.ts")).toBe("technical");
    expect(classifyGithubPath("contracts/claim.mol")).toBe("technical");
    expect(classifyGithubPath(".github/workflows/check.yml")).toBe("technical");
    expect(classifyGithubPath("Makefile")).toBe("technical");
    expect(classifyGithubPath("go.mod")).toBe("technical");
    expect(classifyGithubPath("android/build.gradle")).toBe("technical");
    expect(classifyGithubPath("CMakeLists.txt")).toBe("technical");
    expect(classifyGithubPath(".github/actions/setup/action.yml")).toBe("technical");
  });
});
