import { ccc } from "@ckb-ccc/core";
import { didToArgs } from "@ckb-ccc/did-ckb";
import type { VellumSchemaDefinition, VellumSchemaId } from "@vellum/schemas";
import { VELLUM_REPUTATION_POLICY_V7 } from "@vellum/scoring";

export type ManifestFieldSchema = {
  type?: "object" | "array" | "string" | "integer";
  properties?: Readonly<Record<string, ManifestFieldSchema>>;
  required?: readonly string[];
  items?: ManifestFieldSchema;
  enum?: readonly string[];
  const?: string;
  format?: string;
  template?: string;
  pattern?: string;
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
};

export type ClaimFormDraft = string | ClaimFormDraft[] | { [key: string]: ClaimFormDraft };

export type ClaimFormResult =
  | { ok: true; payload: unknown }
  | { ok: false; errors: Record<string, string> };

export type SchemaPresentation = {
  title: string;
  group: "Partner" | "Social" | "Community" | "Contribution";
  summary: string;
};

export type RegisteredSchemaIssuerRecognition = "recognized" | "unrecognized" | "unconfigured";

const OMIT = Symbol("omit");
const HEX_32_PATTERN = /^0x[0-9a-f]{64}$/;

const RECOGNIZED_SCHEMA_ISSUER_DIDS: Readonly<Partial<Record<VellumSchemaId, readonly string[]>>> =
  {
    "ckboost.quest.v1": VELLUM_REPUTATION_POLICY_V7.ckboost.issuerDids,
    "vellum.social.github.v1": VELLUM_REPUTATION_POLICY_V7.github.issuerDids,
    "vellum.contribution.github.v1": VELLUM_REPUTATION_POLICY_V7.github.issuerDids,
    "vellum.social.discord.v1": VELLUM_REPUTATION_POLICY_V7.discord.issuerDids,
    "vellum.community.discord.v1": VELLUM_REPUTATION_POLICY_V7.discord.issuerDids,
    "vellum.social.telegram.v1": VELLUM_REPUTATION_POLICY_V7.telegram.issuerDids,
    "vellum.community.telegram.v1": VELLUM_REPUTATION_POLICY_V7.telegram.issuerDids,
    "vellum.social.bluesky.v1": VELLUM_REPUTATION_POLICY_V7.bluesky.issuerDids,
  };

const SCHEMA_PRESENTATION: Record<VellumSchemaId, SchemaPresentation> = {
  "ckboost.quest.v1": {
    title: "CKBoost quest completion",
    group: "Partner",
    summary: "Records an approved CKBoost quest and its reward transaction.",
  },
  "crowdcell.campaign-funded.v1": {
    title: "CrowdCell campaign funded",
    group: "Partner",
    summary: "Records a finalized CrowdCell campaign that met its funding goal.",
  },
  "klaveroq.milestone-settlement.v1": {
    title: "Klaveroq milestone settlement",
    group: "Partner",
    summary: "Records one settled marketplace milestone without exposing private work details.",
  },
  "rivet.repository-backup.v1": {
    title: "Rivet repository backup",
    group: "Partner",
    summary: "Records one confirmed public repository snapshot anchored by Rivet.",
  },
  "vellum.social.github.v1": {
    title: "GitHub identity",
    group: "Social",
    summary: "Binds a GitHub account snapshot to the subject DID.",
  },
  "vellum.contribution.github.v1": {
    title: "GitHub contribution window",
    group: "Contribution",
    summary: "Records eligible public GitHub work from a fixed verification window.",
  },
  "vellum.social.discord.v1": {
    title: "Discord identity",
    group: "Social",
    summary: "Binds a Discord account snapshot to the subject DID.",
  },
  "vellum.community.discord.v1": {
    title: "Discord community membership",
    group: "Community",
    summary: "Records selected Discord memberships and recognized roles.",
  },
  "vellum.social.telegram.v1": {
    title: "Telegram identity",
    group: "Social",
    summary: "Binds a Telegram account snapshot to the subject DID.",
  },
  "vellum.community.telegram.v1": {
    title: "Telegram community membership",
    group: "Community",
    summary: "Records selected Telegram community memberships.",
  },
  "vellum.social.bluesky.v1": {
    title: "Bluesky identity",
    group: "Social",
    summary: "Binds a Bluesky DID and handle snapshot to the subject DID.",
  },
};

