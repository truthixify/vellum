import { discordSnowflakeTimestamp } from "../social/discord.v1.js";

export const DISCORD_COMMUNITY_CLAIM_SCHEMA_ID = "vellum.community.discord.v1" as const;

export const discordCommunityClaimSchemaManifest = {
  encoding: "dag-cbor",
  name: DISCORD_COMMUNITY_CLAIM_SCHEMA_ID,
  payload: {
    additionalProperties: false,
    constraints: [
      "memberships sorted by guild_id with no duplicates",
      "recognized_roles sorted by role_id with no duplicates",
      "discord_snowflake_time(user_id) <= joined_at",
      "joined_at <= verified_at",
    ],
    properties: {
      memberships: {
        items: {
          additionalProperties: false,
          properties: {
            community_name: { maxLength: 100, minLength: 1, type: "string" },
            guild_id: {
              maxLength: 20,
              minLength: 17,
              pattern: "^[1-9][0-9]{16,19}$",
              type: "string",
            },
            joined_at: {
              format: "unix-time-seconds",
              maximum: Number.MAX_SAFE_INTEGER,
              minimum: 1,
              type: "integer",
            },
            recognized_roles: {
              items: {
                additionalProperties: false,
                properties: {
                  role_id: {
                    maxLength: 20,
                    minLength: 17,
                    pattern: "^[1-9][0-9]{16,19}$",
                    type: "string",
                  },
                  role_name: { maxLength: 100, minLength: 1, type: "string" },
                },
                required: ["role_id", "role_name"],
                type: "object",
              },
              maxItems: 32,
              type: "array",
            },
          },
          required: ["guild_id", "community_name", "joined_at", "recognized_roles"],
          type: "object",
        },
        maxItems: 16,
        minItems: 1,
        type: "array",
      },
      user_id: {
        maxLength: 20,
        minLength: 17,
        pattern: "^[1-9][0-9]{16,19}$",
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

export const DISCORD_COMMUNITY_CLAIM_SCHEMA_HASH =
  "0x3cba5b1c2967fee27bbde52d5e609137aa0d2cccaf68e1d8722e9b943e78f550" as const;

export type DiscordRecognizedRole = {
  role_id: string;
  role_name: string;
};

export type DiscordCommunityMembership = {
  guild_id: string;
  community_name: string;
  joined_at: number;
  recognized_roles: DiscordRecognizedRole[];
};

export type DiscordCommunityClaimPayload = {
  user_id: string;
  verified_at: number;
  memberships: DiscordCommunityMembership[];
};

const SNOWFLAKE_PATTERN = /^[1-9][0-9]{16,19}$/;
const PAYLOAD_KEYS = ["memberships", "user_id", "verified_at"] as const;
const MEMBERSHIP_KEYS = ["community_name", "guild_id", "joined_at", "recognized_roles"] as const;
const ROLE_KEYS = ["role_id", "role_name"] as const;

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === "number" && value > 0;
}

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
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

function compareSnowflakes(left: string, right: string): number {
  const leftValue = BigInt(left);
  const rightValue = BigInt(right);
  return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
}

function parseRole(value: unknown): DiscordRecognizedRole {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Discord community role must be an object");
  }
  const role = value as Record<string, unknown>;
  if (
    !hasExactKeys(role, ROLE_KEYS) ||
    typeof role.role_id !== "string" ||
    !SNOWFLAKE_PATTERN.test(role.role_id) ||
    !isLabel(role.role_name)
  ) {
    throw new TypeError("Discord community role is invalid");
  }
  return role as DiscordRecognizedRole;
}

function parseMembership(
  value: unknown,
  accountCreatedAt: number,
  verifiedAt: number,
): DiscordCommunityMembership {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Discord community membership must be an object");
  }
  const membership = value as Record<string, unknown>;
  if (
    !hasExactKeys(membership, MEMBERSHIP_KEYS) ||
    typeof membership.guild_id !== "string" ||
    !SNOWFLAKE_PATTERN.test(membership.guild_id) ||
    !isLabel(membership.community_name) ||
    !isPositiveSafeInteger(membership.joined_at) ||
    membership.joined_at < accountCreatedAt ||
    membership.joined_at > verifiedAt ||
    !Array.isArray(membership.recognized_roles) ||
    membership.recognized_roles.length > 32
  ) {
    throw new TypeError("Discord community membership is invalid");
  }

  const roles = membership.recognized_roles.map(parseRole);
  if (
    roles.some(
      (role, index) => index > 0 && compareSnowflakes(roles[index - 1].role_id, role.role_id) >= 0,
    )
  ) {
    throw new TypeError("Discord community roles must be unique and sorted");
  }
  return membership as DiscordCommunityMembership;
}

export function parseDiscordCommunityClaimPayload(value: unknown): DiscordCommunityClaimPayload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Discord community claim payload must be an object");
  }

  const payload = value as Record<string, unknown>;
  if (
    !hasExactKeys(payload, PAYLOAD_KEYS) ||
    typeof payload.user_id !== "string" ||
    !SNOWFLAKE_PATTERN.test(payload.user_id) ||
    !isPositiveSafeInteger(payload.verified_at) ||
    !Array.isArray(payload.memberships) ||
    payload.memberships.length < 1 ||
    payload.memberships.length > 16
  ) {
    throw new TypeError(
      "Discord community claim payload does not match vellum.community.discord.v1",
    );
  }

  const accountCreatedAt = discordSnowflakeTimestamp(payload.user_id);
  const memberships = payload.memberships.map((membership) =>
    parseMembership(membership, accountCreatedAt, payload.verified_at as number),
  );
  if (
    memberships.some(
      (membership, index) =>
        index > 0 && compareSnowflakes(memberships[index - 1].guild_id, membership.guild_id) >= 0,
    )
  ) {
    throw new TypeError("Discord community memberships must be unique and sorted");
  }
  return payload as DiscordCommunityClaimPayload;
}
