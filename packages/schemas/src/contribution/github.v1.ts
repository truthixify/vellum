export const GITHUB_CONTRIBUTION_CLAIM_SCHEMA_ID = "vellum.contribution.github.v1" as const;

export const GITHUB_CONTRIBUTION_WINDOW_SECONDS = 365 * 86_400;
export const GITHUB_CONTRIBUTION_CLAIM_TTL_SECONDS = 30 * 86_400;
export const GITHUB_CONTRIBUTION_ARTIFACT_LIMIT = 20;

export const githubContributionClaimSchemaManifest = {
  encoding: "dag-cbor",
  name: GITHUB_CONTRIBUTION_CLAIM_SCHEMA_ID,
  payload: {
    additionalProperties: false,
    constraints: [
      "window_started_at == verified_at - 31536000",
      "artifacts sorted by occurred_at descending, then artifact_id ascending",
      "artifact_id and pull_request_id are unique",
      "window_started_at <= artifact.occurred_at <= artifact.merged_at <= verified_at",
      "merged_pull_request uses artifact_id == pull_request_id and occurred_at == merged_at",
      "pull_request_review uses artifact_id != pull_request_id",
      "artifact url == 'https://github.com/' + repository + '/pull/' + number",
      "eligible_artifact_count >= artifacts.length",
    ],
    properties: {
      artifacts: {
        items: {
          additionalProperties: false,
          properties: {
            artifact_id: { maxLength: 128, minLength: 4, type: "string" },
            changed_files: {
              maximum: 3000,
              minimum: 1,
              type: "integer",
            },
            classification: { enum: ["ecosystem", "technical"] },
            kind: { enum: ["merged_pull_request", "pull_request_review"] },
            merge_commit_sha: {
              maxLength: 40,
              minLength: 40,
              pattern: "^[0-9a-f]{40}$",
              type: "string",
            },
            merged_at: {
              format: "unix-time-seconds",
              maximum: Number.MAX_SAFE_INTEGER,
              minimum: 1,
              type: "integer",
            },
            number: {
              maximum: Number.MAX_SAFE_INTEGER,
              minimum: 1,
              type: "integer",
            },
            occurred_at: {
              format: "unix-time-seconds",
              maximum: Number.MAX_SAFE_INTEGER,
              minimum: 1,
              type: "integer",
            },
            pull_request_id: { maxLength: 128, minLength: 4, type: "string" },
            repository: { maxLength: 140, minLength: 3, type: "string" },
            repository_id: { maxLength: 128, minLength: 4, type: "string" },
            title: { maxLength: 256, minLength: 1, type: "string" },
            url: { format: "uri", maxLength: 300, type: "string" },
          },
          required: [
            "artifact_id",
            "changed_files",
            "classification",
            "kind",
            "merge_commit_sha",
            "merged_at",
            "number",
            "occurred_at",
            "pull_request_id",
            "repository",
            "repository_id",
            "title",
            "url",
          ],
          type: "object",
        },
        maxItems: GITHUB_CONTRIBUTION_ARTIFACT_LIMIT,
        minItems: 1,
        type: "array",
      },
      eligible_artifact_count: {
        maximum: Number.MAX_SAFE_INTEGER,
        minimum: 1,
        type: "integer",
      },
      login: {
        maxLength: 100,
        minLength: 1,
        pattern: "^[A-Za-z0-9](?:[A-Za-z0-9-]{0,98}[A-Za-z0-9])?$",
        type: "string",
      },
      repository_registry: { const: "ckb.public-contributions.v1" },
      user_id: {
        maximum: Number.MAX_SAFE_INTEGER,
        minimum: 1,
        type: "integer",
      },
      verified_at: {
        format: "unix-time-seconds",
        maximum: Number.MAX_SAFE_INTEGER,
        minimum: 1,
        type: "integer",
      },
      window_started_at: {
        format: "unix-time-seconds",
        maximum: Number.MAX_SAFE_INTEGER,
        minimum: 1,
        type: "integer",
      },
    },
    required: [
      "user_id",
      "login",
      "verified_at",
      "window_started_at",
      "repository_registry",
      "eligible_artifact_count",
      "artifacts",
    ],
    type: "object",
  },
  version: 1,
} as const;

export const GITHUB_CONTRIBUTION_CLAIM_SCHEMA_HASH =
  "0xa08a1f034af0f1ebc75a6847dde6a90ee0c3dde63f3ffe4eaed248ea9e7730a1" as const;

export type GithubContributionArtifactKind = "merged_pull_request" | "pull_request_review";
export type GithubContributionClassification = "ecosystem" | "technical";

export type GithubContributionArtifact = {
  artifact_id: string;
  changed_files: number;
  classification: GithubContributionClassification;
  kind: GithubContributionArtifactKind;
  merge_commit_sha: string;
  merged_at: number;
  number: number;
  occurred_at: number;
  pull_request_id: string;
  repository: string;
  repository_id: string;
  title: string;
  url: string;
};

export type GithubContributionClaimPayload = {
  user_id: number;
  login: string;
  verified_at: number;
  window_started_at: number;
  repository_registry: "ckb.public-contributions.v1";
  eligible_artifact_count: number;
  artifacts: GithubContributionArtifact[];
};

