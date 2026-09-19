import { ccc } from "@ckb-ccc/core";

function assertUnicodeScalarString(value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      if (index + 1 >= value.length) {
        throw new TypeError("Canonical JSON strings cannot contain lone surrogates");
      }
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) {
        throw new TypeError("Canonical JSON strings cannot contain lone surrogates");
      }
      index += 1;
      continue;
    }
    if (unit >= 0xdc00 && unit <= 0xdfff) {
      throw new TypeError("Canonical JSON strings cannot contain lone surrogates");
    }
  }
}

function serialize(value: unknown, ancestors: Set<object>): string {
  if (value === null || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "string") {
    assertUnicodeScalarString(value);
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError("Canonical JSON numbers must be finite");
    }
    return JSON.stringify(value);
  }
  if (typeof value !== "object") {
    throw new TypeError("Canonical JSON supports only JSON values");
  }
  if (ancestors.has(value)) {
    throw new TypeError("Canonical JSON cannot contain cycles");
  }

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const items: string[] = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!(index in value)) {
          throw new TypeError("Canonical JSON arrays cannot contain empty slots");
        }
        items.push(serialize(value[index], ancestors));
      }
      return `[${items.join(",")}]`;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Canonical JSON objects must be plain objects");
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw new TypeError("Canonical JSON objects cannot contain symbol keys");
    }

    const record = value as Record<string, unknown>;
    const members = Object.keys(record)
      .sort()
      .map((key) => {
        assertUnicodeScalarString(key);
        return `${JSON.stringify(key)}:${serialize(record[key], ancestors)}`;
      });
    return `{${members.join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

/** Returns the RFC 8785 representation used to identify claim schema manifests. */
export function canonicalizeSchemaManifest(manifest: unknown): string {
  return serialize(manifest, new Set());
}

/** Computes CKB_HASH(JCS(schema_manifest)). */
export function hashSchemaManifest(manifest: unknown): ccc.Hex {
  return ccc.hashCkb(ccc.bytesFrom(canonicalizeSchemaManifest(manifest), "utf8"));
}
