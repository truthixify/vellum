import { ccc } from "@ckb-ccc/core";
import {
  GITHUB_CONTRIBUTION_ARTIFACT_LIMIT,
  GITHUB_CONTRIBUTION_CLAIM_TTL_SECONDS,
  GITHUB_CONTRIBUTION_WINDOW_SECONDS,
  parseGithubContributionClaimPayload,
  type GithubContributionArtifact,
  type GithubContributionClaimPayload,
  type GithubContributionClassification,
} from "@vellum/schemas";
import { ClaimData } from "@vellum/sdk";

import { GithubOAuthError } from "./errors.js";
import {
  GITHUB_REPOSITORY_REGISTRY_VERSION,
  isTrustedGithubRepositoryId,
} from "./github-repositories.js";

const GITHUB_API_VERSION = "2026-03-10";
const GITHUB_API_ORIGIN = "https://api.github.com";
const PROVIDER_TIMEOUT_MS = 10_000;
const PAGE_SIZE = 100;
const SEARCH_RESULT_LIMIT = 1_000;
const FILE_LIMIT = 3_000;
const REVIEW_PAGE_LIMIT = 30;
const REPOSITORY_LIMIT = 200;
const CLAIM_DATA_LIMIT = 16 * 1_024;
const ZERO_ISSUER_ID = `0x${"00".repeat(20)}`;
const ZERO_NONCE = `0x${"00".repeat(32)}`;
const GITHUB_NODE_ID_PATTERN = /^[A-Za-z0-9_=-]{4,128}$/;

export type GithubContributionFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export type GithubContributionAccount = {
  id: number;
  login: string;
};

export type GithubContributionDependencies = {
  fetch: GithubContributionFetch;
  now: () => number;
};

type SearchCandidate = {
  number: number;
  repositoryUrl: string;
};

type Repository = {
  id: string;
  name: string;
  url: string;
};

type PullRequest = {
  authorId: number;
  changedFiles: number;
  id: string;
  mergeCommitSha: string;
  mergedAt: number;
  number: number;
  repository: Repository;
  title: string;
  url: string;
};

type Review = {
  id: string;
  submittedAt: number;
};

function providerUnavailable(
  message = "GitHub contribution evidence could not be read completely.",
): never {
  throw new GithubOAuthError("provider_unavailable", 502, message);
}

function timeoutSignal(): AbortSignal {
  return AbortSignal.timeout(PROVIDER_TIMEOUT_MS);
}

function retryTimestamp(response: Response, now: number): number | undefined {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter && /^\d+$/.test(retryAfter)) return now + Number(retryAfter);
  const reset = response.headers.get("x-ratelimit-reset");
  if (reset && /^\d+$/.test(reset) && Number(reset) > now) return Number(reset);
  return undefined;
}

