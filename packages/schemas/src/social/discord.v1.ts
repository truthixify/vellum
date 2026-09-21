export const DISCORD_CLAIM_SCHEMA_ID = "vellum.social.discord.v1" as const;

export const discordClaimSchemaManifest = {
  encoding: "dag-cbor",
  name: DISCORD_CLAIM_SCHEMA_ID,
  payload: {
    additionalProperties: false,
    constraints: [
      "profile_url == 'https://discord.com/users/' + user_id",
      "account_created_at == discord_snowflake_time(user_id)",
      "account_created_at <= verified_at",
    ],
    properties: {
      account_created_at: {
        format: "unix-time-seconds",
        maximum: Number.MAX_SAFE_INTEGER,
        minimum: 1,
        type: "integer",
      },
      profile_url: {
        maxLength: 256,
        pattern: "^https://discord\\.com/users/[1-9][0-9]{16,19}$",
        template: "https://discord.com/users/{user_id}",
        type: "string",
      },
      user_id: {
        maxLength: 20,
        minLength: 17,
        pattern: "^[1-9][0-9]{16,19}$",
        type: "string",
      },
      username: {
        maxLength: 32,
        minLength: 1,
        pattern: "^[^\\u0000-\\u0020\\u007f]{1,32}$",
        type: "string",
      },
      verified_at: {
        format: "unix-time-seconds",
        maximum: Number.MAX_SAFE_INTEGER,
        minimum: 1,
        type: "integer",
      },
    },
    required: ["user_id", "username", "profile_url", "account_created_at", "verified_at"],
    type: "object",
  },
  version: 1,
} as const;

export const DISCORD_CLAIM_SCHEMA_HASH =
  "0x1d0169167b6c34b7818ba6932974679f8fd5284e4d5d79319da12f7d79df8b69" as const;

export type DiscordClaimPayload = {
  user_id: string;
  username: string;
  profile_url: string;
  account_created_at: number;
  verified_at: number;
};

const DISCORD_EPOCH_MS = 1_420_070_400_000n;
const SNOWFLAKE_PATTERN = /^[1-9][0-9]{16,19}$/;
const PAYLOAD_KEYS = [
  "account_created_at",
  "profile_url",
  "user_id",
  "username",
  "verified_at",
] as const;

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === "number" && value > 0;
}

function isDiscordUsername(value: string): boolean {
  return (
    value.length >= 1 &&
    value.length <= 32 &&
    [...value].every((character) => {
      const code = character.codePointAt(0)!;
      return code > 0x20 && code !== 0x7f;
    })
  );
}

export function discordSnowflakeTimestamp(userId: string): number {
  if (!SNOWFLAKE_PATTERN.test(userId)) {
    throw new TypeError("Discord user ID must be a canonical snowflake");
  }
  const timestamp = Number(((BigInt(userId) >> 22n) + DISCORD_EPOCH_MS) / 1_000n);
  if (!isPositiveSafeInteger(timestamp)) {
    throw new TypeError("Discord user ID contains an invalid timestamp");
  }
  return timestamp;
}

export function parseDiscordClaimPayload(value: unknown): DiscordClaimPayload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Discord claim payload must be an object");
  }

  const payload = value as Record<string, unknown>;
  const keys = Object.keys(payload).sort();
  if (
    keys.length !== PAYLOAD_KEYS.length ||
    keys.some((key, index) => key !== PAYLOAD_KEYS[index])
  ) {
    throw new TypeError("Discord claim payload contains unexpected fields");
  }
  if (
    typeof payload.user_id !== "string" ||
    !SNOWFLAKE_PATTERN.test(payload.user_id) ||
    typeof payload.username !== "string" ||
    !isDiscordUsername(payload.username) ||
    typeof payload.profile_url !== "string" ||
    payload.profile_url !== `https://discord.com/users/${payload.user_id}` ||
    !isPositiveSafeInteger(payload.account_created_at) ||
    payload.account_created_at !== discordSnowflakeTimestamp(payload.user_id) ||
    !isPositiveSafeInteger(payload.verified_at) ||
    payload.account_created_at > payload.verified_at
  ) {
    throw new TypeError("Discord claim payload does not match vellum.social.discord.v1");
  }

  return payload as DiscordClaimPayload;
}
