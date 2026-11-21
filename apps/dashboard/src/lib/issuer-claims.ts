import { ccc } from "@ckb-ccc/core";
import { didToArgs } from "@ckb-ccc/did-ckb";
import { ClaimData, type ClaimScriptConfigLike } from "@usevellum/sdk";

const DID_SCRIPT_PREFIX_BYTES = 33;
const CLAIM_TYPE_ARGS_BYTES = 65;
const PAGE_SIZE = 100;
const DEFAULT_SCAN_LIMIT = 500;

export type RecentIssuerClaim = {
  transactionHash: ccc.Hex;
  outputIndex: number;
  schemaHash: ccc.Hex;
  subjectLockHash: ccc.Hex;
  issuedAt: bigint;
  expiresAt?: bigint;
  capacity: bigint;
};

export type RecentIssuerClaimsResult = {
  claims: RecentIssuerClaim[];
  invalidCells: number;
  scanLimitReached: boolean;
};

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return left.length === right.length && left.every((byte, index) => byte === right[index]);
}

export async function readRecentIssuerClaims(
  client: ccc.Client,
  scripts: ClaimScriptConfigLike,
  issuerDid: string,
  options: { limit?: number; scanLimit?: number } = {},
): Promise<RecentIssuerClaimsResult> {
  const limit = options.limit ?? 10;
  const scanLimit = options.scanLimit ?? DEFAULT_SCAN_LIMIT;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
    throw new Error("Recent issuer claim limit must be between 1 and 50.");
  }
  if (!Number.isSafeInteger(scanLimit) || scanLimit < limit || scanLimit > 5_000) {
    throw new Error("Recent issuer claim scan limit must be between the result limit and 5000.");
  }

  const claimType = ccc.ScriptInfo.from(scripts.claimType);
  const didCkb = scripts.didCkb
    ? ccc.ScriptInfo.from(scripts.didCkb)
    : await client.getKnownScript(ccc.KnownScript.DidCkb);
  const didPrefix = ccc.bytesConcat(
    ccc.bytesFrom(didCkb.codeHash),
    ccc.hashTypeToBytes(didCkb.hashType),
  );
  const issuerId = ccc.bytesFrom(didToArgs(issuerDid));
  const claims: RecentIssuerClaim[] = [];
  let invalidCells = 0;
  let scanned = 0;
  let after: string | undefined;
  let scanLimitReached = false;

  while (claims.length < limit && scanned < scanLimit) {
    const pageLimit = Math.min(PAGE_SIZE, scanLimit - scanned);
    const page = await client.findCellsPagedNoCache(
      {
        script: {
          codeHash: claimType.codeHash,
          hashType: claimType.hashType,
          args: ccc.hexFrom(didPrefix),
        },
        scriptType: "type",
        scriptSearchMode: "prefix",
        withData: true,
      },
      "desc",
      pageLimit,
      after,
    );

    for (const cell of page.cells) {
      scanned += 1;
      const type = cell.cellOutput.type;
      const args = type ? ccc.bytesFrom(type.args) : new Uint8Array();
      if (
        !type ||
        type.codeHash !== claimType.codeHash ||
        type.hashType !== claimType.hashType ||
        args.length !== CLAIM_TYPE_ARGS_BYTES ||
        !sameBytes(args.slice(0, DID_SCRIPT_PREFIX_BYTES), didPrefix)
      ) {
        invalidCells += 1;
        continue;
      }

      let data: ClaimData;
      try {
        data = ClaimData.decode(cell.outputData);
      } catch {
        invalidCells += 1;
        continue;
      }
      if (data.type !== "v1" || !sameBytes(ccc.bytesFrom(data.value.issuerId), issuerId)) {
        continue;
      }
      if (
        data.value.issuedAt === 0n ||
        (data.value.expiresAt !== undefined && data.value.expiresAt <= data.value.issuedAt)
      ) {
        invalidCells += 1;
        continue;
      }

      claims.push({
        transactionHash: cell.outPoint.txHash,
        outputIndex: Number(cell.outPoint.index),
        schemaHash: ccc.hexFrom(args.slice(DID_SCRIPT_PREFIX_BYTES)),
        subjectLockHash: cell.cellOutput.lock.hash(),
        issuedAt: data.value.issuedAt,
        expiresAt: data.value.expiresAt,
        capacity: cell.cellOutput.capacity,
      });
      if (claims.length === limit) break;
    }

    if (claims.length === limit || page.cells.length < pageLimit) break;
    if (!page.lastCursor || page.lastCursor === after) {
      throw new Error("CKB indexer pagination did not advance while reading issuer claims.");
    }
    after = page.lastCursor;
  }

  if (scanned >= scanLimit && claims.length < limit) scanLimitReached = true;
  return { claims, invalidCells, scanLimitReached };
}
