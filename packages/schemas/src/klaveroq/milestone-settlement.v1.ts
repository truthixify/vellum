export const KLAVEROQ_MILESTONE_SETTLEMENT_CLAIM_SCHEMA_ID =
  "klaveroq.milestone-settlement.v1" as const;

export const klaveroqMilestoneSettlementClaimSchemaManifest = {
  encoding: "dag-cbor",
  name: KLAVEROQ_MILESTONE_SETTLEMENT_CLAIM_SCHEMA_ID,
  payload: {
    additionalProperties: false,
    constraints: [
      "engagement_id, milestone_id, and delivery_id are domain-separated CKB hashes of private Klaveroq identifiers",
      "engagement_id and milestone_id identify one non-repeatable settled milestone",
      "settlement_tx_hash identifies a confirmed CKB settlement transaction",
    ],
    properties: {
      approval_method: {
        enum: ["client", "review_timeout"],
        type: "string",
      },
      delivery_id: {
        maxLength: 66,
        minLength: 66,
        pattern: "^0x[0-9a-f]{64}$",
        type: "string",
      },
      engagement_id: {
        maxLength: 66,
        minLength: 66,
        pattern: "^0x[0-9a-f]{64}$",
        type: "string",
      },
      milestone_id: {
        maxLength: 66,
        minLength: 66,
        pattern: "^0x[0-9a-f]{64}$",
        type: "string",
      },
      milestone_sequence: {
        maximum: 4_294_967_295,
        minimum: 1,
        type: "integer",
      },
      settled_at: {
        format: "unix-time-seconds",
        maximum: Number.MAX_SAFE_INTEGER,
        minimum: 1,
        type: "integer",
      },
      settlement_tx_hash: {
        maxLength: 66,
        minLength: 66,
        pattern: "^0x[0-9a-f]{64}$",
        type: "string",
      },
    },
    required: [
      "engagement_id",
      "milestone_id",
      "delivery_id",
      "milestone_sequence",
      "approval_method",
      "settled_at",
      "settlement_tx_hash",
    ],
    type: "object",
  },
  version: 1,
} as const;

export const KLAVEROQ_MILESTONE_SETTLEMENT_CLAIM_SCHEMA_HASH =
  "0x899820258835146d1de40525b120f67b24bd0e390bb0d3aba258460d524c8473" as const;

export type KlaveroqMilestoneSettlementApprovalMethod = "client" | "review_timeout";

export type KlaveroqMilestoneSettlementClaimPayload = {
  engagement_id: string;
  milestone_id: string;
  delivery_id: string;
  milestone_sequence: number;
  approval_method: KlaveroqMilestoneSettlementApprovalMethod;
  settled_at: number;
  settlement_tx_hash: string;
};

const HEX32_PATTERN = /^0x[0-9a-f]{64}$/;
const UINT32_MAX = 4_294_967_295;
const PAYLOAD_KEYS = [
  "approval_method",
  "delivery_id",
  "engagement_id",
  "milestone_id",
  "milestone_sequence",
  "settled_at",
  "settlement_tx_hash",
] as const;

function hasExactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const keys = Object.keys(value).sort();
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export function parseKlaveroqMilestoneSettlementClaimPayload(
  value: unknown,
): KlaveroqMilestoneSettlementClaimPayload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Klaveroq milestone settlement claim payload must be an object");
  }
  const payload = value as Record<string, unknown>;
  if (
    !hasExactKeys(payload, PAYLOAD_KEYS) ||
    typeof payload.engagement_id !== "string" ||
    !HEX32_PATTERN.test(payload.engagement_id) ||
    typeof payload.milestone_id !== "string" ||
    !HEX32_PATTERN.test(payload.milestone_id) ||
    typeof payload.delivery_id !== "string" ||
    !HEX32_PATTERN.test(payload.delivery_id) ||
    !isPositiveSafeInteger(payload.milestone_sequence) ||
    payload.milestone_sequence > UINT32_MAX ||
    (payload.approval_method !== "client" && payload.approval_method !== "review_timeout") ||
    !isPositiveSafeInteger(payload.settled_at) ||
    typeof payload.settlement_tx_hash !== "string" ||
    !HEX32_PATTERN.test(payload.settlement_tx_hash)
  ) {
    throw new TypeError(
      "Klaveroq milestone settlement claim payload does not match klaveroq.milestone-settlement.v1",
    );
  }
  return payload as KlaveroqMilestoneSettlementClaimPayload;
}
