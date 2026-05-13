export {
  DID_CKB_MAINNET,
  DID_CKB_TESTNET,
  deploymentForClient,
  didCkbCellDep,
  didCkbTypeScript,
  type DidCkbDeployment,
} from "./deployment";

export { base32Decode, base32Encode } from "./base32";

export {
  argsToDid,
  computeDidArgs,
  didToArgs,
  isDidCkb,
} from "./identifier";

export {
  DidCkbData,
  DidCkbDataV1,
  DidCkbWitness,
  PlcAuthorization,
} from "./molecule";

export {
  buildDocument,
  decodeDocument,
  defaultAvatarUrl,
  DEFAULT_AVATAR_BASE,
  encodeDocument,
  extractProfile,
  isDefaultAvatar,
  PROFILE_SERVICE_KEY,
  PROFILE_SERVICE_TYPE,
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

export {
  fetchPlcLog,
  getGenesisOperation,
  getRotationKeys,
  parseDidKey,
  signRotationHash,
  verifyPrivateKeyMatch,
  type Curve,
  type PlcOperation,
  type PlcRotationKey,
} from "./plc";

export {
  findDidCell,
  listDidsByLock,
  resolveDid,
  type DidRecord,
} from "./resolver";

export {
  getDidHistory,
  type HistoryAction,
  type HistoryEntry,
} from "./history";
