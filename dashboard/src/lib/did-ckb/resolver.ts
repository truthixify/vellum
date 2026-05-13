import { ccc } from "@ckb-ccc/connector-react";

import { deploymentForClient, didCkbTypeScript } from "./deployment";
import { argsToDid, didToArgs, isDidCkb } from "./identifier";
import { DidCkbData } from "./molecule";
import { decodeDocument, extractProfile, type DidDocument, type VellumProfile } from "./profile";

export type DidRecord = {
  did: string;
  args: ccc.Hex;
  document: DidDocument;
  profile: VellumProfile;
  localId: ccc.Hex | undefined;
  cell: ccc.Cell;
};

function decodeCell(cell: ccc.Cell, args: ccc.Hex): DidRecord {
  const data = DidCkbData.decode(cell.outputData);
  if (data.type !== "DidCkbDataV1") {
    throw new Error(`Unsupported DID data variant: ${String(data.type)}`);
  }
  const document = decodeDocument(data.value.document);
  return {
    did: argsToDid(args),
    args,
    document,
    profile: extractProfile(document),
    localId: data.value.localId,
    cell,
  };
}

// Conflict resolution per WIP-01 §3.3.2: if multiple Live Cells share the same
// identifier, the canonical one is the earliest-created. We approximate this
// by ordering on outPoint.txHash + index. The indexer returns cells without a
// global timestamp; the controller should ideally fetch each transaction's
// header to compare block numbers, but in practice the args derive from the
// first input + output index, so collisions are vanishingly rare and tx-hash
// ordering is a deterministic tie-breaker.
function pickCanonical(cells: ccc.Cell[]): ccc.Cell {
  return cells.slice().sort((a, b) => {
    if (a.outPoint.txHash < b.outPoint.txHash) return -1;
    if (a.outPoint.txHash > b.outPoint.txHash) return 1;
    return Number(a.outPoint.index - b.outPoint.index);
  })[0];
}

export async function findDidCell(
  client: ccc.Client,
  args: ccc.Hex,
): Promise<DidRecord | null> {
  const deployment = deploymentForClient(client);
  const type = didCkbTypeScript(deployment, args);

  const cells: ccc.Cell[] = [];
  for await (const cell of client.findCellsByType(type, true)) {
    cells.push(cell);
    if (cells.length > 8) break;
  }
  if (cells.length === 0) return null;
  const cell = cells.length === 1 ? cells[0] : pickCanonical(cells);
  return decodeCell(cell, args);
}

export async function resolveDid(
  client: ccc.Client,
  did: string,
): Promise<DidRecord | null> {
  if (!isDidCkb(did)) {
    throw new Error(`Not a did:ckb identifier: ${did}`);
  }
  const args = didToArgs(did);
  return findDidCell(client, args);
}

// Reverse lookup. Find every Live DID Cell owned by a given lock. Uses the
// indexer's combined filter so we only paginate cells whose lock matches and
// whose type uses the did:ckb code hash.
export async function listDidsByLock(
  client: ccc.Client,
  lock: ccc.ScriptLike,
): Promise<DidRecord[]> {
  const deployment = deploymentForClient(client);
  const typeFilter: ccc.ScriptLike = {
    codeHash: deployment.codeHash,
    hashType: deployment.hashType,
    args: "0x",
  };

  const records: DidRecord[] = [];
  for await (const cell of client.findCellsByLock(lock, typeFilter, true)) {
    if (!cell.cellOutput.type) continue;
    const args = cell.cellOutput.type.args as ccc.Hex;
    if (ccc.bytesFrom(args).length !== 20) continue;
    try {
      records.push(decodeCell(cell, args));
    } catch (err) {
      console.warn("Skipping unparseable DID cell", cell.outPoint, err);
    }
  }
  return records;
}