async function githubFetch(
  url: string | URL,
  accessToken: string,
  dependencies: GithubContributionDependencies,
  allowNotFound = false,
): Promise<Response | undefined> {
  let response: Response;
  try {
    response = await dependencies.fetch(url, {
      method: "GET",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${accessToken}`,
        "user-agent": "Vellum GitHub verifier",
        "x-github-api-version": GITHUB_API_VERSION,
      },
      signal: timeoutSignal(),
    });
  } catch {
    providerUnavailable("GitHub did not respond while contribution evidence was checked.");
  }

  if (allowNotFound && response.status === 404) return undefined;
  if (
    response.status === 429 ||
    (response.status === 403 && response.headers.get("x-ratelimit-remaining") === "0")
  ) {
    throw new GithubOAuthError(
      "provider_rate_limited",
      429,
      "GitHub is rate limiting contribution checks. Try again after the reset time.",
      retryTimestamp(response, dependencies.now()),
    );
  }
  if (!response.ok) providerUnavailable();
  return response;
}

async function objectBody(response: Response): Promise<Record<string, unknown>> {
  try {
    const value: unknown = await response.json();
    if (typeof value !== "object" || value === null || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    providerUnavailable("GitHub returned malformed contribution evidence.");
  }
}

async function arrayBody(response: Response): Promise<unknown[]> {
  try {
    const value: unknown = await response.json();
    if (!Array.isArray(value)) throw new Error();
    return value;
  } catch {
    providerUnavailable("GitHub returned malformed contribution evidence.");
  }
}

function positiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

async function mapConcurrent<T, TResult>(
  values: readonly T[],
  concurrency: number,
  operation: (value: T) => Promise<TResult>,
): Promise<TResult[]> {
  const results = new Array<TResult>(values.length);
  let nextIndex = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (nextIndex < values.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await operation(values[index]);
      }
    }),
  );
  return results;
}

function unixTimestamp(value: unknown): number | undefined {
  if (typeof value !== "string") return undefined;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return undefined;
  const seconds = Math.floor(milliseconds / 1_000);
  return seconds > 0 && Number.isSafeInteger(seconds) ? seconds : undefined;
}

function apiRepositoryUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    const segments = url.pathname.split("/").filter(Boolean);
    if (
      url.origin !== GITHUB_API_ORIGIN ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      segments.length !== 3 ||
      segments[0] !== "repos"
    ) {
      return undefined;
    }
    return `${GITHUB_API_ORIGIN}/repos/${segments[1]}/${segments[2]}`;
  } catch {
    return undefined;
  }
}

function searchUrl(query: string, page: number): URL {
  const url = new URL("/search/issues", GITHUB_API_ORIGIN);
  url.searchParams.set("q", query);
  url.searchParams.set("sort", "updated");
  url.searchParams.set("order", "desc");
  url.searchParams.set("per_page", String(PAGE_SIZE));
  url.searchParams.set("page", String(page));
  return url;
}

async function searchPullRequests(
  query: string,
  accessToken: string,
  dependencies: GithubContributionDependencies,
): Promise<SearchCandidate[]> {
  const candidates = new Map<string, SearchCandidate>();
  let expectedTotal: number | undefined;

  for (let page = 1; page <= SEARCH_RESULT_LIMIT / PAGE_SIZE; page += 1) {
    const response = await githubFetch(searchUrl(query, page), accessToken, dependencies);
    const body = await objectBody(response!);
    if (
      !Number.isSafeInteger(body.total_count) ||
      typeof body.total_count !== "number" ||
      body.total_count < 0 ||
      typeof body.incomplete_results !== "boolean" ||
      !Array.isArray(body.items) ||
      body.items.length > PAGE_SIZE
    ) {
      providerUnavailable("GitHub returned malformed search results.");
    }
    if (body.incomplete_results || body.total_count > SEARCH_RESULT_LIMIT) {
      providerUnavailable("GitHub could not return a complete contribution history.");
    }
    if (expectedTotal !== undefined && expectedTotal !== body.total_count) {
      providerUnavailable("GitHub contribution search changed before it could be completed.");
    }
    expectedTotal = body.total_count;

    for (const itemValue of body.items) {
      if (typeof itemValue !== "object" || itemValue === null || Array.isArray(itemValue)) {
        providerUnavailable("GitHub returned malformed search results.");
      }
      const item = itemValue as Record<string, unknown>;
      const repositoryUrl = apiRepositoryUrl(item.repository_url);
      if (!positiveSafeInteger(item.number) || !repositoryUrl) {
        providerUnavailable("GitHub returned malformed search results.");
      }
      candidates.set(`${repositoryUrl}#${item.number}`, {
        number: item.number,
        repositoryUrl,
      });
    }

    if (body.items.length < PAGE_SIZE || candidates.size >= body.total_count) break;
    if (page === SEARCH_RESULT_LIMIT / PAGE_SIZE) {
      providerUnavailable("GitHub could not return a complete contribution history.");
    }
  }
  if (expectedTotal === undefined || candidates.size !== expectedTotal) {
    providerUnavailable("GitHub could not return a complete contribution history.");
  }
  return [...candidates.values()];
}

async function fetchRepository(
  url: string,
  accessToken: string,
  dependencies: GithubContributionDependencies,
): Promise<Repository | undefined> {
  const response = await githubFetch(url, accessToken, dependencies, true);
  if (!response) return undefined;
  const value = await objectBody(response);
  if (
    typeof value.node_id !== "string" ||
    !GITHUB_NODE_ID_PATTERN.test(value.node_id) ||
    typeof value.full_name !== "string" ||
    typeof value.fork !== "boolean" ||
    apiRepositoryUrl(value.url) !== url
  ) {
    providerUnavailable("GitHub returned malformed repository evidence.");
  }
  if (value.fork || !isTrustedGithubRepositoryId(value.node_id)) return undefined;
  return { id: value.node_id, name: value.full_name, url };
}

function normalizedTitle(value: string): string {
  const printable = [...value]
    .map((character) => {
      const code = character.codePointAt(0)!;
      return code <= 0x1f || code === 0x7f ? " " : character;
    })
    .join("");
  const title = printable.replace(/\s+/g, " ").trim();
  let normalized = "";
  for (const character of title) {
    if (normalized.length + character.length > 256) break;
    normalized += character;
  }
  return normalized;
}

