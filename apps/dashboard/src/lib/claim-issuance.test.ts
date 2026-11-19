import { describe, expect, test } from "bun:test";
import { ccc } from "@ckb-ccc/core";
import {
  githubIdentitySchema,
  telegramIdentitySchema,
  vellumSchemaRegistry,
} from "@vellum/schemas";
import { VELLUM_REPUTATION_POLICY_V7 } from "@vellum/scoring";

import {
  canIssueRegisteredSchema,
  createEmptyClaimDraft,
  createExampleClaimDraft,
  formatCanonicalPayload,
  parseCustomClaimPayload,
  parseExpiry,
  parseRegisteredClaimDraft,
  registeredSchemaIdsForIssuer,
  schemaPayloadDefinition,
  signAndBroadcastPreparedClaim,
  subjectDidFromQr,
} from "./claim-issuance";

const DID = "did:ckb:4kiidiczwthgxj7dltzkzopgbwu3v6jc";

describe("claim issuance forms", () => {
  test("limits registered schemas to their configured issuer DIDs", () => {
    const ckboostIssuer = VELLUM_REPUTATION_POLICY_V7.ckboost.issuerDids[0];
    const vellumIssuer = VELLUM_REPUTATION_POLICY_V7.github.issuerDids[0];

    expect(registeredSchemaIdsForIssuer(ckboostIssuer)).toEqual(["ckboost.quest.v1"]);
    expect(registeredSchemaIdsForIssuer(vellumIssuer)).toEqual([
      "vellum.social.github.v1",
      "vellum.contribution.github.v1",
      "vellum.social.discord.v1",
      "vellum.community.discord.v1",
      "vellum.social.telegram.v1",
      "vellum.community.telegram.v1",
      "vellum.social.bluesky.v1",
    ]);
    expect(registeredSchemaIdsForIssuer("did:ckb:untrusted")).toEqual([]);
    expect(canIssueRegisteredSchema(ckboostIssuer, "ckboost.quest.v1")).toBeTrue();
    expect(canIssueRegisteredSchema(ckboostIssuer, "vellum.social.github.v1")).toBeFalse();
    expect(canIssueRegisteredSchema(vellumIssuer, "crowdcell.campaign-funded.v1")).toBeFalse();
  });

  test("coerces every registered example through its exact parser", () => {
    for (const definition of Object.values(vellumSchemaRegistry)) {
      const schema = schemaPayloadDefinition(definition);
      const draft = createExampleClaimDraft(schema, definition.example);
      expect(parseRegisteredClaimDraft(definition, draft)).toEqual({
        ok: true,
        payload: definition.example,
      });
    }
  });

  test("reports field errors before schema-level validation", () => {
    const result = parseRegisteredClaimDraft(
      githubIdentitySchema,
      createEmptyClaimDraft(schemaPayloadDefinition(githubIdentitySchema)),
    );

    expect(result.ok).toBeFalse();
    if (result.ok) return;
    expect(result.errors.login).toBe("login is required.");
    expect(result.errors.user_id).toBe("user id is required.");
    expect(result.errors.verified_at).toBe("verified at is required.");
  });

  test("omits blank optional fields while preserving published constraints", () => {
    const draft = createExampleClaimDraft(
      schemaPayloadDefinition(telegramIdentitySchema),
      telegramIdentitySchema.example,
    ) as Record<string, string>;
    draft.username = "";
    draft.profile_url = "";

    const result = parseRegisteredClaimDraft(telegramIdentitySchema, draft);
    expect(result).toEqual({
      ok: true,
      payload: {
        display_name: telegramIdentitySchema.example.display_name,
        user_id: telegramIdentitySchema.example.user_id,
        verified_at: telegramIdentitySchema.example.verified_at,
      },
    });
  });

  test("keeps the canonical preview stable across object key order", () => {
    expect(formatCanonicalPayload({ z: 1, nested: { b: 2, a: 1 }, a: 0 })).toBe(
      '{\n  "a": 0,\n  "nested": {\n    "a": 1,\n    "b": 2\n  },\n  "z": 1\n}',
    );
  });

  test("accepts an explicit custom hash and JSON payload", () => {
    const hash = `0x${"11".repeat(32)}` as `0x${string}`;
    expect(parseCustomClaimPayload(hash, '{"proof":true}')).toEqual({
      ok: true,
      schemaHash: hash,
      payload: { proof: true },
    });
    expect(parseCustomClaimPayload("0x11", "{}")).toEqual({
      ok: false,
      error: "Schema hash must be 32 lowercase hex bytes prefixed with 0x.",
    });
    expect(parseCustomClaimPayload(hash, "{").ok).toBeFalse();
    expect(parseCustomClaimPayload(hash, "1e309")).toEqual({
      ok: false,
      error: "Payload is not valid JSON: Numbers must be finite",
    });
  });

  test("reads a DID directly or from a public profile QR value", () => {
    expect(subjectDidFromQr(DID)).toBe(DID);
    expect(subjectDidFromQr(`https://usevellum.xyz/profile/${encodeURIComponent(DID)}`)).toBe(DID);
    expect(
      subjectDidFromQr(`https://dashboard.usevellum.xyz/reputation?did=${encodeURIComponent(DID)}`),
    ).toBe(DID);
    expect(() => subjectDidFromQr("https://example.com/not-a-did")).toThrow(
      "The QR code does not contain a valid did:ckb identity.",
    );
  });

  test("requires expiry to be after issuance", () => {
    expect(parseExpiry("", 1_800_000_000)).toBeUndefined();
    expect(() => parseExpiry("2026-01-01T00:00", 1_800_000_000)).toThrow(
      "Expiry must be a valid date and time after issuance.",
    );
  });

  test("broadcasts only the exact transaction reviewed by the issuer", async () => {
    const preparedHash = `0x${"11".repeat(32)}` as ccc.Hex;
    const transactionHash = `0x${"22".repeat(32)}` as ccc.Hex;
    const reviewed = { hash: () => preparedHash } as ccc.Transaction;
    const signed = { hash: () => preparedHash } as ccc.Transaction;
    let submitted: ccc.Transaction | undefined;
    const signer = {
      client: {
        sendTransaction: async (transaction: ccc.Transaction) => {
          submitted = transaction;
          return transactionHash;
        },
      },
      signOnlyTransaction: async (transaction: ccc.Transaction) => {
        expect(transaction).toBe(reviewed);
        return signed;
      },
    } as unknown as ccc.Signer;

    await expect(signAndBroadcastPreparedClaim(signer, reviewed)).resolves.toBe(transactionHash);
    expect(submitted).toBe(signed);
  });

  test("rejects a wallet that changes the reviewed transaction", async () => {
    const reviewed = { hash: () => `0x${"11".repeat(32)}` } as ccc.Transaction;
    const changed = { hash: () => `0x${"22".repeat(32)}` } as ccc.Transaction;
    let submitted = false;
    const signer = {
      client: {
        sendTransaction: async () => {
          submitted = true;
          return `0x${"33".repeat(32)}`;
        },
      },
      signOnlyTransaction: async () => changed,
    } as unknown as ccc.Signer;

    await expect(signAndBroadcastPreparedClaim(signer, reviewed)).rejects.toThrow(
      "The wallet changed the reviewed transaction before signing.",
    );
    expect(submitted).toBeFalse();
  });
});
