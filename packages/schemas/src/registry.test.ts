import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { hashSchemaManifest } from "./hash";
import { getVellumSchemaDefinition, vellumSchemaRegistry } from "./registry";

describe("Vellum schema registry", () => {
  test("indexes every published schema by its immutable ID", () => {
    const definitions = Object.values(vellumSchemaRegistry);
    expect(definitions).toHaveLength(10);
    expect(new Set(definitions.map((definition) => definition.id)).size).toBe(10);

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
      const parse = definition.parse as (value: unknown) => unknown;
      expect(parse(definition.example)).toEqual(definition.example);
    }
  });

  test("keeps the published JSON manifests identical to the registry", () => {
    for (const definition of Object.values(vellumSchemaRegistry)) {
      const manifestUrl = new URL(`../../../${definition.manifestFile}`, import.meta.url);
      const publishedManifest = JSON.parse(readFileSync(manifestUrl, "utf8")) as unknown;
      expect(publishedManifest).toEqual(definition.manifest);
      expect(hashSchemaManifest(publishedManifest)).toBe(definition.hash);
    }
  });

  test("keeps each published specification linked to its valid example", () => {
    const indexUrl = new URL("../../../docs/schemas/README.md", import.meta.url);
    const index = readFileSync(indexUrl, "utf8");
    for (const definition of Object.values(vellumSchemaRegistry)) {
      const specificationUrl = new URL(`../../../${definition.specification}`, import.meta.url);
      const specification = readFileSync(specificationUrl, "utf8");
      const example = specification.match(/```json\n([\s\S]*?)\n```/);
      expect(index).toContain(definition.id);
      expect(index).toContain(definition.hash);
      expect(index).toContain(definition.specification.replace("docs/schemas/", "./"));
      expect(index).toContain(definition.manifestFile.replace("docs/schemas/", "./"));
      expect(specification).toContain(`# \`${definition.id}\``);
      expect(specification).toContain(definition.hash);
      expect(specification).toContain(`./manifests/${definition.id}.json`);
      expect(example).not.toBeNull();
      expect(JSON.parse(example![1]) as unknown).toEqual(definition.example);
    }
  });
});
