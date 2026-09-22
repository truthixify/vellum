export const TELEGRAM_COMMUNITY_CLAIM_SCHEMA_ID = "vellum.community.telegram.v1" as const;
export const TELEGRAM_COMMUNITY_CLAIM_TTL_SECONDS = 30 * 86_400;

export const telegramCommunityClaimSchemaManifest = {
  encoding: "dag-cbor",
  name: TELEGRAM_COMMUNITY_CLAIM_SCHEMA_ID,
  payload: {
    additionalProperties: false,
    constraints: ["memberships sorted by chat_id with no duplicates"],
    properties: {
      memberships: {
        items: {
          additionalProperties: false,
          properties: {
            chat_id: {
              maxLength: 21,
              minLength: 2,
              pattern: "^-[1-9][0-9]{0,19}$",
              type: "string",
            },
            community_name: { maxLength: 100, minLength: 1, type: "string" },
            community_type: {
              enum: ["channel", "group", "supergroup"],
              type: "string",
            },
            member_role: {
              enum: ["administrator", "member", "owner"],
              type: "string",
            },
          },
          required: ["chat_id", "community_name", "community_type", "member_role"],
          type: "object",
        },
        maxItems: 16,
        minItems: 1,
        type: "array",
      },
      user_id: {
        maxLength: 20,
        minLength: 1,
        pattern: "^[1-9][0-9]{0,19}$",
        type: "string",
      },
      verified_at: {
        format: "unix-time-seconds",
        maximum: Number.MAX_SAFE_INTEGER,
        minimum: 1,
        type: "integer",
      },
    },
    required: ["user_id", "verified_at", "memberships"],
    type: "object",
  },
  version: 1,
} as const;

export const TELEGRAM_COMMUNITY_CLAIM_SCHEMA_HASH =
  "0x8f8b0b59997ff96fde030314498c56008cb743006ae53b368339382640f8bd59" as const;

export type TelegramCommunityType = "channel" | "group" | "supergroup";
export type TelegramMemberRole = "administrator" | "member" | "owner";

export type TelegramCommunityMembership = {
  chat_id: string;
  community_name: string;
  community_type: TelegramCommunityType;
  member_role: TelegramMemberRole;
};

export type TelegramCommunityClaimPayload = {
  user_id: string;
  verified_at: number;
  memberships: TelegramCommunityMembership[];
};

const USER_ID_PATTERN = /^[1-9][0-9]{0,19}$/;
const CHAT_ID_PATTERN = /^-[1-9][0-9]{0,19}$/;
const PAYLOAD_KEYS = ["memberships", "user_id", "verified_at"] as const;
const MEMBERSHIP_KEYS = ["chat_id", "community_name", "community_type", "member_role"] as const;
const COMMUNITY_TYPES = new Set<TelegramCommunityType>(["channel", "group", "supergroup"]);
const MEMBER_ROLES = new Set<TelegramMemberRole>(["administrator", "member", "owner"]);

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isLabel(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 100 &&
    value.trim() === value &&
    [...value].every((character) => {
      const code = character.codePointAt(0)!;
      return code > 0x1f && code !== 0x7f;
    })
  );
}

function parseMembership(value: unknown): TelegramCommunityMembership {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Telegram community membership must be an object");
  }
  const membership = value as Record<string, unknown>;
  if (
    !hasExactKeys(membership, MEMBERSHIP_KEYS) ||
    typeof membership.chat_id !== "string" ||
    !CHAT_ID_PATTERN.test(membership.chat_id) ||
    !isLabel(membership.community_name) ||
    !COMMUNITY_TYPES.has(membership.community_type as TelegramCommunityType) ||
    !MEMBER_ROLES.has(membership.member_role as TelegramMemberRole)
  ) {
    throw new TypeError("Telegram community membership is invalid");
  }
  return membership as TelegramCommunityMembership;
}

export function parseTelegramCommunityClaimPayload(value: unknown): TelegramCommunityClaimPayload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Telegram community claim payload must be an object");
  }
  const payload = value as Record<string, unknown>;
  if (
    !hasExactKeys(payload, PAYLOAD_KEYS) ||
    typeof payload.user_id !== "string" ||
    !USER_ID_PATTERN.test(payload.user_id) ||
    !isPositiveSafeInteger(payload.verified_at) ||
    !Array.isArray(payload.memberships) ||
    payload.memberships.length < 1 ||
    payload.memberships.length > 16
  ) {
    throw new TypeError(
      "Telegram community claim payload does not match vellum.community.telegram.v1",
    );
  }

  const memberships = payload.memberships.map(parseMembership);
  if (
    memberships.some(
      (membership, index) =>
        index > 0 && BigInt(memberships[index - 1].chat_id) >= BigInt(membership.chat_id),
    )
  ) {
    throw new TypeError("Telegram community memberships must be unique and sorted");
  }
  return payload as TelegramCommunityClaimPayload;
}
