// Vellum's did:ckb integration layer. Wraps @ckb-ccc/did-ckb with the
// Vellum-specific profile schema (services.profile / VellumProfile), a
// 200-CKB capacity reserve on every mint, and a DidRecord shape that carries
// the decoded document and extracted profile alongside the raw cell.
//
// Import from "@/lib/did-ckb" in route code, not from "@ckb-ccc/did-ckb"
// directly, so schema conventions stay in one place.

export {
  DEFAULT_AVATAR_BASE,
  PROFILE_SERVICE_KEY,
  PROFILE_SERVICE_TYPE,
  buildDocument,
  defaultAvatarUrl,
  extractProfile,
  isDefaultAvatar,
  type DidDocument,
  type Services,
  type VellumProfile,
  type VerificationMethods,
} from "./profile";

export {
  buildCreateTx,
  buildDeactivateTx,
  buildMigrationTx,
  buildUpdateTx,
  type CreateTxInput,
  type CreateTxResult,
  type MigrationInput,
  type UpdateTxInput,
} from "./transactions";

export { findDidCell, listDidsByLock, resolveDid, type DidRecord } from "./resolver";

export { getDidHistory, type HistoryAction, type HistoryEntry } from "./history";

// Pass-through re-exports for identifier helpers used by routes.
export { argsToDid, didToArgs, isDidCkb } from "@ckb-ccc/did-ckb";

// PLC helpers used by the migrate flow.
export * as plc from "@ckb-ccc/did-ckb/plc";