function isDraftObject(value: ClaimFormDraft): value is { [key: string]: ClaimFormDraft } {
  return typeof value === "object" && !Array.isArray(value);
}

function toDateTimeInput(value: number): string {
  const date = new Date(value * 1_000);
  if (Number.isNaN(date.getTime())) return "";
  const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 19);
}

function fromDateTimeInput(value: string): number | undefined {
  if (/^[1-9][0-9]*$/.test(value)) {
    const seconds = Number(value);
    return Number.isSafeInteger(seconds) ? seconds : undefined;
  }
  const milliseconds = new Date(value).getTime();
  if (!Number.isFinite(milliseconds)) return undefined;
  const seconds = milliseconds / 1_000;
  return Number.isSafeInteger(seconds) ? seconds : undefined;
}

export function schemaPresentation(schemaId: VellumSchemaId): SchemaPresentation {
  return SCHEMA_PRESENTATION[schemaId];
}

export function registeredSchemaIssuerRecognition(
  issuerDid: string | undefined,
  schemaId: VellumSchemaId,
): RegisteredSchemaIssuerRecognition {
  const recognizedIssuerDids = RECOGNIZED_SCHEMA_ISSUER_DIDS[schemaId];
  if (!recognizedIssuerDids) return "unconfigured";
  return issuerDid && recognizedIssuerDids.includes(issuerDid) ? "recognized" : "unrecognized";
}

export function schemaPayloadDefinition(definition: VellumSchemaDefinition): ManifestFieldSchema {
  return definition.manifest.payload as ManifestFieldSchema;
}

export function createEmptyClaimDraft(schema: ManifestFieldSchema): ClaimFormDraft {
  if (schema.const !== undefined) return schema.const;
  if (schema.type === "object") {
    return Object.fromEntries(
      Object.entries(schema.properties ?? {}).map(([key, child]) => [
        key,
        createEmptyClaimDraft(child),
      ]),
    );
  }
  if (schema.type === "array") {
    const length = schema.minItems ?? 0;
    return Array.from({ length }, () => createEmptyClaimDraft(schema.items ?? {}));
  }
  return "";
}

export function createExampleClaimDraft(
  schema: ManifestFieldSchema,
  value: unknown,
): ClaimFormDraft {
  if (schema.type === "object") {
    const record =
      typeof value === "object" && value !== null && !Array.isArray(value) ? value : {};
    return Object.fromEntries(
      Object.entries(schema.properties ?? {}).map(([key, child]) => [
        key,
        createExampleClaimDraft(child, (record as Record<string, unknown>)[key]),
      ]),
    );
  }
  if (schema.type === "array") {
    return Array.isArray(value)
      ? value.map((item) => createExampleClaimDraft(schema.items ?? {}, item))
      : [];
  }
  if (schema.format === "unix-time-seconds" && typeof value === "number") {
    return toDateTimeInput(value);
  }
  if (value === undefined || value === null) return schema.const ?? "";
  return String(value);
}

export function isBlankClaimDraft(value: ClaimFormDraft): boolean {
  if (typeof value === "string") return value.length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return Object.values(value).every(isBlankClaimDraft);
}

function pathLabel(path: string): string {
  const field = path.split(".").at(-1) ?? path;
  return field.replace(/\[(\d+)\]/g, " item $1").replaceAll("_", " ");
}

