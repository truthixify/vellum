import { ccc } from "@ckb-ccc/core";
import {
  getDidCkbHistory,
  type HistoryAction as UpstreamHistoryAction,
  type HistoryEntry as UpstreamHistoryEntry,
} from "@ckb-ccc/did-ckb";

export type HistoryAction = UpstreamHistoryAction;
export type HistoryEntry = UpstreamHistoryEntry;

/**
 * Wrap upstream's object-args `getDidCkbHistory` in the fork's positional
 * signature. Route code passes (client, args, liveCell) exactly as before.
 */
export function getDidHistory(
  client: ccc.Client,
  args: ccc.Hex,
  liveCell?: ccc.Cell,
): Promise<HistoryEntry[]> {
  return getDidCkbHistory({ client, id: args, liveCell });
}
