import { ccc } from "@ckb-ccc/core";
import { didToArgs } from "@ckb-ccc/did-ckb";
import { z } from "zod";

export const VERIFICATION_API_VERSION = "1" as const;

export const VERIFICATION_PLATFORMS = ["github", "discord", "telegram", "bluesky"] as const;

export type VerificationPlatform = (typeof VERIFICATION_PLATFORMS)[number];

export type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject;
export type JsonObject = { [key: string]: JsonValue };

const HEX_32_PATTERN = /^0x[0-9a-f]{64}$/;
const HEX_BYTES_PATTERN = /^0x(?:[0-9a-f]{2})*$/;

function isJsonValue(root: unknown): root is JsonValue {
  const pending = [root];
  const seen = new Set<object>();

  while (pending.length > 0) {
    const value = pending.pop();
    if (
      value === null ||
      typeof value === "string" ||
      typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value))
    ) {
      continue;
    }
    if (typeof value !== "object" || seen.has(value)) {
      return false;
    }

    seen.add(value);
    if (Array.isArray(value)) {
      pending.push(...value);
      continue;
    }
    if (Object.getPrototypeOf(value) !== Object.prototype) {
      return false;
    }
    pending.push(...Object.values(value));
  }

  return true;
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value) && isJsonValue(value);
}

const jsonObjectSchema = z.custom<JsonObject>(isJsonObject, {
  message: "Expected a JSON object",
});

export const didCkbSchema = z.string().superRefine((value, context) => {
  try {
    const args = didToArgs(value);
    if (!value.startsWith("did:ckb:") || ccc.bytesFrom(args).length !== 20) {
      throw new Error("Invalid did:ckb identifier");
    }
  } catch {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Expected a did:ckb identifier" });
  }
});

export const ckbScriptSchema = z
  .object({
    codeHash: z.string().regex(HEX_32_PATTERN),
    hashType: z.enum(["data", "type", "data1", "data2"]),
    args: z.string().regex(HEX_BYTES_PATTERN).max(65_536),
  })
  .strict();

export const verificationSubjectSchema = z.union([
  z.object({ did: didCkbSchema }).strict(),
  z.object({ lock: ckbScriptSchema }).strict(),
]);

export const didVerificationSubjectSchema = z.object({ did: didCkbSchema }).strict();

export const oauthChallengeRequestSchema = z
  .object({
    version: z.literal(VERIFICATION_API_VERSION),
    subject: didVerificationSubjectSchema,
  })
  .strict();

export const walletSignatureSchema = z
  .object({
    signature: z.string().min(1).max(16_384),
    identity: z.string().min(1).max(16_384),
    signType: z.enum([
      "BtcEcdsa",
      "EvmPersonal",
      "JoyId",
      "NostrEvent",
      "CkbSecp256k1",
      "DogeEcdsa",
    ]),
  })
  .strict();

export const subjectProofSchema = z
  .object({
    challenge: z.string().min(1).max(4_096),
    signature: walletSignatureSchema,
  })
  .strict();

export const oauthStartRequestSchema = oauthChallengeRequestSchema.extend({
  proof: subjectProofSchema,
});

export const githubOAuthStartRequestSchema = oauthStartRequestSchema;

export const verificationRequestSchema = z
  .object({
    version: z.literal(VERIFICATION_API_VERSION),
    platform: z.enum(VERIFICATION_PLATFORMS),
    subject: verificationSubjectSchema,
    proof: jsonObjectSchema,
  })
  .strict();

const unixTimestampSchema = z
  .number()
  .int()
  .positive()
  .max(Number.MAX_SAFE_INTEGER, "Timestamp must be a safe integer");

export const verifiedClaimSchema = z
  .object({
    schema: z
      .object({
        id: z.string().min(1).max(128),
        hash: z.string().regex(HEX_32_PATTERN),
      })
      .strict(),
    payload: jsonObjectSchema,
    issuedAt: unixTimestampSchema,
    expiresAt: unixTimestampSchema.optional(),
  })
  .strict()
  .superRefine((claim, context) => {
    if (claim.expiresAt !== undefined && claim.expiresAt <= claim.issuedAt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["expiresAt"],
        message: "Expiry must be later than issuance",
      });
    }
  });

export const claimIssuanceResultSchema = z
  .object({
    status: z.literal("submitted"),
    network: z.literal("ckb_testnet"),
    payer: z.literal("issuer"),
    transactionHash: z.string().regex(HEX_32_PATTERN),
    claimId: z.string().regex(HEX_32_PATTERN),
    outputIndex: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  })
  .strict();

export type CkbScript = z.infer<typeof ckbScriptSchema>;
export type VerificationSubject = z.infer<typeof verificationSubjectSchema>;
export type DidVerificationSubject = z.infer<typeof didVerificationSubjectSchema>;
export type OAuthStartRequest = z.infer<typeof oauthStartRequestSchema>;
export type OAuthChallengeRequest = z.infer<typeof oauthChallengeRequestSchema>;
export type SubjectProof = z.infer<typeof subjectProofSchema>;
export type GithubOAuthStartRequest = z.infer<typeof githubOAuthStartRequestSchema>;
export type VerificationRequest = z.infer<typeof verificationRequestSchema>;
export type VerifiedClaim = z.infer<typeof verifiedClaimSchema>;

export type ClaimIssuanceResult = z.infer<typeof claimIssuanceResultSchema>;

export type VerificationSuccess = {
  ok: true;
  version: typeof VERIFICATION_API_VERSION;
  platform: VerificationPlatform;
  subject: VerificationSubject;
  claim: VerifiedClaim;
  issuance: ClaimIssuanceResult;
};

export type VerificationErrorCode =
  | "invalid_request"
  | "method_not_allowed"
  | "unsupported_platform"
  | "not_implemented"
  | "oauth_configuration_error"
  | "oauth_denied"
  | "oauth_state_invalid"
  | "subject_control_invalid"
  | "verification_rate_limited"
  | "provider_rate_limited"
  | "provider_unavailable"
  | "credential_revocation_failed"
  | "verification_failed"
  | "issuer_unavailable"
  | "issuance_failed";

export type VerificationError = {
  ok: false;
  version: typeof VERIFICATION_API_VERSION;
  error: {
    code: VerificationErrorCode;
    message: string;
  };
};

export type VerificationResponse = VerificationSuccess | VerificationError;

export function isVerificationPlatform(value: string): value is VerificationPlatform {
  return VERIFICATION_PLATFORMS.some((platform) => platform === value);
}