function coerceField(
  schema: ManifestFieldSchema,
  draft: ClaimFormDraft,
  path: string,
  required: boolean,
  errors: Record<string, string>,
): unknown | typeof OMIT {
  if (schema.const !== undefined) return schema.const;

  if (!required && isBlankClaimDraft(draft)) return OMIT;

  if (schema.type === "object") {
    if (!isDraftObject(draft)) {
      errors[path] = `${pathLabel(path)} must be an object.`;
      return OMIT;
    }
    const requiredFields = new Set(schema.required ?? []);
    const result: Record<string, unknown> = {};
    for (const [key, child] of Object.entries(schema.properties ?? {})) {
      const childPath = path ? `${path}.${key}` : key;
      const value = coerceField(
        child,
        draft[key] ?? createEmptyClaimDraft(child),
        childPath,
        requiredFields.has(key),
        errors,
      );
      if (value !== OMIT) result[key] = value;
    }
    return result;
  }

  if (schema.type === "array") {
    if (!Array.isArray(draft)) {
      errors[path] = `${pathLabel(path)} must be a list.`;
      return OMIT;
    }
    if (schema.minItems !== undefined && draft.length < schema.minItems) {
      errors[path] =
        `${pathLabel(path)} needs at least ${schema.minItems} item${schema.minItems === 1 ? "" : "s"}.`;
    }
    if (schema.maxItems !== undefined && draft.length > schema.maxItems) {
      errors[path] = `${pathLabel(path)} allows at most ${schema.maxItems} items.`;
    }
    return draft.map((item, index) =>
      coerceField(schema.items ?? {}, item, `${path}[${index}]`, true, errors),
    );
  }

  if (typeof draft !== "string") {
    errors[path] = `${pathLabel(path)} has an invalid value.`;
    return OMIT;
  }
  if (draft.length === 0) {
    if (required) errors[path] = `${pathLabel(path)} is required.`;
    return OMIT;
  }

  if (schema.type === "integer") {
    const value =
      schema.format === "unix-time-seconds"
        ? fromDateTimeInput(draft)
        : /^-?[0-9]+$/.test(draft)
          ? Number(draft)
          : undefined;
    if (value === undefined || !Number.isSafeInteger(value)) {
      errors[path] =
        schema.format === "unix-time-seconds"
          ? `${pathLabel(path)} must be a valid date and time.`
          : `${pathLabel(path)} must be a whole number.`;
      return OMIT;
    }
    if (schema.minimum !== undefined && value < schema.minimum) {
      errors[path] = `${pathLabel(path)} must be at least ${schema.minimum}.`;
    }
    if (schema.maximum !== undefined && value > schema.maximum) {
      errors[path] = `${pathLabel(path)} must be no more than ${schema.maximum}.`;
    }
    return value;
  }

  if (schema.minLength !== undefined && draft.length < schema.minLength) {
    errors[path] = `${pathLabel(path)} must contain at least ${schema.minLength} characters.`;
  }
  if (schema.maxLength !== undefined && draft.length > schema.maxLength) {
    errors[path] = `${pathLabel(path)} must contain no more than ${schema.maxLength} characters.`;
  }
  if (schema.enum && !schema.enum.includes(draft)) {
    errors[path] = `${pathLabel(path)} must use one of the published values.`;
  }
  if (schema.pattern) {
    try {
      if (!new RegExp(schema.pattern, "u").test(draft)) {
        errors[path] = `${pathLabel(path)} does not match the published format.`;
      }
    } catch {
      errors[path] = `${pathLabel(path)} has an invalid schema pattern.`;
    }
  }
  if (schema.format === "uri") {
    try {
      new URL(draft);
    } catch {
      errors[path] = `${pathLabel(path)} must be a valid URL.`;
    }
  }
  return draft;
}

export function parseRegisteredClaimDraft(
  definition: VellumSchemaDefinition,
  draft: ClaimFormDraft,
): ClaimFormResult {
  const errors: Record<string, string> = {};
  const payload = coerceField(schemaPayloadDefinition(definition), draft, "", true, errors);
  if (Object.keys(errors).length > 0 || payload === OMIT) return { ok: false, errors };

  try {
    const parse = definition.parse as (value: unknown) => unknown;
    return { ok: true, payload: parse(payload) };
  } catch (error) {
    return {
      ok: false,
      errors: {
        $form: error instanceof Error ? error.message : `Payload does not match ${definition.id}.`,
      },
    };
  }
}

