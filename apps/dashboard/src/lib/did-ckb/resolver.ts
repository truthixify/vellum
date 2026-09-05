import { ccc } from "@ckb-ccc/core";
import {
  argsToDid,
  DidCkbData,
  findDidCkbCell,
  listDidCkbsByLock as upstreamListDidCkbsByLock,
  resolveDidCkb as upstreamResolveDidCkb,
} from "@ckb-ccc/did-ckb";

import { extractProfile, type DidDocument, type VellumProfile } from "./profile";

/**
 * Vellum's resolver record: upstream's DidCkbRecord shape plus the extracted
 * VellumProfile so route code can render without decoding the CBOR document
 * itself. `document` is already CBOR-decoded by upstream's codec.
 */
export type DidRecord = {
  did: string;
  args: ccc.Hex;
  document: DidDocument;
  profile: VellumProfile;
  localId: string | undefined;
  cell: ccc.Cell;
};

function decorate(cell: ccc.Cell, args: ccc.Hex, data: DidCkbData): DidRecord {
  if (data.type !== "v1") {
    throw new Error(`Unsupported DID data variant: ${String(data.type)}`);
  }
  const document = data.value.document as DidDocument;
  return {
    did: argsToDid(args),
    args,
    document,
    profile: extractProfile(document),
    localId: data.value.localId ?? undefined,
    cell,
  };
}

export async function findDidCell(
  client: ccc.Client,
  args: ccc.HexLike,
): Promise<DidRecord | null> {
  const record = await findDidCkbCell({ client, id: args });
  if (!record) return null;
  return decorate(record.cell, record.id, record.data);
}

export async function resolveDid(client: ccc.Client, did: string): Promise<DidRecord | null> {
  const record = await upstreamResolveDidCkb({ client, did });
  if (!record) return null;
  return decorate(record.cell, record.id, record.data);
}

export async function listDidsByLock(
  client: ccc.Client,
  lock: ccc.ScriptLike,
): Promise<DidRecord[]> {
  const records = await upstreamListDidCkbsByLock({ client, lock });
  return records
    .map((r) => {
      try {
        return decorate(r.cell, r.id, r.data);
      } catch (err) {
        console.warn("Skipping unparseable DID cell", r.cell.outPoint, err);
        return null;
      }
    })
    .filter((r): r is DidRecord => r !== null);
}
