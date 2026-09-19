export const GITHUB_CLAIM_SCHEMA_ID = "vellum.social.github.v1" as const;

export const githubClaimSchemaManifest = {
  encoding: "dag-cbor",
  name: GITHUB_CLAIM_SCHEMA_ID,
  payload: {
    additionalProperties: false,
    constraints: [
      "profile_url == 'https://github.com/' + login",
      "account_created_at <= verified_at",
    ],
    properties: {
      account_created_at: {
        format: "unix-time-seconds",
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
      profile_url: {
        maxLength: 256,
        pattern: "^https://github\\.com/[A-Za-z0-9-]+$",
        template: "https://github.com/{login}",
        type: "string",
      },
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
    },
    required: ["user_id", "login", "profile_url", "account_created_at", "verified_at"],
    type: "object",
  },
  version: 1,
} as const;

export const GITHUB_CLAIM_SCHEMA_HASH =
  "0x25980dec7f198c7b228a621c61b911b8a20c55b340f398e495c4be65aa399f3c" as const;

export type GithubClaimPayload = {
  user_id: number;
  login: string;
  profile_url: string;
  account_created_at: number;
  verified_at: number;
};

const LOGIN_PATTERN = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,98}[A-Za-z0-9])?$/;
const PAYLOAD_KEYS = [
  "account_created_at",
  "login",
  "profile_url",
  "user_id",
  "verified_at",
] as const;

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === "number" && value > 0;
}

export function parseGithubClaimPayload(value: unknown): GithubClaimPayload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("GitHub claim payload must be an object");
  }

  const payload = value as Record<string, unknown>;
  const keys = Object.keys(payload).sort();
  if (
    keys.length !== PAYLOAD_KEYS.length ||
    keys.some((key, index) => key !== PAYLOAD_KEYS[index])
  ) {
    throw new TypeError("GitHub claim payload contains unexpected fields");
  }
  if (
    !isPositiveSafeInteger(payload.user_id) ||
    typeof payload.login !== "string" ||
    !LOGIN_PATTERN.test(payload.login) ||
    typeof payload.profile_url !== "string" ||
    payload.profile_url !== `https://github.com/${payload.login}` ||
    !isPositiveSafeInteger(payload.account_created_at) ||
    !isPositiveSafeInteger(payload.verified_at) ||
    payload.account_created_at > payload.verified_at
  ) {
    throw new TypeError("GitHub claim payload does not match vellum.social.github.v1");
  }

  return payload as GithubClaimPayload;
}
