import { describe, expect, test } from "bun:test";
import type { Claim } from "@usevellum/sdk";
import {
  blueskyIdentitySchema,
  discordCommunitySchema,
  discordIdentitySchema,
  githubContributionSchema,
  githubIdentitySchema,
  telegramCommunitySchema,
  telegramIdentitySchema,
} from "@vellum/schemas";
import { renderToStaticMarkup } from "react-dom/server";

import { ClaimPayloadRenderer } from "./ClaimRenderer";

function claim(schemaHash: string, payload: unknown): Claim {
  return { schemaHash, payload } as unknown as Claim;
}

describe("public Claim Cell renderers", () => {
  test("renders every published Vellum schema through its exact hash registration", () => {
    const examples = [
      [githubIdentitySchema, "@vellum-builder"],
      [discordIdentitySchema, "vellum-builder"],
      [telegramIdentitySchema, "@vellum_builder"],
      [blueskyIdentitySchema, "@builder.example.com"],
      [githubContributionSchema, "Add a CKB integration"],
      [discordCommunitySchema, "Example CKB Community"],
      [telegramCommunitySchema, "Example CKB Community"],
    ] as const;

    for (const [schema, expected] of examples) {
      const html = renderToStaticMarkup(
        <ClaimPayloadRenderer claim={claim(schema.hash, schema.example)} />,
      );
      expect(html).toContain(schema.id);
      expect(html).toContain(expected);
    }
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
    const payload: Record<string, unknown> = {
      bigint: 9_007_199_254_740_993n,
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
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>");
  });
});
