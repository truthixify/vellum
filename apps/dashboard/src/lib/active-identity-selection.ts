import type { DidRecord } from "@/lib/did-ckb";

export function chooseActiveDid(
  records: DidRecord[],
  selectedDid: string | null,
  storedDid: string | null,
): string | null {
  if (storedDid && records.some((record) => record.did === storedDid)) return storedDid;
  if (selectedDid && records.some((record) => record.did === selectedDid)) return selectedDid;
  return records[0]?.did ?? null;
}
