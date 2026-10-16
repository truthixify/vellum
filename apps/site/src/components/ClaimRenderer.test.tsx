import { describe, expect, test } from "bun:test";
import type { Claim } from "@usevellum/sdk";
import {
  blueskyIdentitySchema,
  ckboostQuestSchema,
  discordCommunitySchema,
  discordIdentitySchema,
  githubContributionSchema,
  githubIdentitySchema,
  telegramCommunitySchema,
  telegramIdentitySchema,
  vellumSchemaRegistry,
} from "@vellum/schemas";
import { CKBOOST_VERIFIED_PARTNER, parseReputationApiBody, scoreReputation } from "@vellum/scoring";
import { renderToStaticMarkup } from "react-dom/server";

import { ClaimPayloadRenderer } from "./ClaimRenderer";

function claim(schemaHash: string, payload: unknown): Claim {
  return { schemaHash, payload } as unknown as Claim;
}

function ckboostSampleClaim(): Claim {
  const issuedAt = ckboostQuestSchema.example.completed_at + 1;
  return {
    version: "v1",
    claimId: `0x${"55".repeat(32)}`,
    issuerDid: CKBOOST_VERIFIED_PARTNER.issuerDid,
    issuerState: { status: "active" },
    schemaHash: ckboostQuestSchema.hash,
    issuedAt: BigInt(issuedAt),
    payload: ckboostQuestSchema.example,
    cell: {
      outPoint: { txHash: `0x${"66".repeat(32)}`, index: 0n },
    },
    duplicateCells: [],
    verification: {
      inclusion: "live",
      issuerAuthorization: "accepted-by-configured-claim-type",
      time: { status: "active", evaluatedAt: BigInt(issuedAt) },
    },
  } as unknown as Claim;
}