const NODE_ID_PATTERN = /^[A-Za-z0-9_=-]{4,128}$/;
const LOGIN_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,98}[A-Za-z0-9])?$/;
const REPOSITORY_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38}[A-Za-z0-9])?\/[A-Za-z0-9_.-]{1,100}$/;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const PAYLOAD_KEYS = [
  "artifacts",
  "eligible_artifact_count",
  "login",
  "repository_registry",
  "user_id",
  "verified_at",
  "window_started_at",
] as const;
const ARTIFACT_KEYS = [
  "artifact_id",
  "changed_files",
  "classification",
  "kind",
  "merge_commit_sha",
  "merged_at",
  "number",
  "occurred_at",
  "pull_request_id",
  "repository",
  "repository_id",
  "title",
  "url",
] as const;

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isDisplayText(value: unknown, maximum: number): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= maximum &&
    value.trim() === value &&
    [...value].every((character) => {
      const code = character.codePointAt(0)!;
      return code > 0x1f && code !== 0x7f;
    })
  );
}

function parseArtifact(
  value: unknown,
  windowStartedAt: number,
  verifiedAt: number,
): GithubContributionArtifact {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("GitHub contribution artifact must be an object");
  }
  const artifact = value as Record<string, unknown>;
  if (
    !hasExactKeys(artifact, ARTIFACT_KEYS) ||
    typeof artifact.artifact_id !== "string" ||
    !NODE_ID_PATTERN.test(artifact.artifact_id) ||
    !isPositiveSafeInteger(artifact.changed_files) ||
    artifact.changed_files > 3_000 ||
    (artifact.classification !== "ecosystem" && artifact.classification !== "technical") ||
    (artifact.kind !== "merged_pull_request" && artifact.kind !== "pull_request_review") ||
    typeof artifact.merge_commit_sha !== "string" ||
    !COMMIT_PATTERN.test(artifact.merge_commit_sha) ||
    !isPositiveSafeInteger(artifact.merged_at) ||
    !isPositiveSafeInteger(artifact.number) ||
    !isPositiveSafeInteger(artifact.occurred_at) ||
    typeof artifact.pull_request_id !== "string" ||
    !NODE_ID_PATTERN.test(artifact.pull_request_id) ||
    typeof artifact.repository !== "string" ||
    !REPOSITORY_PATTERN.test(artifact.repository) ||
    typeof artifact.repository_id !== "string" ||
    !NODE_ID_PATTERN.test(artifact.repository_id) ||
    !isDisplayText(artifact.title, 256) ||
    typeof artifact.url !== "string" ||
    artifact.url !== `https://github.com/${artifact.repository}/pull/${artifact.number}` ||
    artifact.occurred_at < windowStartedAt ||
    artifact.occurred_at > artifact.merged_at ||
    artifact.merged_at > verifiedAt ||
    (artifact.kind === "merged_pull_request" &&
      (artifact.artifact_id !== artifact.pull_request_id ||
        artifact.occurred_at !== artifact.merged_at)) ||
    (artifact.kind === "pull_request_review" && artifact.artifact_id === artifact.pull_request_id)
  ) {
    throw new TypeError("GitHub contribution artifact is invalid");
  }
  return artifact as GithubContributionArtifact;
}

function compareArtifacts(
  left: GithubContributionArtifact,
  right: GithubContributionArtifact,
): number {
  if (left.occurred_at !== right.occurred_at) return right.occurred_at - left.occurred_at;
  return left.artifact_id < right.artifact_id ? -1 : left.artifact_id > right.artifact_id ? 1 : 0;
}

export function parseGithubContributionClaimPayload(
  value: unknown,
): GithubContributionClaimPayload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("GitHub contribution claim payload must be an object");
  }
  const payload = value as Record<string, unknown>;
  if (
    !hasExactKeys(payload, PAYLOAD_KEYS) ||
    !isPositiveSafeInteger(payload.user_id) ||
    typeof payload.login !== "string" ||
    !LOGIN_PATTERN.test(payload.login) ||
    !isPositiveSafeInteger(payload.verified_at) ||
    !isPositiveSafeInteger(payload.window_started_at) ||
    payload.window_started_at !== payload.verified_at - GITHUB_CONTRIBUTION_WINDOW_SECONDS ||
    payload.repository_registry !== "ckb.public-contributions.v1" ||
    !isPositiveSafeInteger(payload.eligible_artifact_count) ||
    !Array.isArray(payload.artifacts) ||
    payload.artifacts.length < 1 ||
    payload.artifacts.length > GITHUB_CONTRIBUTION_ARTIFACT_LIMIT ||
    payload.eligible_artifact_count < payload.artifacts.length
  ) {
    throw new TypeError(
      "GitHub contribution claim payload does not match vellum.contribution.github.v1",
    );
  }

  const artifacts = payload.artifacts.map((artifact) =>
    parseArtifact(artifact, payload.window_started_at as number, payload.verified_at as number),
  );
  if (
    artifacts.some(
      (artifact, index) => index > 0 && compareArtifacts(artifacts[index - 1], artifact) >= 0,
    ) ||
    new Set(artifacts.map((artifact) => artifact.artifact_id)).size !== artifacts.length ||
    new Set(artifacts.map((artifact) => artifact.pull_request_id)).size !== artifacts.length
  ) {
    throw new TypeError("GitHub contribution artifacts must be unique and sorted");
  }

  return payload as GithubContributionClaimPayload;
}
