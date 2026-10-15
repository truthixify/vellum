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
  vellumSchemaRegistry,
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
