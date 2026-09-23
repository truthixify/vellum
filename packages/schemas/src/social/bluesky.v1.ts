export const BLUESKY_CLAIM_SCHEMA_ID = "vellum.social.bluesky.v1" as const;

export const blueskyClaimSchemaManifest = {
  encoding: "dag-cbor",
  name: BLUESKY_CLAIM_SCHEMA_ID,
  payload: {
    additionalProperties: false,
    constraints: [
      "handle is normalized to lowercase",
      "profile_url == 'https://bsky.app/profile/' + did",
    ],
    properties: {
      did: {
        maxLength: 2_048,
        minLength: 13,
        pattern: "^did:(?:plc:[a-z2-7]{24}|web:[A-Za-z0-9._:%-]+)$",
        type: "string",
      },
      handle: {
        maxLength: 253,
        minLength: 3,
        pattern: "^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$",
        type: "string",
      },
      profile_url: {
        maxLength: 2_080,
        pattern: "^https://bsky\\.app/profile/did:(?:plc:[a-z2-7]{24}|web:[A-Za-z0-9._:%-]+)$",
        template: "https://bsky.app/profile/{did}",
        type: "string",
      },
      verified_at: {
        format: "unix-time-seconds",
        maximum: Number.MAX_SAFE_INTEGER,
        minimum: 1,
        type: "integer",
      },
    },
    required: ["did", "handle", "profile_url", "verified_at"],
    type: "object",
  },
  version: 1,
} as const;

export const BLUESKY_CLAIM_SCHEMA_HASH =
  "0x60bfe9263501d3d17513463b9a3163793690dcf2b614ecc17d7dd52688a083f6" as const;

export type BlueskyClaimPayload = {
  did: string;
  handle: string;
  profile_url: string;
  verified_at: number;
};

export const BLUESKY_HANDLE_PATTERN =
  /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]([a-z0-9-]{0,61}[a-z0-9])?$/;

export const AT_PROTOCOL_DID_PATTERN = /^did:(?:plc:[a-z2-7]{24}|web:[A-Za-z0-9._:%-]+)$/;

const PAYLOAD_KEYS = ["did", "handle", "profile_url", "verified_at"] as const;

function isPositiveSafeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && typeof value === "number" && value > 0;
}

export function parseBlueskyClaimPayload(value: unknown): BlueskyClaimPayload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Bluesky claim payload must be an object");
  }

  const payload = value as Record<string, unknown>;
  const keys = Object.keys(payload).sort();
  if (
    keys.length !== PAYLOAD_KEYS.length ||
    keys.some((key, index) => key !== PAYLOAD_KEYS[index]) ||
    typeof payload.did !== "string" ||
    payload.did.length < 13 ||
    payload.did.length > 2_048 ||
    !AT_PROTOCOL_DID_PATTERN.test(payload.did) ||
    typeof payload.handle !== "string" ||
    payload.handle.length > 253 ||
    !BLUESKY_HANDLE_PATTERN.test(payload.handle) ||
    typeof payload.profile_url !== "string" ||
    payload.profile_url !== `https://bsky.app/profile/${payload.did}` ||
    !isPositiveSafeInteger(payload.verified_at)
  ) {
    throw new TypeError("Bluesky claim payload does not match vellum.social.bluesky.v1");
  }

  return payload as BlueskyClaimPayload;
}
