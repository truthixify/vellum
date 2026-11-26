export const KWEELA_LEVEL_ACHIEVED_CLAIM_SCHEMA_ID = "kweela.level-achieved.v1" as const;

export const kweelaLevelAchievedClaimSchemaManifest = {
  encoding: "dag-cbor",
  name: KWEELA_LEVEL_ACHIEVED_CLAIM_SCHEMA_ID,
  payload: {
    additionalProperties: false,
    constraints: [
      "account_id and level identify one non-repeatable Kweela level achievement",
      "level is a historical non-decreasing achievement under level_policy_version",
      "profile_slug identifies the public Kweela profile at issuance",
    ],
    properties: {
      account_id: {
        maxLength: 36,
        minLength: 36,
        pattern: "^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
        type: "string",
      },
      level: {
        maximum: 4_294_967_295,
        minimum: 1,
        type: "integer",
      },
      level_policy_version: {
        maxLength: 64,
        minLength: 1,
        pattern: "^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$",
        type: "string",
      },
      profile_slug: {
        maxLength: 64,
        minLength: 1,
        pattern: "^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$",
        type: "string",
      },
    },
    required: ["account_id", "profile_slug", "level", "level_policy_version"],
    type: "object",
  },
  version: 1,
} as const;

export const KWEELA_LEVEL_ACHIEVED_CLAIM_SCHEMA_HASH =
  "0xdf3a7297412342a7650b183a24c90f413ddb4e524e7911928c990d55380f9456" as const;

export type KweelaLevelAchievedClaimPayload = {
  account_id: string;
  profile_slug: string;
  level: number;
  level_policy_version: string;
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const TOKEN_PATTERN = /^[a-z0-9](?:[a-z0-9._-]{0,62}[a-z0-9])?$/;
const UINT32_MAX = 4_294_967_295;
const PAYLOAD_KEYS = ["account_id", "level", "level_policy_version", "profile_slug"] as const;

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function isToken(value: unknown): value is string {
  return typeof value === "string" && value.length <= 64 && TOKEN_PATTERN.test(value);
}

export function parseKweelaLevelAchievedClaimPayload(
  value: unknown,
): KweelaLevelAchievedClaimPayload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Kweela level achievement claim payload must be an object");
  }
  const payload = value as Record<string, unknown>;
  if (
    !hasExactKeys(payload, PAYLOAD_KEYS) ||
    typeof payload.account_id !== "string" ||
    !UUID_PATTERN.test(payload.account_id) ||
    !isToken(payload.profile_slug) ||
    typeof payload.level !== "number" ||
    !Number.isSafeInteger(payload.level) ||
    payload.level < 1 ||
    payload.level > UINT32_MAX ||
    !isToken(payload.level_policy_version)
  ) {
    throw new TypeError(
      "Kweela level achievement claim payload does not match kweela.level-achieved.v1",
    );
  }
  return payload as KweelaLevelAchievedClaimPayload;
}
