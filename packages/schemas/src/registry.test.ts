import { describe, expect, test } from "bun:test";

import { parseDiscordCommunityClaimPayload } from "./community/discord.v1";
import { parseTelegramCommunityClaimPayload } from "./community/telegram.v1";
import { parseGithubContributionClaimPayload } from "./contribution/github.v1";
import { hashSchemaManifest } from "./hash";
import { getVellumSchemaDefinition, vellumSchemaRegistry, type VellumSchemaId } from "./registry";
import { parseBlueskyClaimPayload } from "./social/bluesky.v1";
import { parseDiscordClaimPayload } from "./social/discord.v1";
import { parseGithubClaimPayload } from "./social/github.v1";
import { parseTelegramClaimPayload } from "./social/telegram.v1";

const parsers: Record<VellumSchemaId, (value: unknown) => unknown> = {
  "vellum.social.github.v1": parseGithubClaimPayload,
  "vellum.contribution.github.v1": parseGithubContributionClaimPayload,
  "vellum.social.discord.v1": parseDiscordClaimPayload,
  "vellum.community.discord.v1": parseDiscordCommunityClaimPayload,
  "vellum.social.telegram.v1": parseTelegramClaimPayload,
  "vellum.community.telegram.v1": parseTelegramCommunityClaimPayload,
  "vellum.social.bluesky.v1": parseBlueskyClaimPayload,
};

describe("Vellum schema registry", () => {
  test("indexes every published schema by its immutable ID", () => {
    const definitions = Object.values(vellumSchemaRegistry);
    expect(definitions).toHaveLength(7);
    expect(new Set(definitions.map((definition) => definition.id)).size).toBe(7);

    for (const definition of definitions) {
      expect(getVellumSchemaDefinition(definition.id)).toBe(definition);
      expect(definition.manifest.name).toBe(definition.id);
      expect(definition.manifest.version).toBe(1);
      expect(definition.manifest.encoding).toBe("dag-cbor");
      expect(hashSchemaManifest(definition.manifest)).toBe(definition.hash);
    }
    expect(getVellumSchemaDefinition("vellum.social.unknown.v1")).toBeUndefined();
  });

  test("publishes a valid example for every schema", () => {
    for (const definition of Object.values(vellumSchemaRegistry)) {
      expect(parsers[definition.id](definition.example)).toEqual(definition.example);
    }
  });
});