async function fetchPullRequest(
  candidate: SearchCandidate,
  repository: Repository,
  accessToken: string,
  dependencies: GithubContributionDependencies,
): Promise<PullRequest | undefined> {
  const response = await githubFetch(
    `${repository.url}/pulls/${candidate.number}`,
    accessToken,
    dependencies,
    true,
  );
  if (!response) return undefined;
  const value = await objectBody(response);
  const mergedAt = unixTimestamp(value.merged_at);
  const author =
    typeof value.user === "object" && value.user !== null && !Array.isArray(value.user)
      ? (value.user as Record<string, unknown>)
      : undefined;
  const base =
    typeof value.base === "object" && value.base !== null && !Array.isArray(value.base)
      ? (value.base as Record<string, unknown>)
      : undefined;
  const baseRepository =
    base && typeof base.repo === "object" && base.repo !== null && !Array.isArray(base.repo)
      ? (base.repo as Record<string, unknown>)
      : undefined;
  const title = typeof value.title === "string" ? normalizedTitle(value.title) : "";
  const expectedUrl = `https://github.com/${repository.name}/pull/${candidate.number}`;
  if (
    typeof value.node_id !== "string" ||
    !GITHUB_NODE_ID_PATTERN.test(value.node_id) ||
    !positiveSafeInteger(value.number) ||
    value.number !== candidate.number ||
    !title ||
    value.html_url !== expectedUrl ||
    !mergedAt ||
    typeof value.merge_commit_sha !== "string" ||
    !/^[0-9a-f]{40}$/.test(value.merge_commit_sha) ||
    !positiveSafeInteger(value.changed_files) ||
    value.changed_files > FILE_LIMIT ||
    !author ||
    !positiveSafeInteger(author.id) ||
    !baseRepository ||
    baseRepository.node_id !== repository.id
  ) {
    providerUnavailable("GitHub returned malformed pull request evidence.");
  }
  return {
    authorId: author.id,
    changedFiles: value.changed_files,
    id: value.node_id,
    mergeCommitSha: value.merge_commit_sha,
    mergedAt,
    number: value.number,
    repository,
    title,
    url: expectedUrl,
  };
}

const TECHNICAL_EXTENSIONS = new Set([
  "bazel",
  "c",
  "cc",
  "cjs",
  "cpp",
  "css",
  "go",
  "gradle",
  "h",
  "hpp",
  "html",
  "java",
  "js",
  "json",
  "jsonc",
  "jsx",
  "kt",
  "lock",
  "mjs",
  "mod",
  "mol",
  "nix",
  "proto",
  "py",
  "rb",
  "rs",
  "scss",
  "sh",
  "sol",
  "sql",
  "sum",
  "svelte",
  "swift",
  "toml",
  "ts",
  "tsx",
  "vue",
  "wasm",
  "xml",
  "yaml",
  "yml",
]);

const TECHNICAL_FILENAMES = new Set([
  "build",
  "cmakelists.txt",
  "dockerfile",
  "gemfile",
  "gradlew",
  "justfile",
  "makefile",
  "rakefile",
  "requirements.txt",
  "workspace",
]);

export function classifyGithubPath(path: string): GithubContributionClassification {
  const name = path.split("/").at(-1)?.toLowerCase() ?? "";
  const extension = name.includes(".") ? name.split(".").at(-1)! : "";
  if (
    TECHNICAL_EXTENSIONS.has(extension) ||
    TECHNICAL_FILENAMES.has(name) ||
    path.startsWith(".github/actions/") ||
    path.startsWith(".github/workflows/")
  ) {
    return "technical";
  }
  return "ecosystem";
}

async function classifyPullRequest(
  pull: PullRequest,
  accessToken: string,
  dependencies: GithubContributionDependencies,
): Promise<GithubContributionClassification> {
  let received = 0;
  let classification: GithubContributionClassification = "ecosystem";
  const pages = Math.ceil(pull.changedFiles / PAGE_SIZE);
  for (let page = 1; page <= pages; page += 1) {
    const url = new URL(`${pull.repository.url}/pulls/${pull.number}/files`);
    url.searchParams.set("per_page", String(PAGE_SIZE));
    url.searchParams.set("page", String(page));
    const response = await githubFetch(url, accessToken, dependencies);
    const files = await arrayBody(response!);
    if (files.length < 1 || files.length > PAGE_SIZE) {
      providerUnavailable("GitHub returned an incomplete pull request file list.");
    }
    received += files.length;
    for (const fileValue of files) {
      if (typeof fileValue !== "object" || fileValue === null || Array.isArray(fileValue)) {
        providerUnavailable("GitHub returned malformed pull request file evidence.");
      }
      const filename = (fileValue as Record<string, unknown>).filename;
      if (typeof filename !== "string" || filename.length < 1 || filename.length > 4_096) {
        providerUnavailable("GitHub returned malformed pull request file evidence.");
      }
      if (classifyGithubPath(filename) === "technical") classification = "technical";
    }
  }
  if (received !== pull.changedFiles) {
    providerUnavailable("GitHub returned an incomplete pull request file list.");
  }
  return classification;
}