describe("public Claim Cell renderers", () => {
  test("renders every published schema through its exact hash registration", () => {
    const examples = [
      [ckboostQuestSchema, "Share project details"],
      [githubIdentitySchema, "@vellum-builder"],
      [discordIdentitySchema, "vellum-builder"],
      [telegramIdentitySchema, "@vellum_builder"],
      [blueskyIdentitySchema, "@builder.example.com"],
      [githubContributionSchema, "Add a CKB integration"],
      [discordCommunitySchema, "Example CKB Community"],
      [telegramCommunitySchema, "Example CKB Community"],
    ] as const;
    expect(examples.map(([schema]) => schema.id).sort()).toEqual(
      Object.values(vellumSchemaRegistry)
        .map((schema) => schema.id)
        .sort(),
    );

    for (const [schema, expected] of examples) {
      const html = renderToStaticMarkup(
        <ClaimPayloadRenderer claim={claim(schema.hash, schema.example)} />,
      );
      expect(html).toContain(schema.id);
      expect(html).toContain(expected);
    }
  });

  test("scores, validates, and renders the published CKBoost sample claim", () => {
    const sample = ckboostSampleClaim();
    const evaluatedAt = Number(sample.issuedAt);
    const score = scoreReputation({
      claims: { claims: [sample], invalid: [] },
      evaluatedAt,
    });
    expect(score).toMatchObject({
      status: "available",
      overall: { score: 20 },
      excludedEvidence: [],
    });
    if (score.status !== "available") throw new Error("Expected an available score");
    expect(score.categories.find((category) => category.id === "contribution")).toMatchObject({
      score: 20,
    });

    const subject = "did:ckb:fn7u37m7vwerr4ojysgdwwp4mescjtrp";
    const parsed = parseReputationApiBody(
      {
        ok: true,
        version: "1",
        network: "ckb_testnet",
        subject,
        ...score,
      },
      subject,
    );
    expect(parsed).toMatchObject({
      kind: "result",
      value: {
        status: "available",
        evidence: [
          {
            schemaId: ckboostQuestSchema.id,
            ckboostQuest: {
              campaignTypeId: ckboostQuestSchema.example.campaign_type_id,
              questId: ckboostQuestSchema.example.quest_id,
              classification: "contribution",
              completionUnits: 1,
            },
          },
        ],
      },
    });

    const html = renderToStaticMarkup(<ClaimPayloadRenderer claim={sample} />);
    expect(html).toContain(ckboostQuestSchema.example.quest_title);
    expect(html).toContain(ckboostQuestSchema.example.campaign_title.replace("&", "&amp;"));
    expect(html).toContain(ckboostQuestSchema.example.points_awarded);
    expect(html).toContain(ckboostQuestSchema.example.approval_tx_hash);
    expect(html).toContain(ckboostQuestSchema.example.reward_claim_tx_hash);
  });

  test("renders escaped CKBoost labels with final and approval evidence links", () => {
    const html = renderToStaticMarkup(
      <ClaimPayloadRenderer
        claim={claim(ckboostQuestSchema.hash, {
          ...ckboostQuestSchema.example,
          campaign_title: "CKB <Builders>",
          quest_title: "Ship & verify",
        })}
      />,
    );

    expect(html).toContain("Ship &amp; verify");
    expect(html).toContain("CKB &lt;Builders&gt;");
    expect(html).not.toContain("<Builders>");
    expect(html).toContain(
      `href="https://pudge.explorer.nervos.org/transaction/${ckboostQuestSchema.example.reward_claim_tx_hash}"`,
    );
    expect(html).toContain(
      `href="https://pudge.explorer.nervos.org/transaction/${ckboostQuestSchema.example.approval_tx_hash}"`,
    );
  });

  test("does not select a trusted renderer from payload contents", () => {
    const html = renderToStaticMarkup(
      <ClaimPayloadRenderer
        claim={claim(`0x${"99".repeat(32)}`, {
          ...githubIdentitySchema.example,
          schema_id: githubIdentitySchema.id,
        })}
      />,
    );

    expect(html).toContain("Unregistered schema");
    expect(html).not.toContain("GitHub account control");
  });

  test("fails closed when a registered hash carries a malformed payload", () => {
    const html = renderToStaticMarkup(
      <ClaimPayloadRenderer
        claim={claim(githubIdentitySchema.hash, { login: "not-a-complete-payload" })}
      />,
    );

    expect(html).toContain(githubIdentitySchema.id);
    expect(html).toContain("Registered payload unavailable");
    expect(html).toContain("View bounded raw payload");
  });

  test("escapes user-controlled fields in a registered renderer", () => {
    const html = renderToStaticMarkup(
      <ClaimPayloadRenderer
        claim={claim(discordIdentitySchema.hash, {
          ...discordIdentitySchema.example,
          username: "<img/src=x>",
        })}
      />,
    );

    expect(html).toContain("&lt;img/src=x&gt;");
    expect(html).not.toContain("<img");
  });

  test("bounds unknown structures and serializes bigint without invoking accessors", () => {
    const collidingPrefix = "k".repeat(96);
    const keyedPayload: Record<string, unknown> = Object.create(null);
    keyedPayload.__proto__ = { retained: "prototype field" };
    keyedPayload[`${collidingPrefix}a`] = "first colliding field";
    keyedPayload[`${collidingPrefix}b`] = "second colliding field";
    const payload: Record<string, unknown> = {
      bigint: 9_007_199_254_740_993n,
      keyedPayload,
      list: Array.from({ length: 500 }, (_, index) => index),
      markup: "<script>alert(1)</script>",
      text: "x".repeat(5_000),
    };
    Object.defineProperty(payload, "secret", {
      enumerable: true,
      get() {
        throw new Error("must not run");
      },
    });
    payload.self = payload;

    const html = renderToStaticMarkup(
      <ClaimPayloadRenderer claim={claim(`0x${"88".repeat(32)}`, payload)} />,
    );

    expect(html.length).toBeLessThan(20_000);
    expect(html).toContain("9007199254740993n");
    expect(html).toContain("[accessor omitted]");
    expect(html).toContain("[circular reference]");
    expect(html).toContain("__proto__");
    expect(html).toContain("prototype field");
    expect(html).toContain("first colliding field");
    expect(html).toContain("second colliding field");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
  });

  test("does not traverse maps or sets past the preview limit", () => {
    const map = new Map(Array.from({ length: 25 }, (_, index) => [index, `map-${index}`]));
    const set = new Set(Array.from({ length: 25 }, (_, index) => `set-${index}`));
    const guardIterator = <T,>(values: readonly T[]) => {
      let index = 0;
      return {
        next() {
          if (index >= values.length) throw new Error("preview read past its limit");
          return { done: false as const, value: values[index++] };
        },
        [Symbol.iterator]() {
          return this;
        },
      };
    };
    Object.defineProperty(map, "entries", {
      value: () => guardIterator(Array.from(map).slice(0, 24)),
    });
    Object.defineProperty(set, "values", {
      value: () => guardIterator(Array.from(set).slice(0, 24)),
    });

    const html = renderToStaticMarkup(
      <ClaimPayloadRenderer claim={claim(`0x${"77".repeat(32)}`, { map, set })} />,
    );

    expect(html).not.toContain("payload unavailable");
    expect(html).toContain("map-23");
    expect(html).toContain("set-23");
    expect(html).toContain("[1 more items]");
  });

  test("caps the final raw payload preview", () => {
    const payload = Object.fromEntries(
      Array.from({ length: 24 }, (_, group) => [
        `group-${group}`,
        Object.fromEntries(
          Array.from({ length: 4 }, (_, field) => [
            `field-${field}`,
            `${group}-${field}-${"x".repeat(500)}`,
          ]),
        ),
      ]),
    );

    const html = renderToStaticMarkup(
      <ClaimPayloadRenderer claim={claim(`0x${"66".repeat(32)}`, payload)} />,
    );

    expect(html.length).toBeLessThan(20_000);
    expect(html).toContain("[output truncated]");
  });
});
