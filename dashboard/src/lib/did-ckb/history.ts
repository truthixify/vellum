import { ccc } from "@ckb-ccc/connector-react";

import { deploymentForClient } from "./deployment";
import { DidCkbData } from "./molecule";
import { decodeDocument, type DidDocument } from "./profile";

export type HistoryAction = "CREATE" | "UPDATE" | "MIGRATE";

export type HistoryEntry = {
  action: HistoryAction;
  txHash: ccc.Hex;
  outputIndex: ccc.Num;
  blockNumber?: ccc.Num;
  capacity: ccc.Num;
  document?: DidDocument;
  localId?: ccc.Hex;
};

const MAX_STEPS = 50;

// Walks the DID Cell chain backwards. The current Live Cell points to the tx
// that last touched it; one of that tx's inputs is the previous DID Cell with
// the same args; the previous Cell was produced by an earlier tx; repeat until
// no DID input is found (that tx is the CREATE).
//
// Each iteration costs one getTransaction call for the cell itself plus up to
// one extra call per non-DID input to read the prior CellOutput. For typical
// DIDs with a handful of updates that's a small handful of RPC calls.
export async function getDidHistory(
  client: ccc.Client,
  args: ccc.Hex,
  liveCell: ccc.Cell,
): Promise<HistoryEntry[]> {
  const deployment = deploymentForClient(client);
  const codeHash = deployment.codeHash.toLowerCase();
  const normalizedArgs = args.toLowerCase();

  const history: HistoryEntry[] = [];
  let cell: ccc.Cell | null = liveCell;
  let steps = 0;

  while (cell && steps++ < MAX_STEPS) {
    const tx = await client.getTransaction(cell.outPoint.txHash);
    if (!tx) break;

    const entry = decodeEntry(cell, tx.blockNumber);
    if (!entry) break;

    const priorCell = await findPriorDidCell(
      client,
      tx.transaction,
      codeHash,
      normalizedArgs,
    );

    if (!priorCell) {
      // No DID input: this is the genesis. Action is MIGRATE if local_id is
      // set (the DID was brought from did:plc), otherwise plain CREATE.
      entry.action = entry.localId ? "MIGRATE" : "CREATE";
      history.push(entry);
      break;
    }

    entry.action = "UPDATE";
    history.push(entry);
    cell = priorCell;
  }

  return history;
}

async function findPriorDidCell(
  client: ccc.Client,
  tx: ccc.Transaction,
  codeHash: string,
  args: string,
): Promise<ccc.Cell | null> {
  for (const input of tx.inputs) {
    const prevHash = input.previousOutput.txHash;
    const prevIdx = Number(input.previousOutput.index);
    const prevTx = await client.getTransaction(prevHash);
    if (!prevTx) continue;
    const prevOutput = prevTx.transaction.outputs[prevIdx];
    if (!prevOutput?.type) continue;
    if (prevOutput.type.codeHash.toLowerCase() !== codeHash) continue;
    if (prevOutput.type.args.toLowerCase() !== args) continue;
    const data = prevTx.transaction.outputsData[prevIdx];
    return ccc.Cell.from({
      outPoint: { txHash: prevHash, index: prevIdx },
      cellOutput: prevOutput,
      outputData: data,
    });
  }
  return null;
}

function decodeEntry(
  cell: ccc.Cell,
  blockNumber?: ccc.Num,
): HistoryEntry | null {
  try {
    const data = DidCkbData.decode(cell.outputData);
    if (data.type !== "DidCkbDataV1") return null;
    const document = decodeDocument(data.value.document);
    return {
      action: "UPDATE",
      txHash: cell.outPoint.txHash,
      outputIndex: cell.outPoint.index,
      blockNumber,
      capacity: cell.cellOutput.capacity,
      document,
      localId: data.value.localId,
    };
  } catch (err) {
    console.warn("Skipping unparseable cell in history walk", err);
    return null;
  }
}
