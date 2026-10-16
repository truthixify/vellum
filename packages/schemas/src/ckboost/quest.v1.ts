export const CKBOOST_QUEST_CLAIM_SCHEMA_ID = "ckboost.quest.v1" as const;

export const ckboostQuestClaimSchemaManifest = {
  encoding: "dag-cbor",
  name: CKBOOST_QUEST_CLAIM_SCHEMA_ID,
  payload: {
    additionalProperties: false,
    constraints: [
      "campaign_type_id, quest_id, and ckboost_user_type_id identify one non-repeatable completion",
      "approval_tx_hash and reward_claim_tx_hash identify distinct confirmed CKB transactions",
      "points_awarded is a canonical unsigned Uint128 decimal string",
    ],
    properties: {
      approval_tx_hash: {
        maxLength: 66,
        minLength: 66,
        pattern: "^0x[0-9a-f]{64}$",
        type: "string",
      },
      campaign_title: { maxLength: 160, minLength: 1, type: "string" },
      campaign_type_id: {
        maxLength: 66,
        minLength: 66,
        pattern: "^0x[0-9a-f]{64}$",
        type: "string",
      },
      ckboost_user_type_id: {
        maxLength: 66,
        minLength: 66,
        pattern: "^0x[0-9a-f]{64}$",
        type: "string",
      },
      completed_at: {
        format: "unix-time-seconds",
        maximum: Number.MAX_SAFE_INTEGER,
        minimum: 1,
        type: "integer",
      },
      points_awarded: {
        maxLength: 39,
        minLength: 1,
        pattern: "^(0|[1-9][0-9]{0,38})$",
        type: "string",
      },
      quest_id: {
        maximum: 4_294_967_295,
        minimum: 0,
        type: "integer",
      },
      quest_title: { maxLength: 160, minLength: 1, type: "string" },
      reward_claim_tx_hash: {
        maxLength: 66,
        minLength: 66,
        pattern: "^0x[0-9a-f]{64}$",
        type: "string",
      },
    },
    required: [
      "campaign_type_id",
      "campaign_title",
      "quest_id",
      "quest_title",
      "ckboost_user_type_id",
      "completed_at",
      "approval_tx_hash",
      "reward_claim_tx_hash",
      "points_awarded",
    ],
    type: "object",
  },
  version: 1,
} as const;

export const CKBOOST_QUEST_CLAIM_SCHEMA_HASH =
  "0x6f0fe424320c73627ac544d6666841623c2b15b88ffc93818dc9f78752dd8fae" as const;

export type CkboostQuestClaimPayload = {
  campaign_type_id: string;
  campaign_title: string;
  quest_id: number;
  quest_title: string;
  ckboost_user_type_id: string;
  completed_at: number;
  approval_tx_hash: string;
  reward_claim_tx_hash: string;
  points_awarded: string;
};

const HEX32_PATTERN = /^0x[0-9a-f]{64}$/;
const UINT128_PATTERN = /^(0|[1-9][0-9]{0,38})$/;
const UINT128_MAX = 340_282_366_920_938_463_463_374_607_431_768_211_455n;
const UINT32_MAX = 4_294_967_295;
const PAYLOAD_KEYS = [
  "approval_tx_hash",
  "campaign_title",
  "campaign_type_id",
  "ckboost_user_type_id",
  "completed_at",
  "points_awarded",
  "quest_id",
  "quest_title",
  "reward_claim_tx_hash",
] as const;

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function isDisplayText(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length >= 1 &&
    value.length <= 160 &&
    value.trim() === value &&
    [...value].every((character) => {
      const code = character.codePointAt(0)!;
      return code > 0x1f && code !== 0x7f;
    })
  );
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isUint32(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= UINT32_MAX;
}

function isUint128Decimal(value: unknown): value is string {
  return typeof value === "string" && UINT128_PATTERN.test(value) && BigInt(value) <= UINT128_MAX;
}

export function parseCkboostQuestClaimPayload(value: unknown): CkboostQuestClaimPayload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("CKBoost quest claim payload must be an object");
  }
  const payload = value as Record<string, unknown>;
  if (
    !hasExactKeys(payload, PAYLOAD_KEYS) ||
    typeof payload.campaign_type_id !== "string" ||
    !HEX32_PATTERN.test(payload.campaign_type_id) ||
    !isDisplayText(payload.campaign_title) ||
    !isUint32(payload.quest_id) ||
    !isDisplayText(payload.quest_title) ||
    typeof payload.ckboost_user_type_id !== "string" ||
    !HEX32_PATTERN.test(payload.ckboost_user_type_id) ||
    !isPositiveSafeInteger(payload.completed_at) ||
    typeof payload.approval_tx_hash !== "string" ||
    !HEX32_PATTERN.test(payload.approval_tx_hash) ||
    typeof payload.reward_claim_tx_hash !== "string" ||
    !HEX32_PATTERN.test(payload.reward_claim_tx_hash) ||
    payload.approval_tx_hash === payload.reward_claim_tx_hash ||
    !isUint128Decimal(payload.points_awarded)
  ) {
    throw new TypeError("CKBoost quest claim payload does not match ckboost.quest.v1");
  }
  return payload as CkboostQuestClaimPayload;
}
