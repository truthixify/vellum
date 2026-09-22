export const TELEGRAM_CLAIM_SCHEMA_ID = "vellum.social.telegram.v1" as const;

export const telegramClaimSchemaManifest = {
  encoding: "dag-cbor",
  name: TELEGRAM_CLAIM_SCHEMA_ID,
  payload: {
    additionalProperties: false,
    constraints: [
      "username and profile_url are either both present or both absent",
      "profile_url == 'https://t.me/' + username when username is present",
    ],
    properties: {
      display_name: {
        maxLength: 128,
        minLength: 1,
        pattern: "^[^\\u0000-\\u001f\\u007f]{1,128}$",
        type: "string",
      },
      profile_url: {
        maxLength: 64,
        pattern: "^https://t\\.me/[A-Za-z0-9_]{1,32}$",
        template: "https://t.me/{username}",
        type: "string",
      },
      user_id: {
        maxLength: 20,
        minLength: 1,
        pattern: "^[1-9][0-9]{0,19}$",
        type: "string",
      },
      username: {
        maxLength: 32,
        minLength: 1,
        pattern: "^[A-Za-z0-9_]{1,32}$",
        type: "string",
      },
      verified_at: {
        format: "unix-time-seconds",
        maximum: Number.MAX_SAFE_INTEGER,
        minimum: 1,
        type: "integer",
      },
    },
    required: ["display_name", "user_id", "verified_at"],
    type: "object",
  },
  version: 1,
} as const;

export const TELEGRAM_CLAIM_SCHEMA_HASH =
  "0xe8b7f0ba94a55a5676ab205d9e1a997e1953d1e5cb6b89fd295ad5d69356467f" as const;

export type TelegramClaimPayload = {
  user_id: string;
  display_name: string;
  username?: string;
  profile_url?: string;
  verified_at: number;
};

const USER_ID_PATTERN = /^[1-9][0-9]{0,19}$/;
const USERNAME_PATTERN = /^[A-Za-z0-9_]{1,32}$/;
const REQUIRED_KEYS = ["display_name", "user_id", "verified_at"] as const;
const PUBLIC_PROFILE_KEYS = ["display_name", "profile_url", "user_id", "username", "verified_at"];

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === "number" && value > 0;
}

function isDisplayName(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 128 &&
    value.trim() === value &&
    [...value].every((character) => {
      const code = character.codePointAt(0)!;
      return code > 0x1f && code !== 0x7f;
    })
  );
}

export function parseTelegramClaimPayload(value: unknown): TelegramClaimPayload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Telegram claim payload must be an object");
  }

  const payload = value as Record<string, unknown>;
  const keys = Object.keys(payload).sort();
  const hasPublicProfile = payload.username !== undefined || payload.profile_url !== undefined;
  const expectedKeys = hasPublicProfile ? PUBLIC_PROFILE_KEYS : REQUIRED_KEYS;
  if (
    keys.length !== expectedKeys.length ||
    keys.some((key, index) => key !== expectedKeys[index]) ||
    typeof payload.user_id !== "string" ||
    !USER_ID_PATTERN.test(payload.user_id) ||
    !isDisplayName(payload.display_name) ||
    !isPositiveSafeInteger(payload.verified_at)
  ) {
    throw new TypeError("Telegram claim payload does not match vellum.social.telegram.v1");
  }

  if (
    hasPublicProfile &&
    (typeof payload.username !== "string" ||
      !USERNAME_PATTERN.test(payload.username) ||
      payload.profile_url !== `https://t.me/${payload.username}`)
  ) {
    throw new TypeError("Telegram claim payload does not match vellum.social.telegram.v1");
  }

  return payload as TelegramClaimPayload;
}
