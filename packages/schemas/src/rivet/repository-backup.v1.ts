export const RIVET_REPOSITORY_BACKUP_CLAIM_SCHEMA_ID = "rivet.repository-backup.v1" as const;

export const rivetRepositoryBackupClaimSchemaManifest = {
  encoding: "dag-cbor",
  name: RIVET_REPOSITORY_BACKUP_CLAIM_SCHEMA_ID,
  payload: {
    additionalProperties: false,
    constraints: [
      "github_user_id and github_repository_id are stable decimal GitHub identifiers",
      "snapshot_tx_hash and snapshot_output_index identify one confirmed public Rivet backup anchor",
      "anchor_version is the Rivet backup anchor format used by the referenced output",
      "commit_count is read from the referenced backup anchor",
      "backed_up_at is the referenced transaction block timestamp",
    ],
    properties: {
      anchor_version: { const: 2, type: "integer" },
      backed_up_at: {
        format: "unix-time-seconds",
        maximum: Number.MAX_SAFE_INTEGER,
        minimum: 1,
        type: "integer",
      },
      commit_count: {
        maximum: 4_294_967_295,
        minimum: 1,
        type: "integer",
      },
      github_repository_id: {
        maxLength: 30,
        minLength: 1,
        pattern: "^[1-9][0-9]{0,29}$",
        type: "string",
      },
      github_user_id: {
        maxLength: 30,
        minLength: 1,
        pattern: "^[1-9][0-9]{0,29}$",
        type: "string",
      },
      repository: {
        maxLength: 201,
        minLength: 3,
        pattern: "^[A-Za-z0-9_.-]{1,100}/[A-Za-z0-9_.-]{1,100}$",
        type: "string",
      },
      snapshot_output_index: {
        maximum: 4_294_967_295,
        minimum: 0,
        type: "integer",
      },
      snapshot_tx_hash: {
        maxLength: 66,
        minLength: 66,
        pattern: "^0x[0-9a-f]{64}$",
        type: "string",
      },
    },
    required: [
      "github_user_id",
      "github_repository_id",
      "repository",
      "snapshot_tx_hash",
      "snapshot_output_index",
      "anchor_version",
      "commit_count",
      "backed_up_at",
    ],
    type: "object",
  },
  version: 1,
} as const;

export const RIVET_REPOSITORY_BACKUP_CLAIM_SCHEMA_HASH =
  "0x53165e4ecfb86396f39b777bd7dca5b15994ae5ae2c330f0a4e49b733ab1b780" as const;

export type RivetRepositoryBackupClaimPayload = {
  github_user_id: string;
  github_repository_id: string;
  repository: string;
  snapshot_tx_hash: string;
  snapshot_output_index: number;
  anchor_version: 2;
  commit_count: number;
  backed_up_at: number;
};

const DECIMAL_ID_PATTERN = /^[1-9][0-9]{0,29}$/;
const HEX32_PATTERN = /^0x[0-9a-f]{64}$/;
const REPOSITORY_PATTERN = /^[A-Za-z0-9_.-]{1,100}\/[A-Za-z0-9_.-]{1,100}$/;
const PAYLOAD_KEYS = [
  "anchor_version",
  "backed_up_at",
  "commit_count",
  "github_repository_id",
  "github_user_id",
  "repository",
  "snapshot_output_index",
  "snapshot_tx_hash",
] as const;

function hasExactKeys(value: Record<string, unknown>): boolean {
  const keys = Object.keys(value).sort();
  return (
    keys.length === PAYLOAD_KEYS.length && keys.every((key, index) => key === PAYLOAD_KEYS[index])
  );
}

function isPositiveSafeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function isUint32(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
}

export function parseRivetRepositoryBackupClaimPayload(
  value: unknown,
): RivetRepositoryBackupClaimPayload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new TypeError("Rivet repository backup claim payload must be an object");
  }
  const payload = value as Record<string, unknown>;
  if (
    !hasExactKeys(payload) ||
    typeof payload.github_user_id !== "string" ||
    !DECIMAL_ID_PATTERN.test(payload.github_user_id) ||
    typeof payload.github_repository_id !== "string" ||
    !DECIMAL_ID_PATTERN.test(payload.github_repository_id) ||
    typeof payload.repository !== "string" ||
    !REPOSITORY_PATTERN.test(payload.repository) ||
    typeof payload.snapshot_tx_hash !== "string" ||
    !HEX32_PATTERN.test(payload.snapshot_tx_hash) ||
    !isUint32(payload.snapshot_output_index) ||
    payload.anchor_version !== 2 ||
    !isPositiveSafeInteger(payload.commit_count) ||
    payload.commit_count > 0xffffffff ||
    !isPositiveSafeInteger(payload.backed_up_at)
  ) {
    throw new TypeError(
      "Rivet repository backup claim payload does not match rivet.repository-backup.v1",
    );
  }
  return payload as RivetRepositoryBackupClaimPayload;
}