export function parseCustomClaimPayload(
  schemaHash: string,
  source: string,
): { ok: true; schemaHash: `0x${string}`; payload: unknown } | { ok: false; error: string } {
  if (!HEX_32_PATTERN.test(schemaHash)) {
    return { ok: false, error: "Schema hash must be 32 lowercase hex bytes prefixed with 0x." };
  }
  try {
    const payload = JSON.parse(source) as unknown;
    if (payload === undefined) throw new Error("Payload is missing");
    assertCanonicalJsonValue(payload);
    return { ok: true, schemaHash: schemaHash as `0x${string}`, payload };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error ? `Payload is not valid JSON: ${error.message}` : "Invalid JSON.",
    };
  }
}

function assertCanonicalJsonValue(value: unknown): void {
  if (value === null || typeof value === "boolean" || typeof value === "string") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Numbers must be finite");
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(assertCanonicalJsonValue);
    return;
  }
  if (typeof value === "object") {
    Object.values(value).forEach(assertCanonicalJsonValue);
    return;
  }
  throw new Error("Payload must contain only JSON values");
}

function sortedJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortedJsonValue);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map((key) => [key, sortedJsonValue((value as Record<string, unknown>)[key])]),
  );
}

export function formatCanonicalPayload(payload: unknown): string {
  return JSON.stringify(sortedJsonValue(payload), null, 2);
}

export function isWalletRequestRejection(error: unknown): boolean {
  if (typeof error === "object" && error !== null) {
    const code = "code" in error ? error.code : undefined;
    if (code === 4001 || code === "ACTION_REJECTED") return true;
  }

  const message =
    error instanceof Error
      ? error.message
      : typeof error === "object" && error !== null && "message" in error
        ? String(error.message)
        : typeof error === "string"
          ? error
          : "";
  return /\buser (?:rejected|denied|cancell?ed)\b/i.test(message);
}

export async function signAndBroadcastPreparedClaim(
  signer: ccc.Signer,
  transaction: ccc.Transaction,
): Promise<ccc.Hex> {
  const preparedHash = transaction.hash();
  const signed = await signer.signOnlyTransaction(transaction);
  if (signed.hash() !== preparedHash) {
    throw new Error("The wallet changed the reviewed transaction before signing.");
  }
  return signer.client.sendTransaction(signed);
}

export function parseExpiry(value: string, issuedAt: number): number | undefined {
  if (!value) return undefined;
  const expiresAt = fromDateTimeInput(value);
  if (expiresAt === undefined || expiresAt <= issuedAt) {
    throw new Error("Expiry must be a valid date and time after issuance.");
  }
  return expiresAt;
}

function validDid(value: string): string | undefined {
  try {
    didToArgs(value);
    return value;
  } catch {
    return undefined;
  }
}

export function parseSubjectDid(value: string): string {
  const did = validDid(value.trim());
  if (!did) throw new Error("Enter a valid did:ckb identity.");
  return did;
}

export function subjectDidFromQr(rawValue: string): string {
  const raw = rawValue.trim();
  const direct = validDid(raw);
  if (direct) return direct;

  try {
    const url = new URL(raw);
    const queryDid = url.searchParams.get("did");
    if (queryDid) {
      const did = validDid(queryDid);
      if (did) return did;
    }
    for (const segment of url.pathname.split("/").filter(Boolean).reverse()) {
      const did = validDid(decodeURIComponent(segment));
      if (did) return did;
    }
  } catch {
    // A QR value may be a plain DID rather than a URL.
  }

  throw new Error("The QR code does not contain a valid did:ckb identity.");
}

export function fieldLabel(name: string): string {
  const label = name.replaceAll("_", " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function claimFieldId(path: string): string {
  return `claim-${path.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
}