async function fetchQualifyingReview(
  pull: PullRequest,
  accountId: number,
  windowStartedAt: number,
  accessToken: string,
  dependencies: GithubContributionDependencies,
): Promise<Review | undefined> {
  const reviews: Review[] = [];
  for (let page = 1; page <= REVIEW_PAGE_LIMIT; page += 1) {
    const url = new URL(`${pull.repository.url}/pulls/${pull.number}/reviews`);
    url.searchParams.set("per_page", String(PAGE_SIZE));
    url.searchParams.set("page", String(page));
    const response = await githubFetch(url, accessToken, dependencies);
    const values = await arrayBody(response!);
    for (const reviewValue of values) {
      if (typeof reviewValue !== "object" || reviewValue === null || Array.isArray(reviewValue)) {
        providerUnavailable("GitHub returned malformed pull request review evidence.");
      }
      const review = reviewValue as Record<string, unknown>;
      const user =
        typeof review.user === "object" && review.user !== null && !Array.isArray(review.user)
          ? (review.user as Record<string, unknown>)
          : undefined;
      if (
        typeof review.node_id !== "string" ||
        !GITHUB_NODE_ID_PATTERN.test(review.node_id) ||
        typeof review.state !== "string" ||
        !user ||
        !positiveSafeInteger(user.id)
      ) {
        providerUnavailable("GitHub returned malformed pull request review evidence.");
      }
      if (
        user.id === accountId &&
        ["APPROVED", "CHANGES_REQUESTED"].includes(review.state.toUpperCase())
      ) {
        const submittedAt = unixTimestamp(review.submitted_at);
        if (!submittedAt) {
          providerUnavailable("GitHub returned malformed pull request review evidence.");
        }
        if (submittedAt >= windowStartedAt && submittedAt <= pull.mergedAt) {
          reviews.push({ id: review.node_id, submittedAt });
        }
      }
    }
    if (values.length < PAGE_SIZE) break;
    if (page === REVIEW_PAGE_LIMIT) {
      providerUnavailable("GitHub could not return a complete pull request review history.");
    }
  }
  return reviews.sort(
    (left, right) =>
      right.submittedAt - left.submittedAt ||
      (left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
  )[0];
}

function artifactFromPull(
  pull: PullRequest,
  classification: GithubContributionClassification,
): GithubContributionArtifact {
  return {
    artifact_id: pull.id,
    changed_files: pull.changedFiles,
    classification,
    kind: "merged_pull_request",
    merge_commit_sha: pull.mergeCommitSha,
    merged_at: pull.mergedAt,
    number: pull.number,
    occurred_at: pull.mergedAt,
    pull_request_id: pull.id,
    repository: pull.repository.name,
    repository_id: pull.repository.id,
    title: pull.title,
    url: pull.url,
  };
}

function artifactFromReview(
  pull: PullRequest,
  review: Review,
  classification: GithubContributionClassification,
): GithubContributionArtifact {
  return {
    artifact_id: review.id,
    changed_files: pull.changedFiles,
    classification,
    kind: "pull_request_review",
    merge_commit_sha: pull.mergeCommitSha,
    merged_at: pull.mergedAt,
    number: pull.number,
    occurred_at: review.submittedAt,
    pull_request_id: pull.id,
    repository: pull.repository.name,
    repository_id: pull.repository.id,
    title: pull.title,
    url: pull.url,
  };
}

function compareArtifacts(
  left: GithubContributionArtifact,
  right: GithubContributionArtifact,
): number {
  return (
    right.occurred_at - left.occurred_at ||
    (left.artifact_id < right.artifact_id ? -1 : left.artifact_id > right.artifact_id ? 1 : 0)
  );
}

function fitsClaimData(payload: GithubContributionClaimPayload): boolean {
  const encoded = ClaimData.fromV1({
    issuerId: ZERO_ISSUER_ID,
    nonce: ZERO_NONCE,
    issuedAt: payload.verified_at,
    expiresAt: payload.verified_at + GITHUB_CONTRIBUTION_CLAIM_TTL_SECONDS,
    payload,
  }).toBytes();
  return ccc.bytesFrom(encoded).length <= CLAIM_DATA_LIMIT;
}

export async function collectGithubContributions(
  accessToken: string,
  account: GithubContributionAccount,
  verifiedAt: number,
  dependencies: GithubContributionDependencies,
): Promise<GithubContributionClaimPayload | undefined> {
  const windowStartedAt = verifiedAt - GITHUB_CONTRIBUTION_WINDOW_SECONDS;
  if (windowStartedAt <= 0) providerUnavailable("The GitHub contribution window is invalid.");
  const since = new Date(windowStartedAt * 1_000).toISOString().slice(0, 10);
  const [authored, reviewed] = await Promise.all([
    searchPullRequests(
      `author:${account.login} is:pr is:merged merged:>=${since}`,
      accessToken,
      dependencies,
    ),
    searchPullRequests(
      `reviewed-by:${account.login} is:pr is:merged merged:>=${since}`,
      accessToken,
      dependencies,
    ),
  ]);

  const authoredKeys = new Set(authored.map((item) => `${item.repositoryUrl}#${item.number}`));
  const reviewedKeys = new Set(reviewed.map((item) => `${item.repositoryUrl}#${item.number}`));
  const candidates = new Map<
    string,
    { candidate: SearchCandidate; authored: boolean; reviewed: boolean }
  >();
  for (const candidate of [...authored, ...reviewed]) {
    const key = `${candidate.repositoryUrl}#${candidate.number}`;
    const entry = candidates.get(key) ?? { candidate, authored: false, reviewed: false };
    if (authoredKeys.has(key)) entry.authored = true;
    if (reviewedKeys.has(key)) entry.reviewed = true;
    candidates.set(key, entry);
  }

  const repositoryUrls = [
    ...new Set([...candidates.values()].map(({ candidate }) => candidate.repositoryUrl)),
  ];
  if (repositoryUrls.length > REPOSITORY_LIMIT) {
    providerUnavailable(
      "GitHub contribution history spans too many repositories to verify safely.",
    );
  }
  const repositories = new Map<string, Repository>();
  await mapConcurrent(repositoryUrls, 8, async (url) => {
    const repository = await fetchRepository(url, accessToken, dependencies);
    if (repository) repositories.set(url, repository);
  });

  const collected = await mapConcurrent(
    [...candidates.values()],
    4,
    async ({ candidate, authored: wasAuthored, reviewed: wasReviewed }) => {
      const repository = repositories.get(candidate.repositoryUrl);
      if (!repository) return undefined;
      const pull = await fetchPullRequest(candidate, repository, accessToken, dependencies);
      if (!pull || pull.mergedAt < windowStartedAt || pull.mergedAt > verifiedAt) return undefined;
      const classification = await classifyPullRequest(pull, accessToken, dependencies);

      if (wasAuthored && pull.authorId === account.id) {
        return artifactFromPull(pull, classification);
      }
      if (wasReviewed && pull.authorId !== account.id) {
        const review = await fetchQualifyingReview(
          pull,
          account.id,
          windowStartedAt,
          accessToken,
          dependencies,
        );
        if (review) return artifactFromReview(pull, review, classification);
      }
      return undefined;
    },
  );

  const artifacts = collected.filter(
    (artifact): artifact is GithubContributionArtifact => artifact !== undefined,
  );
  artifacts.sort(compareArtifacts);
  if (artifacts.length === 0) return undefined;
  const selected = artifacts.slice(0, GITHUB_CONTRIBUTION_ARTIFACT_LIMIT);
  while (selected.length > 0) {
    let payload: GithubContributionClaimPayload;
    try {
      payload = parseGithubContributionClaimPayload({
        user_id: account.id,
        login: account.login,
        verified_at: verifiedAt,
        window_started_at: windowStartedAt,
        repository_registry: GITHUB_REPOSITORY_REGISTRY_VERSION,
        eligible_artifact_count: artifacts.length,
        artifacts: selected,
      });
    } catch {
      providerUnavailable("GitHub returned contribution data that cannot be verified.");
    }
    if (fitsClaimData(payload)) return payload;
    selected.pop();
  }
  providerUnavailable("GitHub contribution evidence exceeds the supported claim size.");
}
