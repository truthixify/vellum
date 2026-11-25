import { describe, expect, test } from "bun:test";

import { hashSchemaManifest } from "../hash";
import {
  RIVET_REPOSITORY_BACKUP_CLAIM_SCHEMA_HASH,
  parseRivetRepositoryBackupClaimPayload,
  rivetRepositoryBackupClaimSchemaManifest,
  type RivetRepositoryBackupClaimPayload,
} from "./repository-backup.v1";

const payload: RivetRepositoryBackupClaimPayload = {
  github_user_id: "9000000001",
  github_repository_id: "9000000002",
  repository: "vellum-builder/portable-reputation",
  snapshot_tx_hash: `0x${"11".repeat(32)}`,
  snapshot_output_index: 0,
  anchor_version: 2,
  commit_count: 248,
  backed_up_at: 2_000_000_000,
};

describe("rivet.repository-backup.v1", () => {
  test("has a reproducible CKB schema hash and accepts confirmed public backup evidence", () => {
    expect(RIVET_REPOSITORY_BACKUP_CLAIM_SCHEMA_HASH).toMatch(/^0x[0-9a-f]{64}$/);
    expect(hashSchemaManifest(rivetRepositoryBackupClaimSchemaManifest)).toBe(
      RIVET_REPOSITORY_BACKUP_CLAIM_SCHEMA_HASH,
    );
    expect(parseRivetRepositoryBackupClaimPayload(payload)).toEqual(payload);
  });

  test("rejects malformed stable identifiers, repository names, and extra data", () => {
    for (const github_repository_id of ["0", "01", "-1", "1".repeat(31)]) {
      expect(() =>
        parseRivetRepositoryBackupClaimPayload({ ...payload, github_repository_id }),
      ).toThrow();
    }
    for (const repository of ["owner", "/repo", "owner/", "owner/repo/name", "owner/repo name"]) {
      expect(() => parseRivetRepositoryBackupClaimPayload({ ...payload, repository })).toThrow();
    }
    expect(() =>
      parseRivetRepositoryBackupClaimPayload({ ...payload, ipfs_cid: "private" }),
    ).toThrow();
  });

  test("rejects invalid anchors, versions, counts, and timestamps", () => {
    expect(() =>
      parseRivetRepositoryBackupClaimPayload({
        ...payload,
        snapshot_tx_hash: `0x${"AA".repeat(32)}`,
      }),
    ).toThrow();
    for (const snapshot_output_index of [-1, 4_294_967_296, 1.5]) {
      expect(() =>
        parseRivetRepositoryBackupClaimPayload({ ...payload, snapshot_output_index }),
      ).toThrow();
    }
    expect(() =>
      parseRivetRepositoryBackupClaimPayload({ ...payload, anchor_version: 1 }),
    ).toThrow();
    for (const commit_count of [0, 4_294_967_296, 1.5]) {
      expect(() => parseRivetRepositoryBackupClaimPayload({ ...payload, commit_count })).toThrow();
    }
    expect(() => parseRivetRepositoryBackupClaimPayload({ ...payload, backed_up_at: 0 })).toThrow();
  });
});
